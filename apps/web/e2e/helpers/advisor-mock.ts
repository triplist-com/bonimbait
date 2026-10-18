/**
 * A $0 stand-in for POST /api/answer/stream: replays the recorded demo answer
 * (lib/demo/fixtures/advisor-recording.json, a real answer with real youtube
 * ids and seconds) as a paced SSE stream, so specs can see the sources arrive
 * before the answer finishes streaming.
 *
 * The `done` event carries the answer signed exactly as lib/advisor/share.ts
 * signs it (the local stack's secret), so "שתפו בוואטסאפ" stores a real
 * /ask/a/<id>/ snapshot through the real POST /api/advisor/share.
 *
 * Usage:
 *   const mock = await startAdvisorMock();
 *   await page.route('**\/api/answer/stream', (r) => r.continue({ url: mock.url }));
 *   ...
 *   await mock.close();
 */
import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import recording from '../../lib/demo/fixtures/advisor-recording.json';
import { shareSecret } from './env';

const CONTEXT = 'bonimbait-advisor-share-v1';

/** Same canonical JSON as lib/advisor/share.ts (keys sorted at every level). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export interface AdvisorMock {
  url: string;
  /** Questions received, in order. */
  questions: string[];
  close: () => Promise<void>;
}

export interface AdvisorMockOptions {
  /** Delay before the sources event (ms). */
  sourcesDelayMs?: number;
  /** Delay between answer chunks (ms). */
  chunkDelayMs?: number;
}

type Rec = typeof recording;

export function recordedQuestion(): string {
  return (recording as Rec).question;
}

export function recordedFollowups(): string[] {
  return [...(recording as Rec).followups];
}

/** The first video source and its first moment (the "▶ צפו מ-" button). */
export function recordedFirstMoment(): { youtubeId: string; second: number } {
  const v = (recording as Rec).sources.find((s) => s.kind === 'video') as { youtube_id: string; moments: Array<{ second: number }> };
  return { youtubeId: v.youtube_id, second: v.moments[0].second };
}

function frame(evt: unknown): string {
  return `data: ${JSON.stringify(evt)}\n\n`;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function startAdvisorMock(opts: AdvisorMockOptions = {}): Promise<AdvisorMock> {
  const rec = recording as Rec;
  const sourcesDelay = opts.sourcesDelayMs ?? 250;
  const chunkDelay = opts.chunkDelayMs ?? 20;
  const questions: string[] = [];
  const secret = shareSecret();

  const server: Server = createServer(async (req, res) => {
    const body = await readJson(req);
    const question = typeof body.query === 'string' && body.query.trim() ? body.query.trim() : rec.question;
    questions.push(question);
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    await wait(sourcesDelay);
    res.write(frame({ type: 'sources', sources: rec.sources, stats: rec.stats, confidence: rec.confidence, query: question, rewritten: false }));
    for (const c of rec.chunks) {
      await wait(chunkDelay);
      res.write(frame({ type: 'chunk', content: c.text }));
    }
    const payload = { v: 1 as const, question, answer: rec.answer, sources: rec.sources, followups: rec.followups, at: new Date().toISOString() };
    const signature = createHmac('sha256', secret).update(`${CONTEXT}\n${stableStringify(payload)}`).digest('base64url');
    res.write(
      frame({
        type: 'done',
        sources: rec.sources,
        followups: rec.followups,
        confidence: rec.confidence.score,
        confidence_detail: rec.confidence,
        pros: rec.pros,
        intent: rec.intent,
        share: { payload, signature },
      }),
    );
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/answer/stream`,
    questions,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
