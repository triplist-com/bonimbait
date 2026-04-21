import { NextRequest } from 'next/server';
import { semanticSearchSegments, groupByVideo } from '../../_lib/semantic';
import { getVideo } from '../../_lib/data';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';

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

  // Step 1: semantic search over segments
  let hits;
  try {
    hits = await semanticSearchSegments(query, 40);
  } catch (err) {
    console.error('semantic search failed:', err);
    return new Response(
      JSON.stringify({ error: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Pick top segment per video, keep top 5 videos as sources for the answer
  const grouped = groupByVideo(hits);
  const perVideo: Array<{ yt: string; best: (typeof hits)[number] }> = [];
  grouped.forEach((segs, yt) => {
    segs.sort((a, b) => b.score - a.score);
    perVideo.push({ yt, best: segs[0] });
  });
  perVideo.sort((a, b) => b.best.score - a.best.score);
  const topSources = perVideo.slice(0, 5);

  // Build Claude context
  const contextBlocks: string[] = [];
  const sources: Array<{
    video_id: string;
    youtube_id: string;
    title: string;
    timestamp: number;
    relevance_score: number;
  }> = [];

  for (let i = 0; i < topSources.length; i++) {
    const { yt, best } = topSources[i];
    const v = getVideo(yt);
    if (!v) continue;
    const ts = Math.max(0, Math.floor(best.start_time));
    contextBlocks.push(
      `[מקור ${i + 1}] סרטון: ${v.title}\nמתוך דקה ${Math.floor(ts / 60)}:${String(ts % 60).padStart(2, '0')}\n${best.text.slice(0, 900)}`,
    );
    sources.push({
      video_id: v.id,
      youtube_id: v.youtube_id,
      title: v.title,
      timestamp: best.start_time,
      relevance_score: best.score,
    });
  }

  const avgConfidence =
    sources.length > 0
      ? sources.reduce((a, s) => a + s.relevance_score, 0) / sources.length
      : 0;

  const systemPrompt = `אתה עוזר מומחה בנושאי בנייה של בתים פרטיים בישראל.
המשתמש שואל שאלה ואתה מקבל קטעים רלוונטיים מתוך סרטוני YouTube של ערוץ "בונים בית".
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

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
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
        controller.enqueue(
          encoder.encode(
            sseEvent({ type: 'done', sources, confidence: avgConfidence }),
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
