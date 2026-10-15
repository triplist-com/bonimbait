import 'server-only';

/**
 * POST /api/answer/stream: the advisor's answer pipeline (protocol in
 * lib/advisor/types.ts).
 *
 *   guards (rate limit, daily AI budget)        -> before any work
 *   standalone query for follow-ups             -> lib/advisor/rewrite*.ts
 *   retrieval                                   -> `sources` event, before the model call
 *   nothing close in the library                -> honest refusal, no model call
 *   Claude Sonnet 5.5, streamed                 -> `chunk` events (follow-up trailer held back)
 *   citations, follow-ups, pros, share signature -> `done`
 *
 * Usage is recorded per model on every path that spent tokens (including an
 * interrupted stream); `answer_completed` carries the retrieval-quality props
 * the Command Center reads. Signed-in members get the turn saved to their thread.
 */
import type { NextRequest } from 'next/server';
import { matchPros } from '@/app/api/_lib/pros';
import { trackServer } from '@/lib/analytics/server';
import { AI_RATE_LIMITED_MESSAGE, AI_UNAVAILABLE_MESSAGE, checkAiBudget, recordAiUsage } from '@/lib/guard/aiBudget';
import { rateLimit } from '@/lib/guard/rateLimit';
import { EXAMPLE_QUESTIONS } from '@/lib/home/questions';
import { wantsNumbers } from '@/lib/knowledge/moments';
import { clientIpFromHeaders, hashIp } from '@/lib/leads/spam';
import { isDemoRequest } from '@/lib/platform/paths';
import type { ProsCta } from '@/lib/types';
import { citedNumbers, citedSourceIds } from './citations';
import { ANSWER_COST_ESTIMATE_USD, ANSWER_MODEL, PROS_WAIT_MS } from './config';
import { AnswerStreamError, streamAnswer, type ModelUsagePart } from './model';
import { postsMeta } from './posts-meta';
import { SYSTEM_PROMPT, buildUserTurn, historyMessages, type PromptSource } from './prompt';
import { parseAdvisorRequest } from './request';
import { retrieve, type Retrieval } from './retrieve';
import { standaloneQuery, type StandaloneQuery } from './rewrite-model';
import { signShare } from './share';
import { memberFromRequest, saveMemberTurn, type Member } from './threads';
import { TrailerSplitter } from './trailer';
import type {
  AdvisorConfidence,
  AdvisorDegraded,
  AdvisorEvent,
  AdvisorPros,
  AdvisorRefusal,
  AdvisorRequest,
  AdvisorSharePayload,
  AdvisorSource,
} from './types';

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

/** Shown when nothing in the library is close to the question. */
export const NO_ANSWER_MESSAGE =
  'על זה עוד אין לנו תשובה מהשטח: לא מצאנו את הנושא בסרטונים, בפודקאסט או במאמרים של בונים בית, ולא נרצה לנחש. ' +
  'אנחנו עונים על שאלות על בניית בית פרטי בישראל: תכנון, היתרים, תקציב, קבלנים, שלד, תשתיות וגמרים. ' +
  'נסו לנסח את השאלה אחרת, או קבעו פגישת ייעוץ ללא עלות ונבדוק אותה יחד.';

/** Shown when the model declined to answer (safety classifiers). */
export const REFUSED_MESSAGE = 'על השאלה הזו לא נוכל לענות כאן. נסו לנסח אותה אחרת, או דברו איתנו ישירות בפגישת ייעוץ ללא עלות.';

/** Questions offered when there is no answer: the ones the library covers best. */
const SAFE_FOLLOWUPS = [EXAMPLE_QUESTIONS[0], EXAMPLE_QUESTIONS[1], EXAMPLE_QUESTIONS[5]].filter(Boolean).map((q) => q.text);

const NO_CONFIDENCE: AdvisorConfidence = { score: 0, level: 'low', topSimilarity: 0 };

function sse(evt: AdvisorEvent): string {
  return `data: ${JSON.stringify(evt)}\n\n`;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A whole answer without retrieval or a model call (rate-limited): the legacy chunk + done shape. */
function shortAnswer(message: string, degraded: AdvisorDegraded): Response {
  const done: AdvisorEvent = {
    type: 'done',
    sources: [],
    followups: [],
    confidence: 0,
    confidence_detail: NO_CONFIDENCE,
    pros: null,
    intent: { cost: false },
    degraded,
  };
  return new Response(sse({ type: 'chunk', content: message }) + sse(done), {
    status: 200,
    headers: { ...SSE_HEADERS, 'X-BB-Degraded': degraded },
  });
}

function prosForClient(p: ProsCta | null): AdvisorPros | null {
  if (!p || p.pros.length === 0) return null;
  return { specialty: p.specialty, pros: p.pros, region: p.region ?? null };
}

/** Dates and images of article sources, into both the cards and the prompt. */
async function withPostDates(r: Retrieval): Promise<{ sources: AdvisorSource[]; prompt: PromptSource[] }> {
  const slugs = r.sources.filter((s) => s.kind === 'post').map((s) => (s.kind === 'post' ? s.slug : ''));
  if (slugs.length === 0) return { sources: r.sources, prompt: r.prompt };
  const meta = await postsMeta(slugs);
  const sources = r.sources.map((s) => {
    if (s.kind !== 'post') return s;
    const m = meta.get(s.slug);
    return m ? { ...s, published_at: m.published_at, image: m.image } : s;
  });
  const prompt = r.prompt.map((p, i) => {
    const s = sources[i];
    return s && s.kind === 'post' ? { ...p, publishedAt: s.published_at } : p;
  });
  return { sources, prompt };
}

function raceTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)))]).finally(() => clearTimeout(timer));
}

export async function handleAdvisorStream(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid json' });
  }
  const req = parseAdvisorRequest(body);
  if (!req) return json(400, { error: 'empty query' });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'ANTHROPIC_API_KEY not set' });

  const startedAt = Date.now();
  const isDemo = isDemoRequest(request);
  const history = req.history ?? [];
  const turn = req.turn ?? history.length + 1;
  const turnProps = { turn, ...(req.conversation_id ? { conversation_id: req.conversation_id } : {}) };
  const requested = trackServer('answer_requested', { query: req.query, ...(req.origin ? { origin: req.origin } : {}), ...turnProps }, { request });

  // Guards, before any work: per-visitor rate limit, then the daily AI budget.
  const limited = await rateLimit('ai_answer', hashIp(clientIpFromHeaders(request.headers)));
  if (!limited.ok) {
    await requested;
    return shortAnswer(AI_RATE_LIMITED_MESSAGE, 'rate_limited');
  }
  const budget = await checkAiBudget({ estimateUsd: ANSWER_COST_ESTIMATE_USD });
  const degraded: AdvisorDegraded | null = budget.ok ? null : budget.reason === 'disabled' ? 'disabled' : 'budget';

  // Members: resolve the session while retrieval runs (no cookie, no round trip).
  const memberP: Promise<Member | null> = degraded ? Promise.resolve(null) : memberFromRequest(request);
  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  request.signal?.addEventListener?.('abort', onClientAbort);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (evt: AdvisorEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(sse(evt)));
        } catch {
          open = false; // the visitor left
        }
      };

      let usageParts: ModelUsagePart[] = [];
      let completed: null | {
        kind: 'answer' | 'refusal';
        answer: string;
        sources: AdvisorSource[];
        followups: string[];
        confidence: AdvisorConfidence;
        refused?: AdvisorRefusal;
        degraded?: AdvisorDegraded;
        pros: AdvisorPros | null;
        cited: number;
      } = null;
      let sq: StandaloneQuery = { query: req.query, rewritten: false, via: 'none' };
      let firstTokenAt = 0;
      let modelName: string = ANSWER_MODEL;

      try {
        sq = degraded ? { query: req.query, rewritten: false, via: 'none' } : await standaloneQuery(req.query, history, { isDemo });
        const intent = { cost: wantsNumbers(sq.query) || wantsNumbers(req.query) };
        // The pros CTA runs alongside retrieval and the answer (skipped when degraded).
        const prosP: Promise<ProsCta | null> =
          degraded || req.dryRun ? Promise.resolve(null) : matchPros(sq.query, { isDemo, regionSlug: req.region });

        const r = await retrieve(sq.query, { focus: req.focus });
        const refused = r.confidence.refuse && !degraded;
        const confidence: AdvisorConfidence = { score: r.confidence.score, level: r.confidence.level, topSimilarity: r.confidence.topSimilarity };
        send({
          type: 'sources',
          sources: refused ? [] : r.sources,
          stats: refused ? { moments: 0, videos: 0, articles: 0 } : r.stats,
          confidence,
          query: sq.query,
          rewritten: sq.rewritten,
        });

        if (degraded) {
          // Over budget or AI switched off: the sources, a friendly message, no model call.
          send({ type: 'chunk', content: budget.message ?? AI_UNAVAILABLE_MESSAGE });
          send({ type: 'done', sources: r.sources, followups: [], confidence: confidence.score, confidence_detail: confidence, pros: null, intent, degraded });
          return;
        }

        if (refused) {
          // Nothing in the library is close: say so honestly; offer what we do cover.
          send({ type: 'chunk', content: NO_ANSWER_MESSAGE });
          const followups = SAFE_FOLLOWUPS;
          send({ type: 'done', sources: [], followups, confidence: confidence.score, confidence_detail: confidence, pros: null, intent, refused: 'low_confidence' });
          completed = { kind: 'refusal', answer: NO_ANSWER_MESSAGE, sources: [], followups, confidence, refused: 'low_confidence', pros: null, cited: 0 };
          return;
        }

        const { sources, prompt } = await withPostDates(r);
        const userTurn = buildUserTurn({
          question: req.query,
          sources: prompt,
          focus: r.focusTitle && req.focus ? { kind: req.focus.kind, title: r.focusTitle } : null,
          weak: r.confidence.level === 'low',
        });
        if (req.dryRun) {
          send({ type: 'debug', system: SYSTEM_PROMPT, system_chars: SYSTEM_PROMPT.length, user_turn: userTurn, user_chars: userTurn.length });
          send({ type: 'done', sources, followups: [], confidence: confidence.score, confidence_detail: confidence, pros: null, intent });
          return;
        }
        const splitter = new TrailerSplitter();
        const outcome = await streamAnswer(
          {
            system: SYSTEM_PROMPT,
            messages: [...historyMessages(history), { role: 'user', content: userTurn }],
            signal: abort.signal,
          },
          (delta) => {
            const visible = splitter.push(delta);
            if (!visible) return;
            if (!firstTokenAt) firstTokenAt = Date.now();
            send({ type: 'chunk', content: visible });
          },
        );
        usageParts = outcome.parts;
        modelName = outcome.model;
        const tail = splitter.end();
        if (tail) send({ type: 'chunk', content: tail });

        if (outcome.stopReason === 'refusal') {
          // Declined (also after any fallback): discard the partial answer.
          send({ type: 'reset' });
          send({ type: 'chunk', content: REFUSED_MESSAGE });
          send({ type: 'done', sources, followups: SAFE_FOLLOWUPS, confidence: confidence.score, confidence_detail: confidence, pros: null, intent, degraded: 'refusal' });
          return;
        }

        const answer = splitter.answer;
        if (splitter.outOfScope) {
          // The model judged the question to be outside home building: no sources, no pros.
          const followups = splitter.followups(req.query);
          send({ type: 'done', sources: [], followups, confidence: confidence.score, confidence_detail: confidence, pros: null, intent, refused: 'out_of_scope' });
          completed = { kind: 'refusal', answer, sources: [], followups, confidence, refused: 'out_of_scope', pros: null, cited: 0 };
          return;
        }
        const cited = citedNumbers(answer, sources.length);
        const finalSources = sources.map((s) => ({ ...s, cited: cited.includes(s.n) }));
        const followups = splitter.followups(req.query);
        const pros = prosForClient(await raceTimeout(prosP, PROS_WAIT_MS, null));
        const payload: AdvisorSharePayload = { v: 1, question: req.query, answer, sources: finalSources, followups, at: new Date().toISOString() };
        const signature = answer ? signShare(payload) : null;
        send({
          type: 'done',
          sources: finalSources,
          followups,
          confidence: confidence.score,
          confidence_detail: confidence,
          pros,
          intent,
          ...(signature ? { share: { payload, signature } } : {}),
        });
        completed = { kind: 'answer', answer, sources: finalSources, followups, confidence, pros, cited: cited.length };
      } catch (err) {
        if (err instanceof AnswerStreamError) usageParts = err.parts;
        if (!abort.signal.aborted) console.error('[advisor] answer failed:', err instanceof Error ? err.message : err);
        send({ type: 'error', message: 'stream interrupted' });
      } finally {
        request.signal?.removeEventListener?.('abort', onClientAbort);
        // Never throw from here: budget, analytics and the member's thread.
        let costUsd = 0;
        let outputTokens = 0;
        for (const part of usageParts) {
          if (part.usage.inputTokens + part.usage.outputTokens + (part.usage.cacheReadTokens ?? 0) === 0) continue;
          const recorded = await recordAiUsage({ route: 'answer_stream', model: part.model, usage: part.usage, isDemo });
          costUsd += recorded.costUsd;
          outputTokens += part.usage.outputTokens;
        }
        if (completed) {
          const c = completed;
          await trackServer(
            'answer_completed',
            {
              query: req.query,
              sources: c.sources.length,
              confidence: c.confidence.score,
              latency_ms: Date.now() - startedAt,
              model: usageParts.length > 0 ? modelName : 'none',
              has_pros: Boolean(c.pros),
              output_tokens: outputTokens,
              cost_usd: Math.round(costUsd * 1e6) / 1e6,
              top_similarity: c.confidence.topSimilarity,
              n_sources: c.sources.length,
              cited: c.cited,
              ...(c.cited > 0 ? { source_ids: citedSourceIds(c.sources) } : {}),
              ...(c.refused ? { refused: c.refused } : {}),
              rewritten: sq.rewritten,
              ...(sq.rewritten ? { standalone_query: sq.query } : {}),
              followups: c.followups.length,
              ...(req.focus ? { focus: req.focus.kind } : {}),
              ...(req.origin ? { origin: req.origin } : {}),
              ...(firstTokenAt ? { first_token_ms: firstTokenAt - startedAt } : {}),
              ...turnProps,
            },
            { request },
          );
          if (c.kind === 'answer' && req.conversation_id) {
            const member = await memberP;
            if (member) {
              await saveMemberTurn(member, {
                conversationId: req.conversation_id,
                turn,
                question: req.query,
                answer: c.answer,
                sources: c.sources,
                followups: c.followups,
                confidence: c.confidence.score,
                isDemo,
              });
            }
          }
        }
        await requested;
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: degraded ? { ...SSE_HEADERS, 'X-BB-Degraded': degraded } : SSE_HEADERS,
  });
}

export type { AdvisorRequest };
