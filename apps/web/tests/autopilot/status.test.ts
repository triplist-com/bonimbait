import { describe, expect, it } from 'vitest';
import {
  ACTION_LABELS,
  InvalidTransitionError,
  STALE_AFTER_MS,
  STATUS_INFO,
  TRANSITIONS,
  assertTransition,
  availableActions,
  canReplaceTranscript,
  canTransition,
  effectiveStatus,
  isStale,
} from '@/lib/autopilot/status';
import { SOURCE_STATUSES } from '@/lib/autopilot/types';

describe('status transitions', () => {
  it('follows the pipeline happy path', () => {
    const path = ['detected', 'transcribing', 'transcribed', 'summarizing', 'indexed', 'published'] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1], path[i])).toBe(true);
  });

  it('covers every status and only targets known statuses', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...SOURCE_STATUSES].sort());
    for (const targets of Object.values(TRANSITIONS)) for (const t of targets) expect(SOURCE_STATUSES).toContain(t);
    for (const s of SOURCE_STATUSES) expect(STATUS_INFO[s].label).toBeTruthy();
  });

  it('never publishes without indexing, and only unpublishes from published', () => {
    for (const s of SOURCE_STATUSES) {
      expect(canTransition(s, 'published')).toBe(s === 'indexed');
    }
    expect(TRANSITIONS.published).toEqual(['indexed']);
  });

  it('lets failures, missing captions and skips recover', () => {
    expect(canTransition('transcribing', 'needs_transcript')).toBe(true);
    expect(canTransition('needs_transcript', 'transcribed')).toBe(true);
    expect(canTransition('summarizing', 'failed')).toBe(true);
    expect(canTransition('failed', 'transcribed')).toBe(true);
    expect(canTransition('skipped', 'detected')).toBe(true);
  });

  it('rejects jumps that skip the pipeline', () => {
    expect(canTransition('detected', 'indexed')).toBe(false);
    expect(canTransition('transcribed', 'published')).toBe(false);
    expect(canTransition('skipped', 'published')).toBe(false);
    expect(() => assertTransition('detected', 'published')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('indexed', 'published')).not.toThrow();
  });
});

describe('stale in-progress rows', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const old = new Date(now - STALE_AFTER_MS - 1000).toISOString();
  const fresh = new Date(now - 30_000).toISOString();

  it('treats a step running past the limit as failed', () => {
    expect(isStale('summarizing', old, now)).toBe(true);
    expect(isStale('summarizing', fresh, now)).toBe(false);
    expect(isStale('indexed', old, now)).toBe(false);
    expect(effectiveStatus('transcribing', old, now)).toBe('failed');
    expect(effectiveStatus('transcribing', fresh, now)).toBe('transcribing');
  });

  it('offers retry for stale rows and nothing while a step runs', () => {
    expect(availableActions('summarizing', fresh, now)).toEqual([]);
    expect(availableActions('summarizing', old, now)).toContain('retry');
  });
});

describe('admin actions per status', () => {
  it('matches the queue workflow', () => {
    expect(availableActions('detected')).toEqual(['process', 'transcript', 'skip']);
    expect(availableActions('needs_transcript')).toEqual(['transcript', 'retry', 'skip']);
    expect(availableActions('indexed')).toEqual(['publish', 'transcript', 'skip']);
    expect(availableActions('published')).toEqual(['unpublish']);
    expect(availableActions('failed')).toEqual(['retry', 'transcript', 'skip']);
    expect(availableActions('skipped')).toEqual(['restore']);
    for (const s of SOURCE_STATUSES) for (const a of availableActions(s)) expect(ACTION_LABELS[a]).toBeTruthy();
  });

  it('allows replacing the transcript until the source is live', () => {
    expect(canReplaceTranscript('needs_transcript')).toBe(true);
    expect(canReplaceTranscript('indexed')).toBe(true);
    expect(canReplaceTranscript('published')).toBe(false);
    expect(canReplaceTranscript('skipped')).toBe(false);
  });
});
