import { describe, expect, it, vi } from 'vitest';
import { autoProcessQueue, runWatch } from '@/lib/autopilot/run';
import { memoryStore, sourceRow } from './memory-store';

vi.mock('@/app/api/_lib/data', () => ({ getStaticVideo: () => null, getCategories: () => [] }));

const config = {
  channelId: 'UCCehs0A1gUmOUtZIhvkXVJQ',
  podcastRssUrl: null,
  autoProcess: true,
  autoProcessLimit: 2,
  searchEnabled: true,
  searchTimeoutMs: 800,
};
const report = { checkedAt: 'x', feeds: [], inserted: [], alreadyKnown: 0, inStaticIndex: 0 };

describe('cron auto-processing queue', () => {
  const rows = () => [
    sourceRow({ id: 'new', status: 'detected', external_id: 'a', published_at: '2026-10-14T00:00:00Z' }),
    sourceRow({ id: 'pod-new', status: 'detected', kind: 'podcast', external_id: 'p', published_at: '2026-10-15T00:00:00Z' }),
    sourceRow({ id: 'ready', status: 'transcribed', external_id: 't', transcript_cues: [{ start: 0, end: 1, text: 'x' }] }),
    sourceRow({ id: 'wait', status: 'needs_transcript', external_id: 'b', error: 'x [no_captions]', attempts: 1 }),
    sourceRow({ id: 'blocked', status: 'needs_transcript', external_id: 'c', error: 'x [blocked]', attempts: 1 }),
    sourceRow({ id: 'tired', status: 'needs_transcript', external_id: 'd', error: 'x [no_captions]', attempts: 3 }),
    sourceRow({ id: 'pod', status: 'needs_transcript', kind: 'podcast', external_id: 'e', error: 'x [no_captions]' }),
  ];

  it('takes new YouTube videos, then transcribed sources, then caption retries', async () => {
    const m = memoryStore(rows());
    expect((await autoProcessQueue(m.store, 5)).map((r) => r.id)).toEqual(['new', 'ready', 'wait']);
    expect((await autoProcessQueue(m.store, 2)).map((r) => r.id)).toEqual(['new', 'ready']);
    expect((await autoProcessQueue(m.store, 1)).map((r) => r.id)).toEqual(['new']);
  });

  it('never spends a slot on podcast episodes, which need a transcript from staff', async () => {
    const m = memoryStore(rows());
    expect((await autoProcessQueue(m.store, 10)).some((r) => r.kind === 'podcast')).toBe(false);
  });
});

describe('runWatch', () => {
  it('processes only when enabled and never publishes', async () => {
    const m = memoryStore([sourceRow({ id: 'new', status: 'detected' })]);
    const process = vi.fn(async () => ({ ok: true as const, status: 'indexed' as const, message: '', costMicros: 1 }));
    const detect = vi.fn(async () => report);

    const off = await runWatch(m.store, { via: 'cron', config: { ...config, autoProcess: false }, detect, process });
    expect(off.autoProcess).toEqual({ enabled: false, processed: [] });
    expect(process).not.toHaveBeenCalled();

    const deadline = Date.now() + 52_000;
    const on = await runWatch(m.store, { via: 'cron', config, detect, process, deadline });
    expect(on.autoProcess.processed.map((p) => p.id)).toEqual(['new']);
    expect(process).toHaveBeenCalledWith('new', { store: m.store, deadline });
    expect(Array.from(m.rows.values()).some((r) => r.status === 'published')).toBe(false);
  });

  it('starts no source without enough time left in the request', async () => {
    const m = memoryStore([sourceRow({ id: 'new', status: 'detected' })]);
    const process = vi.fn();
    const out = await runWatch(m.store, { via: 'cron', config, detect: async () => report, process, deadline: Date.now() + 10_000 });
    expect(out.autoProcess.processed).toEqual([]);
    expect(process).not.toHaveBeenCalled();
  });
});
