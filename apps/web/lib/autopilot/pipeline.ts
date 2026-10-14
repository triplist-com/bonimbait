import 'server-only';

import { CaptionsUnavailableError, captionsMissMessage, fetchYoutubeCaptions, type FetchedCaptions } from './captions';
import { chunkCues } from './chunk';
import { getBudgetGuard, type AutopilotBudgetGuard } from './cost';
import { embedTexts, toVectorLiteral, type EmbedResult } from './embed';
import { embeddingCostMicros, estimateTokens } from './pricing';
import { IN_PROGRESS, PROCESSABLE, isStale } from './status';
import type { SourceStore } from './store';
import { estimateSummaryMicros, summarizeTranscript, usageOf, type SummaryInput, type SummaryResult } from './summarize';
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
  fetchCaptions?: (videoId: string) => Promise<FetchedCaptions>;
  embed?: (texts: string[]) => Promise<EmbedResult>;
  summarize?: (input: SummaryInput) => Promise<SummaryResult>;
  guard?: AutopilotBudgetGuard;
  now?: () => Date;
}

export type ProcessCode = 'not_found' | 'busy' | 'not_processable' | 'race' | 'needs_transcript' | 'budget' | 'failed';

export type ProcessOutcome =
  | { ok: true; status: SourceStatus; message: string; costMicros: number }
  | { ok: false; code: ProcessCode; status: SourceStatus | null; error: string; costMicros: number };

const RACE = 'הפריט עודכן במקביל (אולי בלשונית אחרת). רעננו את הדף.';

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 500);
}

function sumMicros(usage: readonly UsageEntry[]): number {
  return usage.reduce((n, u) => n + u.usd_micros, 0);
}

/** Process a source as far as it can go (to `indexed`, or to the step that needs a person). */
export async function processSource(id: string, deps: PipelineDeps): Promise<ProcessOutcome> {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());

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

  if (!src.transcript_cues?.length) {
    const transcribed = await transcribeStep(src, deps);
    if (!transcribed.ok) return transcribed;
    src = transcribed.source;
  }
  return indexStep(src, deps, now);
}

async function transcribeStep(
  src: KnowledgeSourceRow,
  deps: PipelineDeps,
): Promise<{ ok: true; source: KnowledgeSourceRow } | Extract<ProcessOutcome, { ok: false }>> {
  const { store } = deps;
  const started = await store.transition(src.id, src.status, 'transcribing', { error: null, attempts: src.attempts + 1 });
  if (!started) return { ok: false, code: 'race', status: null, error: RACE, costMicros: 0 };

  try {
    if (started.kind !== 'youtube') {
      throw new CaptionsUnavailableError('no_captions', 'Only YouTube videos have captions to fetch');
    }
    const caps = await (deps.fetchCaptions ?? fetchYoutubeCaptions)(started.external_id);
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

async function indexStep(src: KnowledgeSourceRow, deps: PipelineDeps, now: () => Date): Promise<ProcessOutcome> {
  const { store } = deps;
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

  // failed -> transcribed -> summarizing (a failed row keeps its transcript).
  let from: SourceStatus = src.status;
  if (from === 'failed' || from === 'needs_transcript') {
    const back = await store.transition(src.id, from, 'transcribed', { error: null });
    if (!back) return { ok: false, code: 'race', status: null, error: RACE, costMicros: 0 };
    from = 'transcribed';
  }
  const running = await store.transition(src.id, from, 'summarizing', { error: null });
  if (!running) return { ok: false, code: 'race', status: null, error: RACE, costMicros: 0 };

  const usage: UsageEntry[] = [];
  try {
    if (chunks.length === 0) throw new Error('התמליל ריק');
    const emb = await (deps.embed ?? embedTexts)(chunks.map((c) => c.text));
    usage.push(emb.usage);
    const sum = await (deps.summarize ?? summarizeTranscript)(input);
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
