/**
 * The body of POST /api/answer/stream. Only `query` is required (older
 * clients send just that). Optional fields are validated one by one and a bad
 * one is dropped, never fatal: a follow-up still gets an answer. Pure.
 */
import { z } from 'zod';
import { HISTORY_ANSWER_CHARS, MAX_HISTORY_TURNS, MAX_QUERY_CHARS } from './config';
import type { AdvisorFocus, AdvisorHistoryTurn, AdvisorOrigin, AdvisorRequest } from './types';

const ORIGINS = ['typed', 'followup', 'chip', 'url', 'search', 'video', 'post', 'demo'] as const satisfies readonly AdvisorOrigin[];

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SLUG = /^[^\s/?#]{1,200}$/;

const historySchema = z
  .array(
    z.object({
      q: z.string(),
      a: z.string(),
      sq: z.string().optional(),
    }),
  )
  .max(50);

const focusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('video'), id: z.string().regex(YOUTUBE_ID) }),
  z.object({ kind: z.literal('post'), id: z.string().regex(SLUG) }),
]);

function clean(s: string, max: number): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The validated request, or null when there is no question. */
export function parseAdvisorRequest(body: unknown): AdvisorRequest | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const query = typeof b.query === 'string' ? clean(b.query, MAX_QUERY_CHARS) : '';
  if (!query) return null;

  const out: AdvisorRequest = { query };

  const history = historySchema.safeParse(b.history);
  if (history.success) {
    const turns: AdvisorHistoryTurn[] = history.data
      .map((t) => ({
        q: clean(t.q, MAX_QUERY_CHARS),
        a: t.a.trim().slice(0, HISTORY_ANSWER_CHARS),
        ...(t.sq ? { sq: clean(t.sq, MAX_QUERY_CHARS) } : {}),
      }))
      .filter((t) => t.q && t.a)
      .slice(-MAX_HISTORY_TURNS);
    if (turns.length > 0) out.history = turns;
  }

  if (typeof b.conversation_id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(b.conversation_id)) {
    out.conversation_id = b.conversation_id;
  }
  if (typeof b.turn === 'number' && Number.isInteger(b.turn) && b.turn >= 1 && b.turn <= 1000) out.turn = b.turn;
  if (typeof b.origin === 'string' && (ORIGINS as readonly string[]).includes(b.origin)) out.origin = b.origin as AdvisorOrigin;

  const focus = focusSchema.safeParse(b.focus);
  if (focus.success) out.focus = focus.data as AdvisorFocus;

  if (typeof b.region === 'string' && /^[a-z0-9-]{2,40}$/.test(b.region)) out.region = b.region;
  // Development only: retrieval and the prompt, without the model call (evaluation at $0).
  if (b.dry_run === true && process.env.NODE_ENV !== 'production') out.dryRun = true;
  return out;
}
