/**
 * The processing pipeline end to end against an in-memory store, with the
 * paid/remote steps replaced by fakes: status transitions, the captions miss
 * path, the budget gate (no paid call when refused) and spend accounting.
 */
import { describe, expect, it, vi } from 'vitest';
import { CaptionsUnavailableError } from '@/lib/autopilot/captions';
import { chunkCues } from '@/lib/autopilot/chunk';
import type { AutopilotBudgetGuard } from '@/lib/autopilot/cost';
import { processSource, type PipelineDeps } from '@/lib/autopilot/pipeline';
import type { Cue, SourceSummary, UsageEntry } from '@/lib/autopilot/types';
import { memoryStore, sourceRow } from './memory-store';

vi.mock('@/app/api/_lib/data', () => ({
  getCategories: () => [{ slug: 'finishes-design', name_he: 'גמרים ועיצוב' }],
}));

/** 6 minutes of captions, one cue every 5 seconds. */
const cues: Cue[] = Array.from({ length: 72 }, (_v, i) => ({
  start: i * 5,
  end: i * 5 + 5,
  text: i % 6 === 5 ? `משפט ${i}.` : `מילים ${i}`,
}));

const summary: SourceSummary = {
  summary: 'סיכום',
  key_points: [{ text: 'נקודה', start_s: 30 }],
  costs: [],
  category_slug: 'finishes-design',
  stage: 'finishing',
  chapters: [{ title: 'פתיחה', start_s: 0 }],
  tips: [],
  warnings: [],
  suggested_questions: ['כמה זה עולה?'],
};

const usage = (step: UsageEntry['step'], usd_micros: number): UsageEntry => ({ step, model: 'm', usd_micros, at: 'now' });

function deps(store: PipelineDeps['store'], over: Partial<PipelineDeps> = {}): PipelineDeps & Record<string, ReturnType<typeof vi.fn>> {
  const fetchCaptions = vi.fn(async () => ({ cues, source: 'captions_auto' as const, languageCode: 'iw', durationS: 360, title: 't', client: 'ANDROID' }));
  const embed = vi.fn(async (texts: string[]) => ({ vectors: texts.map(() => [0.1, 0.2]), tokens: texts.map(() => 10), usage: usage('embed', 20) }));
  const summarize = vi.fn(async () => ({ summary, usage: usage('summarize', 3000) }));
  const guard: AutopilotBudgetGuard = { check: vi.fn(async () => ({ ok: true as const })), record: vi.fn(async () => {}) };
  return { store, fetchCaptions, embed, summarize, guard, ...over } as never;
}

describe('processSource', () => {
  it('takes a detected video to indexed: captions, chunks, embeddings, summary, spend', async () => {
    const m = memoryStore([sourceRow({ id: 's1' })]);
    const d = deps(m.store);
    const out = await processSource('s1', d);

    expect(out).toMatchObject({ ok: true, status: 'indexed', costMicros: 3020 });
    expect(m.history.map((h) => `${h.from}>${h.to}`)).toEqual([
      'detected>transcribing',
      'transcribing>transcribed',
      'transcribed>summarizing',
      'summarizing>indexed',
    ]);
    const row = m.rows.get('s1')!;
    const expected = chunkCues(cues);
    expect(expected.length).toBe(3);
    expect(row).toMatchObject({ transcript_source: 'captions_auto', duration_s: 360, chunk_count: 3, cost_usd_micros: 3020, error: null, attempts: 1 });
    expect(row.summary?.summary).toBe('סיכום');
    expect(row.usage.map((u) => u.step)).toEqual(['embed', 'summarize']);
    expect(row.transcript_text?.startsWith('מילים 0 מילים 1')).toBe(true);
    const stored = m.chunks.get('s1')!;
    expect(stored.map((c) => c.chunk_index)).toEqual([0, 1, 2]);
    expect(stored.map((c) => c.text)).toEqual(expected.map((c) => c.text));
    expect(stored[0].embedding).toBe('[0.1,0.2]');
    expect(d.embed).toHaveBeenCalledWith(stored.map((c) => c.text));
  });

  it('parks a video without captions in needs_transcript, with nothing paid', async () => {
    const m = memoryStore([sourceRow({ id: 's1' })]);
    const d = deps(m.store, {
      fetchCaptions: vi.fn(async () => {
        throw new CaptionsUnavailableError('blocked', 'bot check');
      }),
    });
    const out = await processSource('s1', d);
    expect(out).toMatchObject({ ok: false, code: 'needs_transcript', status: 'needs_transcript' });
    expect(m.rows.get('s1')!.error).toContain('YouTube Studio');
    expect(m.rows.get('s1')!.error).toContain('[blocked]');
    expect(d.embed).not.toHaveBeenCalled();
    expect(d.summarize).not.toHaveBeenCalled();
  });

  it('indexes a source whose transcript was uploaded, without fetching captions', async () => {
    const m = memoryStore([sourceRow({ id: 's1', status: 'transcribed', transcript_cues: cues, transcript_source: 'upload_srt', duration_s: 360 })]);
    const d = deps(m.store);
    expect((await processSource('s1', d)).ok).toBe(true);
    expect(d.fetchCaptions).not.toHaveBeenCalled();
    expect(m.history.map((h) => h.to)).toEqual(['summarizing', 'indexed']);
    expect(m.rows.get('s1')!.attempts).toBe(1);
  });

  it('refuses over budget before any paid call and leaves the status alone', async () => {
    const m = memoryStore([sourceRow({ id: 's1', status: 'transcribed', transcript_cues: cues })]);
    const guard: AutopilotBudgetGuard = { check: vi.fn(async () => ({ ok: false as const, reason: 'תקציב נוצל' })), record: vi.fn() };
    const d = deps(m.store, { guard });
    const out = await processSource('s1', d);
    expect(out).toMatchObject({ ok: false, code: 'budget', status: 'transcribed' });
    expect(m.rows.get('s1')).toMatchObject({ status: 'transcribed', error: 'תקציב נוצל' });
    expect(d.embed).not.toHaveBeenCalled();
    expect(d.summarize).not.toHaveBeenCalled();
    expect((guard.check as ReturnType<typeof vi.fn>).mock.calls[0][0].usdMicros).toBeGreaterThan(0);
  });

  it('marks the source failed but keeps the spend when the summary fails', async () => {
    const m = memoryStore([sourceRow({ id: 's1', status: 'transcribed', transcript_cues: cues, cost_usd_micros: 5 })]);
    const d = deps(m.store, {
      summarize: vi.fn(async () => {
        throw Object.assign(new Error('incomplete'), { usage: usage('summarize', 900) });
      }),
    });
    const out = await processSource('s1', d);
    expect(out).toMatchObject({ ok: false, code: 'failed', status: 'failed', costMicros: 920 });
    expect(m.rows.get('s1')).toMatchObject({ status: 'failed', cost_usd_micros: 925, chunk_count: 0 });
    expect(m.rows.get('s1')!.usage.map((u) => u.usd_micros)).toEqual([20, 900]);
    expect(d.guard!.record).toHaveBeenCalledWith(expect.objectContaining({ usdMicros: 920 }));
  });

  it('retries a failed source from its stored transcript', async () => {
    const m = memoryStore([sourceRow({ id: 's1', status: 'failed', transcript_cues: cues, error: 'old' })]);
    const out = await processSource('s1', deps(m.store));
    expect(out.ok).toBe(true);
    expect(m.history.map((h) => `${h.from}>${h.to}`)).toEqual(['failed>transcribed', 'transcribed>summarizing', 'summarizing>indexed']);
  });

  it('refuses a step that is still running, but recovers a stale one', async () => {
    const running = sourceRow({ id: 's1', status: 'summarizing', transcript_cues: cues, updated_at: new Date().toISOString() });
    const m1 = memoryStore([running]);
    expect(await processSource('s1', deps(m1.store))).toMatchObject({ ok: false, code: 'busy' });

    const stale = sourceRow({ id: 's2', status: 'summarizing', transcript_cues: cues, updated_at: '2026-10-14T00:00:00Z' });
    const m2 = memoryStore([stale]);
    const out = await processSource('s2', deps(m2.store, { now: () => new Date('2026-10-14T01:00:00Z') }));
    expect(out.ok).toBe(true);
    expect(m2.history[0]).toMatchObject({ from: 'summarizing', to: 'failed' });
  });

  it('does not process published or skipped sources, or unknown ids', async () => {
    const m = memoryStore([sourceRow({ id: 'p', status: 'published' }), sourceRow({ id: 'k', status: 'skipped', external_id: 'x' })]);
    expect(await processSource('p', deps(m.store))).toMatchObject({ ok: false, code: 'not_processable' });
    expect(await processSource('k', deps(m.store))).toMatchObject({ ok: false, code: 'not_processable' });
    expect(await processSource('nope', deps(m.store))).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('asks for a transcript for podcast episodes instead of fetching captions', async () => {
    const m = memoryStore([sourceRow({ id: 'pod', kind: 'podcast', external_id: 'episode-114' })]);
    const d = deps(m.store);
    expect(await processSource('pod', d)).toMatchObject({ ok: false, code: 'needs_transcript' });
    expect(d.fetchCaptions).not.toHaveBeenCalled();
  });
});
