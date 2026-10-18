/**
 * Browser side of POST /api/answer/stream: parse the SSE frames into
 * AdvisorEvents. Frames can arrive split across network chunks; malformed
 * lines are skipped. Client-safe.
 */
import type { AdvisorEvent, AdvisorRequest } from '../types';

export const ANSWER_ENDPOINT = '/api/answer/stream';

/** Parse complete frames out of `buffer`; `rest` is an unfinished frame to keep. */
export function parseSse(buffer: string): { events: AdvisorEvent[]; rest: string } {
  const events: AdvisorEvent[] = [];
  const normalised = buffer.replace(/\r\n?/g, '\n');
  const frames = normalised.split('\n\n');
  const rest = frames.pop() ?? '';
  for (const frame of frames) {
    const data = frame
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    try {
      const evt = JSON.parse(data) as AdvisorEvent;
      if (evt && typeof evt === 'object' && typeof evt.type === 'string') events.push(evt);
    } catch {
      // skip a malformed frame
    }
  }
  return { events, rest };
}

export class AdvisorHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`advisor request failed (${status})`);
    this.status = status;
  }
}

/** POST a question and call `onEvent` for every event until the stream ends. */
export async function streamAdvisor(
  body: AdvisorRequest,
  { signal, onEvent, endpoint = ANSWER_ENDPOINT }: { signal?: AbortSignal; onEvent: (evt: AdvisorEvent) => void; endpoint?: string },
): Promise<void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new AdvisorHttpError(res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const evt of parsed.events) onEvent(evt);
  }
  buffer += decoder.decode();
  if (buffer.trim()) for (const evt of parseSse(`${buffer}\n\n`).events) onEvent(evt);
}
