import { describe, expect, it } from 'vitest';
import {
  ManageError,
  applyTranscript,
  publishSource,
  restoreSource,
  saveSummary,
  skipSource,
  unpublishSource,
} from '@/lib/autopilot/manage';
import type { SourceSummary } from '@/lib/autopilot/types';
import { memoryStore, sourceRow } from './memory-store';

const summary: SourceSummary = {
  summary: 'סיכום',
  key_points: [],
  costs: [],
  category_slug: 'general-tips',
  stage: null,
  chapters: [],
  tips: [],
  warnings: [],
  suggested_questions: [],
};
const cues = [
  { start: 0, end: 4, text: 'שלום' },
  { start: 4, end: 9.6, text: 'עולם' },
];

describe('staff operations', () => {
  it('stores an uploaded transcript and moves to transcribed', async () => {
    const m = memoryStore([sourceRow({ id: 's', status: 'needs_transcript', error: 'no captions' })]);
    const out = await applyTranscript(m.store, 's', { cues, source: 'upload_vtt' });
    expect(out).toMatchObject({ status: 'transcribed', transcript_source: 'upload_vtt', transcript_text: 'שלום עולם', duration_s: 10, error: null });
  });

  it('adds audio-transcription spend to the source', async () => {
    const m = memoryStore([sourceRow({ id: 's', status: 'needs_transcript', cost_usd_micros: 10 })]);
    const usage = { step: 'transcribe_audio' as const, model: 'whisper-1', audio_seconds: 10, usd_micros: 1000, at: 'now' };
    const out = await applyTranscript(m.store, 's', { cues, source: 'audio_transcription', usage });
    expect(out.cost_usd_micros).toBe(1010);
    expect(out.usage).toEqual([usage]);
  });

  it('refuses a transcript for a live source', async () => {
    const m = memoryStore([sourceRow({ id: 's', status: 'published', summary, chunk_count: 2 })]);
    await expect(applyTranscript(m.store, 's', { cues, source: 'upload_txt' })).rejects.toThrow(ManageError);
  });

  it('publishes only fully processed YouTube sources', async () => {
    const m = memoryStore([
      sourceRow({ id: 'ready', status: 'indexed', summary, chunk_count: 3 }),
      sourceRow({ id: 'raw', status: 'transcribed', external_id: 'x2' }),
      sourceRow({ id: 'pod', status: 'indexed', kind: 'podcast', external_id: 'ep', summary, chunk_count: 1 }),
    ]);
    const now = new Date('2026-10-14T12:00:00Z');
    expect(await publishSource(m.store, 'ready', 'editor-1', now)).toMatchObject({
      status: 'published',
      published_by: 'editor-1',
      site_published_at: '2026-10-14T12:00:00.000Z',
    });
    await expect(publishSource(m.store, 'raw', 'editor-1')).rejects.toThrow(/עובד במלואו/);
    await expect(publishSource(m.store, 'pod', 'editor-1')).rejects.toThrow(/יוטיוב/);
  });

  it('unpublishes back to indexed, and skip/restore round-trips', async () => {
    const m = memoryStore([sourceRow({ id: 's', status: 'published', summary, chunk_count: 1, site_published_at: 'x' })]);
    expect(await unpublishSource(m.store, 's')).toMatchObject({ status: 'indexed', site_published_at: null });
    expect((await skipSource(m.store, 's')).status).toBe('skipped');
    expect((await restoreSource(m.store, 's')).status).toBe('detected');
    await expect(unpublishSource(m.store, 's')).rejects.toThrow(ManageError);
  });

  it('detects a concurrent change (stale tab)', async () => {
    const m = memoryStore([sourceRow({ id: 's', status: 'indexed', summary, chunk_count: 1 })]);
    const original = m.store.get;
    m.store.get = async (id) => {
      const row = await original(id);
      m.rows.get(id)!.status = 'skipped'; // someone else skipped it meanwhile
      return row;
    };
    await expect(publishSource(m.store, 's', null)).rejects.toThrow(/במקביל/);
  });

  it('saves edited summaries normalised, only after processing', async () => {
    const m = memoryStore([
      sourceRow({ id: 's', status: 'indexed', summary: { ...summary, model: 'claude-haiku-5-5' }, duration_s: 100 }),
      sourceRow({ id: 'd', status: 'detected', external_id: 'x3' }),
    ]);
    const { summary: saved } = await saveSummary(
      m.store,
      's',
      { summary: ' חדש ', chapters: [{ title: 'סוף', start_s: 500 }], category_slug: 'nope' },
      { categorySlugs: ['general-tips'], now: new Date('2026-10-14T00:00:00Z') },
    );
    expect(saved).toMatchObject({ summary: 'חדש', chapters: [{ title: 'סוף', start_s: 0 }], category_slug: 'general-tips', model: 'claude-haiku-5-5', edited_at: '2026-10-14T00:00:00.000Z' });
    await expect(saveSummary(m.store, 'd', { summary: 'x' }, { categorySlugs: [] })).rejects.toThrow(ManageError);
    await expect(saveSummary(m.store, 's', { summary: '  ' }, { categorySlugs: [] })).rejects.toThrow(/ריק/);
  });
});
