import { NextRequest } from 'next/server';
import { semanticSearch, type PostHit, type SearchHit, type SegmentHit } from '../../_lib/semantic';
import { getVideo } from '../../_lib/data';
import { matchPros } from '../../_lib/pros';
import type { ProsCta } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const MAX_DOCS = 5; // videos + articles fed to the model and shown as sources
// Article chunks are cleaner text than transcripts and outrank them, so cap
// them to keep video sources in the answer. Unused slots go back to articles.
const MAX_POST_DOCS = 3;
const PROS_WAIT_MS = 4000; // how long "done" waits for the pros match after the answer ends

type AnswerSourceOut =
  | {
      kind: 'video';
      video_id: string;
      youtube_id: string;
      title: string;
      timestamp: number;
      relevance_score: number;
    }
  | { kind: 'post'; slug: string; title: string; url: string; relevance_score: number };

function docKey(h: SearchHit): string {
  return h.kind === 'video' ? `v:${h.youtube_id}` : `p:${h.slug}`;
}

function sseEvent(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(request: NextRequest) {
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }
  const query = (body.query || '').trim();
  if (!query) {
    return new Response(JSON.stringify({ error: 'empty query' }), { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500 });
  }

  // The pros CTA runs in parallel with retrieval and the answer stream.
  const prosPromise: Promise<ProsCta | null> = matchPros(query);

  // Step 1: hybrid search over video segments and article chunks
  let hits: SearchHit[];
  try {
    hits = await semanticSearch(query, 80);
  } catch (err) {
    console.error('semantic search failed:', err);
    return new Response(
      JSON.stringify({ error: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Up to 3 top chunks per document (video or article) from the top documents.
  // Several chunks per document help when the key fact (e.g. exact numbers)
  // lives next to the best-ranked chunk.
  const byDoc = new Map<string, SearchHit[]>();
  for (const h of hits) {
    const arr = byDoc.get(docKey(h));
    if (arr) arr.push(h);
    else byDoc.set(docKey(h), [h]);
  }
  const ranked = Array.from(byDoc.values())
    .map((segs) => segs.sort((a, b) => b.score - a.score))
    .sort((a, b) => b[0].score - a[0].score)
    .filter((segs) => segs[0].kind === 'post' || getVideo(segs[0].youtube_id));
  const docs: SearchHit[][] = [];
  let postDocs = 0;
  for (const segs of ranked) {
    if (segs[0].kind === 'post' && postDocs >= MAX_POST_DOCS) continue;
    if (segs[0].kind === 'post') postDocs += 1;
    docs.push(segs);
  }
  for (const segs of ranked) if (!docs.includes(segs)) docs.push(segs);
  docs.splice(MAX_DOCS);
  docs.sort((a, b) => b[0].score - a[0].score);

  const contextBlocks: string[] = [];
  const sources: AnswerSourceOut[] = [];
  let blockIdx = 0;
  for (const segs of docs) {
    // All chunks of one document share its kind.
    const top = segs[0];
    if (top.kind === 'video') {
      const videoSegs = segs as SegmentHit[];
      const v = getVideo(top.youtube_id)!;
      for (const s of videoSegs.slice(0, 3)) {
        blockIdx += 1;
        const ts = Math.max(0, Math.floor(s.start_time));
        contextBlocks.push(
          `[מקור ${blockIdx}] סרטון: ${v.title}\nמתוך דקה ${Math.floor(ts / 60)}:${String(ts % 60).padStart(2, '0')}\n${s.text.slice(0, 800)}`,
        );
      }
      // Source shown to the user = best segment per video (one source per video)
      sources.push({
        kind: 'video',
        video_id: v.id,
        youtube_id: v.youtube_id,
        title: v.title,
        timestamp: top.start_time,
        relevance_score: top.cos,
      });
    } else {
      // Chunks overlap, so keep them in reading order.
      const picked = (segs as PostHit[]).slice(0, 2).sort((a, b) => a.chunk_index - b.chunk_index);
      for (const s of picked) {
        blockIdx += 1;
        // Chunk text starts with the post title, which the header already shows.
        const body = s.text.startsWith(top.title) ? s.text.slice(top.title.length).trim() : s.text;
        contextBlocks.push(`[מקור ${blockIdx}] מאמר: ${top.title}\n${body.slice(0, 1200)}`);
      }
      sources.push({
        kind: 'post',
        slug: top.slug,
        title: top.title,
        url: `/${top.slug}/`,
        relevance_score: top.cos,
      });
    }
  }

  // Confidence on the client's 0..1 scale (high >= 0.7, medium >= 0.4). Top
  // cosines for text-embedding-3-small on Hebrew sit around 0.25-0.6, so map
  // that band linearly: avg cos 0.50 -> high, 0.39 -> medium.
  const avgCos =
    sources.length > 0
      ? sources.reduce((a, s) => a + s.relevance_score, 0) / sources.length
      : 0;
  const avgConfidence = Math.min(1, Math.max(0, (avgCos - 0.25) / 0.35));

  const systemPrompt = `אתה עוזר מומחה בנושאי בנייה של בתים פרטיים בישראל.
המשתמש שואל שאלה ואתה מקבל קטעים רלוונטיים מתוך סרטוני YouTube ומאמרים של "בונים בית".
תפקידך: לענות תשובה קצרה, ממוקדת ומדויקת בעברית, המבוססת אך ורק על המידע בקטעים שסופקו.
- אם המידע בקטעים לא מספיק לתשובה ודאית, אמור זאת במפורש.
- אל תמציא מספרים, חוקים או ציטוטים שלא מופיעים בקטעים.
- ענה ב-2-5 משפטים. תמצית, לא רשימה ארוכה.
- אין צורך לצטט מקורות בתוך הטקסט (המקורות מוצגים בנפרד).`;

  const userPrompt = `שאלה: ${query}

קטעים רלוונטיים:
${contextBlocks.join('\n\n---\n\n')}

ענה בעברית, תמציתית ומבוססת רק על הקטעים לעיל.`;

  // Step 2: stream Claude response and re-emit as SSE in the shape the frontend expects
  const encoder = new TextEncoder();

  // ANTHROPIC_BASE_URL is honored like the SDK does (proxies, local mocks).
  const apiBase = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const upstream = await fetch(`${apiBase}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    console.error('Anthropic error:', upstream.status, text);
    return new Response(
      JSON.stringify({ error: 'תקלה בשירות התשובות. אנא נסו שוב.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload) as {
                type: string;
                delta?: { type: string; text?: string };
              };
              if (
                evt.type === 'content_block_delta' &&
                evt.delta?.type === 'text_delta' &&
                evt.delta.text
              ) {
                controller.enqueue(
                  encoder.encode(sseEvent({ type: 'chunk', content: evt.delta.text })),
                );
              }
            } catch {
              // ignore malformed
            }
          }
        }
        const pros = await Promise.race([
          prosPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), PROS_WAIT_MS)),
        ]);
        controller.enqueue(
          encoder.encode(
            sseEvent({ type: 'done', sources, confidence: avgConfidence, pros }),
          ),
        );
      } catch (err) {
        console.error('stream error:', err);
        controller.enqueue(
          encoder.encode(sseEvent({ type: 'error', message: 'stream interrupted' })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
