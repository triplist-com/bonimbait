import 'server-only';

import { CaptionsUnavailableError, captionsMissMessage, fetchYoutubeCaptions, type FetchedCaptions } from './captions';
import { chunkCues } from './chunk';
import { FUNCTION_BUDGET_MS, INDEX_MIN_MS } from './config';
import { getBudgetGuard, type AutopilotBudgetGuard } from './cost';
import { embedTexts, toVectorLiteral, type EmbedOptions, type EmbedResult } from './embed';
import { embeddingCostMicros, estimateTokens } from './pricing';
import { IN_PROGRESS, PROCESSABLE, isStale } from './status';
import type { SourceStore } from './store';
import {
  estimateSummaryMicros,
  summarizeTranscript,
  usageOf,
  type SummarizeOptions,
  type SummaryInput,
  type SummaryResult,
} from './summarize';
import { cuesToText } from './transcript';
import type { KnowledgeSourceRow, SourceStatus, UsageEntry } from './types';

/**
 * Content Autopilot processing for one source:
 *
 *   transcript (YouTube captions; else needs_transcript)  ->  chunk (static
 *   segmenter parameters)  ->  embed  ->  Claude summary  ->  indexed
 *
 * Publishing stays a separate, human step. Every status change is a
 * compare-and-set, every paid step is budget-checked first, and spend is
 * stored on the row (cost_usd_micros + usage) even when a later step fails.
 */

export interface PipelineDeps {
  store: SourceStore;
  fetchCaptions?: (videoId: string, opts: { deadline: number }) => Promise<FetchedCaptions>;
  embed?: (texts: string[], opts: EmbedOptions) => Promise<EmbedResult>;
  summarize?: (input: SummaryInput, opts: SummarizeOptions) => Promise<SummaryResult>;
  guard?: AutopilotBudgetGuard;
  now?: () => Date;
  /**
   * Epoch ms by which this request must be done (default: now + FUNCTION_BUDGET_MS).
   * Step timeouts are sized to it, so spend is recorded before the platform's limit.
   */
  deadline?: number;
}

export type ProcessCode = 'not_found' | 'busy' | 'not_processable' | 'race' | 'needs_transcript' | 'budget' | 'failed';

export type ProcessOutcome =
  /** next: 'index' when the time budget ran out after transcription: call again to index. */
  | { ok: true; status: SourceStatus; message: string; costMicros: number; next?: 'index' }
  | { ok: false; code: ProcessCode; status: SourceStatus | null; error: string; costMicros: number };

const RACE = 'הפריט עודכן במקביל (אולי בלשונית אחרת). רעננו את הדף.';

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 500);
}

function sumMicros(usage: readonly UsageEntry[]): number {
  return usage.reduce((n, u) => n + u.usd_micros, 0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Process a source as far as it can go (to `indexed`, or to the step that needs a person). */
export async function processSource(id: string, deps: PipelineDeps): Promise<ProcessOutcome> {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const deadline = deps.deadline ?? Date.now() + FUNCTION_BUDGET_MS;

  let src = await store.get(id);
  if (!src) return { ok: false, code: 'not_found', status: null, error: 'הפריט לא נמצא.', costMicros: 0 };

  // A step cut off mid-way (function timeout, crash) is recovered as failed.
  if (IN_PROGRESS.has(src.status)) {
    if (!isStale(src.status, src.updated_at, now().getTime())) {
      return { ok: false, code: 'busy', status: src.status, error: 'העיבוד כבר רץ. המתינו כדקה ורעננו.', costMicros: 0 };
    }
    const recovered = await store.transition(id, src.status, 'failed', { error: 'עיבוד קודם נקטע באמצע.' });
    if (!recovered) return { ok: false, code: 'race', status: null, error: RACE, costMicros: 0 };
    src = recovered;
  }
  if (!PROCESSABLE.has(src.status)) {
    return { ok: false, code: 'not_processable', status: src.status, error: 'אי אפשר לעבד פריט במצב הזה.', costMicros: 0 };
  }

  // One attempt per run: counted by the first step that runs.
  let counted = false;
  if (!src.transcript_cues?.length) {
    const transcribed = await transcribeStep(src, deps, deadline);
    if (!transcribed.ok) return transcribed;
    src = transcribed.source;
    counted = true;
    if (deadline - Date.now() < INDEX_MIN_MS) {
      return { ok: true, status: 'transcribed', message: 'התמליל נשמר. ממשיכים לסיכום ולאינדוקס…', costMicros: 0, next: 'index' };
    }
  }
  return indexStep(src, deps, now, counted, deadline);
}

async function transcribeStep(
  src: KnowledgeSourceRow,
  deps: PipelineDeps,
  deadline: number,
): Promise<{ ok: true; source: KnowledgeSourceRow } | Extract<ProcessOutcome, { ok: false }>> {
  const { store } = deps;
  const started = await store.transition(src.id, src.status, 'transcribing', { error: null, attempts: src.attempts + 1 });
  if (!started) return { ok: false, code: 'race', status: null, error: RACE, costMicros: 0 };

  try {
    if (started.kind !== 'youtube') {
      throw new CaptionsUnavailableError('no_captions', 'Only YouTube videos have captions to fetch');
    }
    const caps = await (deps.fetchCaptions ?? fetchYoutubeCaptions)(started.external_id, { deadline });
    const done = await store.transition(src.id, 'transcribing', 'transcribed', {
      transcript_cues: caps.cues,
      transcript_text: cuesToText(caps.cues),
      transcript_source: caps.source,
      duration_s: started.duration_s ?? caps.durationS,
      error: null,
    });
    if (!done) return { ok: false, code: 'race', status: null, error: RACE, costMicros: 0 };
    return { ok: true, source: done };
  } catch (err) {
    if (err instanceof CaptionsUnavailableError) {
      const message =
        started.kind === 'youtube'
          ? captionsMissMessage(err)
          : 'לפרקים שאינם ביוטיוב אין כתוביות לשלוף: העלו או הדביקו תמליל.';
      await store.transition(src.id, 'transcribing', 'needs_transcript', { error: `${message} [${err.reason}]` });
      return { ok: false, code: 'needs_transcript', status: 'needs_transcript', error: message, costMicros: 0 };
    }
    const message = `שליפת התמליל נכשלה: ${errorText(err)}`;
    await store.transition(src.id, 'transcribing', 'failed', { error: message });
    return { ok: false, code: 'failed', status: 'failed', error: message, costMicros: 0 };
  }
}

async function indexStep(
  src: KnowledgeSourceRow,
  deps: PipelineDeps,
  now: () => Date,
  attemptCounted: boolean,
  deadline: number,
): Promise<ProcessOutcome> {
  const { store } = deps;
  const left = () => deadline - Date.now();
  const cues = src.transcript_cues ?? [];
  const chunks = chunkCues(cues);
  const input: SummaryInput = { title: src.title, durationS: src.duration_s, cues };

  // Budget first: nothing is paid for unless the whole step fits.
  const guard = deps.guard ?? getBudgetGuard(() => store.spentLast30dMicros(now()));
  const estimate =
    embeddingCostMicros(chunks.reduce((n, c) => n + estimateTokens(c.text), 0)) + estimateSummaryMicros(input);
  const label = `${src.kind}:${src.external_id}`;
  const decision = await guard.check({ label, usdMicros: estimate });
  if (!decision.ok) {
    await store.update(src.id, { error: decision.reason });
    return { ok: false, code: 'budget', status: src.status, error: decision.reason, costMicros: 0 };
  }

  // Rows that kept a transcript (failed, restored from skipped) pass through transcribed.
  let from: SourceStatus = src.status;
  if (from !== 'transcribed') {
    const back = await store.transition(src.id, from, 'transcribed', { error: null });
    if (!back) return { ok: false, code: 'race', status: null, error: RACE, costMicros: 0 };
    from = 'transcribed';
  }
  const running = await store.transition(src.id, from, 'summarizing', {
    error: null,
    ...(attemptCounted ? {} : { attempts: src.attempts + 1 }),
  });
  if (!running) return { ok: false, code: 'race', status: null, error: RACE, costMicros: 0 };

  const usage: UsageEntry[] = [];
  try {
    if (chunks.length === 0) throw new Error('התמליל ריק');
    // Leave room for the summary after embedding; retry Claude only when a retry still fits.
    const emb = await (deps.embed ?? embedTexts)(
      chunks.map((c) => c.text),
      { timeoutMs: clamp(left() - 25_000, 5_000, 25_000) },
    );
    usage.push(emb.usage);
    const sum = await (deps.summarize ?? summarizeTranscript)(input, {
      timeoutMs: clamp(left() - 2_000, 8_000, 45_000),
      maxRetries: left() > 95_000 ? 1 : 0,
    });
    usage.push(sum.usage);
    await store.replaceChunks(
      src.id,
      chunks.map((c, k) => ({ ...c, embedding: toVectorLiteral(emb.vectors[k]), tokens: emb.tokens[k] ?? null })),
    );
    const spent = sumMicros(usage);
    const done = await store.transition(src.id, 'summarizing', 'indexed', {
      summary: sum.summary,
      chunk_count: chunks.length,
      cost_usd_micros: running.cost_usd_micros + spent,
      usage: [...(running.usage ?? []), ...usage],
      processed_at: now().toISOString(),
      error: null,
    });
    await guard.record({ label, usdMicros: spent, sourceId: src.id });
    if (!done) return { ok: false, code: 'race', status: null, error: RACE, costMicros: spent };
    return { ok: true, status: 'indexed', message: `נוצרו ${chunks.length} מקטעי חיפוש וסיכום. הסרטון מוכן לפרסום.`, costMicros: spent };
  } catch (err) {
    const billed = usageOf(err);
    if (billed) usage.push(billed);
    const spent = sumMicros(usage);
    const message = `העיבוד נכשל: ${errorText(err)}`;
    await store.transition(src.id, 'summarizing', 'failed', {
      error: message,
      cost_usd_micros: running.cost_usd_micros + spent,
      usage: [...(running.usage ?? []), ...usage],
      processed_at: now().toISOString(),
    });
    if (spent > 0) await guard.record({ label, usdMicros: spent, sourceId: src.id });
    return { ok: false, code: 'failed', status: 'failed', error: message, costMicros: spent };
  }
}
