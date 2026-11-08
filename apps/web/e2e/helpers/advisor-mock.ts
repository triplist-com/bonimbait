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
 * It runs inside the page: an init script swaps `fetch` for that one endpoint
 * and streams the frames Node builds (exposeFunction). Rerouting the request
 * to a local mock server with route.continue({ url }) gets blocked by Chromium
 * on the app's pages (net::ERR_BLOCKED_BY_CLIENT), and route.fulfill can't
 * stream, which would hide the "still streaming" state the specs check.
 *
 * Usage (before the first navigation):
 *   const mock = await installAdvisorMock(page);
 *   ...
 *   expect(mock.questions).toEqual([...]);
 */
import { createHmac } from 'node:crypto';
import type { Page } from '@playwright/test';
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
  /** Questions received, in order. */
  questions: string[];
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

/** One answer as the page streams it: each frame after its delay (ms). */
interface StreamPlan {
  frames: string[];
  delays: number[];
}

const BRIDGE = '__e2eAdvisorAnswer';

/**
 * Serve POST /api/answer/stream from the recording on this page (and every
 * later navigation of it). Install it before the first goto.
 */
export async function installAdvisorMock(page: Page, opts: AdvisorMockOptions = {}): Promise<AdvisorMock> {
  const rec = recording as Rec;
  const sourcesDelay = opts.sourcesDelayMs ?? 250;
  const chunkDelay = opts.chunkDelayMs ?? 20;
  const questions: string[] = [];
  const secret = shareSecret();

  await page.exposeFunction(BRIDGE, (rawBody: string): StreamPlan => {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      // Not JSON: answer the recorded question.
    }
    const question = typeof body.query === 'string' && body.query.trim() ? body.query.trim() : rec.question;
    questions.push(question);

    const frames: string[] = [];
    const delays: number[] = [];
    const push = (evt: unknown, delay: number) => {
      frames.push(frame(evt));
      delays.push(delay);
    };
    push({ type: 'sources', sources: rec.sources, stats: rec.stats, confidence: rec.confidence, query: question, rewritten: false }, sourcesDelay);
    for (const c of rec.chunks) push({ type: 'chunk', content: c.text }, chunkDelay);
    const payload = { v: 1 as const, question, answer: rec.answer, sources: rec.sources, followups: rec.followups, at: new Date().toISOString() };
    const signature = createHmac('sha256', secret).update(`${CONTEXT}\n${stableStringify(payload)}`).digest('base64url');
    push(
      {
        type: 'done',
        sources: rec.sources,
        followups: rec.followups,
        confidence: rec.confidence.score,
        confidence_detail: rec.confidence,
        pros: rec.pros,
        intent: rec.intent,
        share: { payload, signature },
      },
      0,
    );
    return { frames, delays };
  });

  await page.addInitScript((bridge: string) => {
    const w = window as unknown as Record<string, unknown> & { fetch: typeof fetch };
    const realFetch = w.fetch.bind(window);
    w.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url, location.href).pathname !== '/api/answer/stream') return realFetch(input, init);
      const signal = init?.signal ?? undefined;
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      const rawBody = typeof init?.body === 'string' ? init.body : '';
      const plan = (await (w[bridge] as (b: string) => Promise<StreamPlan>)(rawBody)) as StreamPlan;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (let i = 0; i < plan.frames.length; i++) {
            await new Promise((r) => setTimeout(r, plan.delays[i]));
            if (signal?.aborted) {
              controller.error(new DOMException('The operation was aborted.', 'AbortError'));
              return;
            }
            controller.enqueue(encoder.encode(plan.frames[i]));
          }
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
    };
  }, BRIDGE);

  return { questions };
}
