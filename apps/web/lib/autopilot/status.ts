/**
 * Content Autopilot pipeline states. Client-safe.
 *
 *   detected -> transcribing -> transcribed -> summarizing -> indexed -> published
 *
 * plus needs_transcript (no usable captions: staff upload or paste one),
 * failed (any step errored; retry) and skipped (staff chose not to ingest).
 * Every write goes through a compare-and-set on the current status
 * (lib/autopilot/store.ts), so two clicks cannot run the same step twice.
 */
import type { Tone } from '@/lib/admin/labels';
import type { SourceStatus } from './types';

export const TRANSITIONS: Readonly<Record<SourceStatus, readonly SourceStatus[]>> = {
  // A pasted or uploaded transcript jumps straight to "transcribed".
  detected: ['transcribing', 'transcribed', 'skipped'],
  transcribing: ['transcribed', 'needs_transcript', 'failed'],
  needs_transcript: ['transcribing', 'transcribed', 'skipped'],
  // transcribed -> transcribed: the transcript was replaced.
  transcribed: ['summarizing', 'transcribed', 'skipped'],
  summarizing: ['indexed', 'failed'],
  // indexed -> transcribed: a replaced transcript must be re-indexed.
  indexed: ['published', 'transcribed', 'skipped'],
  published: ['indexed'],
  failed: ['detected', 'transcribing', 'transcribed', 'skipped'],
  skipped: ['detected'],
};

export function canTransition(from: SourceStatus, to: SourceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: SourceStatus,
    readonly to: SourceStatus,
  ) {
    super(`Invalid autopilot transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: SourceStatus, to: SourceStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Steps that run inside a request; a row stuck in one longer than this was cut off (timeout, crash). */
export const IN_PROGRESS: ReadonlySet<SourceStatus> = new Set<SourceStatus>(['transcribing', 'summarizing']);
export const STALE_AFTER_MS = 10 * 60 * 1000;

export function isStale(status: SourceStatus, updatedAt: string | null | undefined, now = Date.now()): boolean {
  if (!IN_PROGRESS.has(status) || !updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  return Number.isFinite(t) && now - t > STALE_AFTER_MS;
}

/** The status a stale in-progress row is recovered from: it failed mid-step. */
export function effectiveStatus(status: SourceStatus, updatedAt: string | null | undefined, now = Date.now()): SourceStatus {
  return isStale(status, updatedAt, now) ? 'failed' : status;
}

/** Statuses the processing pipeline accepts as a starting point. */
export const PROCESSABLE: ReadonlySet<SourceStatus> = new Set<SourceStatus>(['detected', 'needs_transcript', 'transcribed', 'failed']);

export type SourceAction = 'process' | 'retry' | 'transcript' | 'skip' | 'restore' | 'publish' | 'unpublish';

/** Admin actions offered for a row (queue and detail view). */
export function availableActions(status: SourceStatus, updatedAt?: string | null, now = Date.now()): SourceAction[] {
  switch (effectiveStatus(status, updatedAt, now)) {
    case 'detected':
      return ['process', 'transcript', 'skip'];
    case 'needs_transcript':
      return ['transcript', 'retry', 'skip'];
    case 'transcribed':
      return ['process', 'transcript', 'skip'];
    case 'indexed':
      return ['publish', 'transcript', 'skip'];
    case 'published':
      return ['unpublish'];
    case 'failed':
      return ['retry', 'transcript', 'skip'];
    case 'skipped':
      return ['restore'];
    default:
      return []; // running right now
  }
}

/** Transcript replacement is allowed until the source is live. */
export function canReplaceTranscript(status: SourceStatus, updatedAt?: string | null, now = Date.now()): boolean {
  return canTransition(effectiveStatus(status, updatedAt, now), 'transcribed');
}

export const STATUS_INFO: Readonly<Record<SourceStatus, { label: string; tone: Tone; hint: string }>> = {
  detected: { label: 'זוהה', tone: 'blue', hint: 'סרטון חדש שעוד לא עובד' },
  transcribing: { label: 'מתמלל…', tone: 'purple', hint: 'שולף כתוביות מיוטיוב' },
  needs_transcript: { label: 'חסר תמליל', tone: 'amber', hint: 'לא נמצאו כתוביות: העלו או הדביקו תמליל' },
  transcribed: { label: 'תומלל', tone: 'blue', hint: 'יש תמליל, אפשר לעבד' },
  summarizing: { label: 'מסכם ומאנדקס…', tone: 'purple', hint: 'יוצר סיכום, פרקים וחיפוש' },
  indexed: { label: 'מוכן לפרסום', tone: 'amber', hint: 'ממתין לאישור שלכם' },
  published: { label: 'פורסם', tone: 'green', hint: 'מופיע באתר ובחיפוש' },
  failed: { label: 'נכשל', tone: 'red', hint: 'אפשר לנסות שוב' },
  skipped: { label: 'דולג', tone: 'gray', hint: 'לא ייכנס לאתר' },
};

export const ACTION_LABELS: Readonly<Record<SourceAction, string>> = {
  process: 'עיבוד',
  retry: 'ניסיון חוזר',
  transcript: 'העלאת תמליל',
  skip: 'דילוג',
  restore: 'החזרה לתור',
  publish: 'פרסום באתר',
  unpublish: 'הסרה מהאתר',
};
