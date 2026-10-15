import 'server-only';

import { canTransition, effectiveStatus } from './status';
import type { SourceStore } from './store';
import { normalizeSummary, type RawSummary } from './summary';
import { cuesToText } from './transcript';
import type { Cue, KnowledgeSourceRow, SourceStatus, SourceSummary, TranscriptSource, UsageEntry } from './types';

/**
 * Staff operations on a source (server actions and admin routes wrap these
 * with auth and revalidation). Each one is a compare-and-set on the status
 * read just before, so a stale tab cannot overwrite a newer state.
 */

export class ManageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManageError';
  }
}

const RACE = 'הפריט עודכן במקביל. רעננו את הדף ונסו שוב.';

async function load(store: SourceStore, id: string): Promise<KnowledgeSourceRow> {
  const src = await store.get(id);
  if (!src) throw new ManageError('הפריט לא נמצא.');
  return src;
}

async function move(store: SourceStore, src: KnowledgeSourceRow, to: SourceStatus, patch: Parameters<SourceStore['transition']>[3] = {}) {
  // Stale in-progress rows are recovered through failed first.
  let from = src.status;
  if (effectiveStatus(src.status, src.updated_at) === 'failed' && from !== 'failed') {
    const failed = await store.transition(src.id, from, 'failed', { error: 'עיבוד קודם נקטע באמצע.' });
    if (!failed) throw new ManageError(RACE);
    from = 'failed';
  }
  if (!canTransition(from, to)) throw new ManageError('הפעולה אינה אפשרית במצב הנוכחי.');
  const done = await store.transition(src.id, from, to, patch);
  if (!done) throw new ManageError(RACE);
  return done;
}

/** Replace the transcript (upload, paste or audio transcription): -> transcribed. */
export async function applyTranscript(
  store: SourceStore,
  id: string,
  t: { cues: Cue[]; source: TranscriptSource; durationS?: number | null; usage?: UsageEntry | null },
): Promise<KnowledgeSourceRow> {
  const src = await load(store, id);
  if (t.cues.length === 0) throw new ManageError('לא נמצא טקסט בתמליל.');
  // Timed transcripts end near the video's end; plain text only has estimated times.
  const lastEnd = t.source === 'upload_txt' ? 0 : t.cues[t.cues.length - 1].end;
  return move(store, src, 'transcribed', {
    transcript_cues: t.cues,
    transcript_text: cuesToText(t.cues),
    transcript_source: t.source,
    duration_s: src.duration_s ?? t.durationS ?? (lastEnd > 0 ? Math.round(lastEnd) : null),
    error: null,
    ...(t.usage
      ? { cost_usd_micros: src.cost_usd_micros + t.usage.usd_micros, usage: [...(src.usage ?? []), t.usage] }
      : {}),
  });
}

export async function skipSource(store: SourceStore, id: string) {
  return move(store, await load(store, id), 'skipped', { error: null });
}

export async function restoreSource(store: SourceStore, id: string) {
  return move(store, await load(store, id), 'detected', { error: null });
}

export async function publishSource(store: SourceStore, id: string, profileId: string | null, now = new Date()) {
  const src = await load(store, id);
  if (!src.summary || src.chunk_count === 0) throw new ManageError('אפשר לפרסם רק סרטון שעובד במלואו.');
  if (src.kind !== 'youtube') throw new ManageError('כרגע אפשר לפרסם באתר רק סרטוני יוטיוב.');
  return move(store, src, 'published', { site_published_at: now.toISOString(), published_by: profileId, error: null });
}

export async function unpublishSource(store: SourceStore, id: string) {
  return move(store, await load(store, id), 'indexed', { site_published_at: null });
}

/** Staff edits to the summary (indexed or published). Normalised like Claude's output. */
export async function saveSummary(
  store: SourceStore,
  id: string,
  raw: RawSummary,
  opts: { categorySlugs: readonly string[]; now?: Date },
): Promise<{ source: KnowledgeSourceRow; summary: SourceSummary }> {
  const src = await load(store, id);
  if (src.status !== 'indexed' && src.status !== 'published') throw new ManageError('אפשר לערוך את הסיכום אחרי העיבוד.');
  const normalized = normalizeSummary(raw, { durationS: src.duration_s, categorySlugs: opts.categorySlugs });
  if (!normalized.summary) throw new ManageError('הסיכום לא יכול להיות ריק.');
  const summary: SourceSummary = {
    ...normalized,
    model: src.summary?.model,
    generated_at: src.summary?.generated_at,
    edited_at: (opts.now ?? new Date()).toISOString(),
  };
  await store.update(id, { summary });
  return { source: { ...src, summary }, summary };
}
