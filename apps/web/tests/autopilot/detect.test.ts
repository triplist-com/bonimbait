import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runDetection } from '@/lib/autopilot/detect';
import { memoryStore, sourceRow } from './memory-store';

vi.mock('@/app/api/_lib/data', () => ({ getStaticVideo: () => null }));

const feed = readFileSync(join(__dirname, 'fixtures/youtube-feed.xml'), 'utf8');
const PODCAST = `<rss><channel><item><title>פרק 114</title><guid>ep-114</guid><enclosure url="https://cdn.example.test/114.mp3"/></item></channel></rss>`;

function fetchFrom(map: Record<string, string | number>) {
  return vi.fn(async (url: string | URL | Request) => {
    const body = map[String(url)];
    if (typeof body === 'number') return new Response('nope', { status: body });
    if (body === undefined) throw new Error(`unexpected fetch ${url}`);
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

const config = {
  channelId: 'UCCehs0A1gUmOUtZIhvkXVJQ',
  podcastRssUrl: null as string | null,
  autoProcess: false,
  autoProcessLimit: 1,
  searchEnabled: true,
  searchTimeoutMs: 800,
};
const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCCehs0A1gUmOUtZIhvkXVJQ';

describe('runDetection', () => {
  it('inserts feed videos found in neither the static index nor the store', async () => {
    const m = memoryStore([sourceRow({ id: 'old', external_id: 'trfkU0TW8RI', status: 'published' })]);
    const report = await runDetection(m.store, {
      via: 'cron',
      fetchFn: fetchFrom({ [FEED_URL]: feed }),
      isStatic: () => false,
      config,
    });
    expect(report.feeds).toEqual([{ kind: 'youtube', url: FEED_URL, items: 2 }]);
    expect(report.inserted.map((i) => i.external_id)).toEqual(['EeMos4VM2oU']);
    expect(report.alreadyKnown).toBe(1);
    const added = Array.from(m.rows.values()).find((r) => r.external_id === 'EeMos4VM2oU')!;
    expect(added).toMatchObject({ status: 'detected', kind: 'youtube', detected_via: 'cron', thumbnail_url: 'https://i.ytimg.com/vi/EeMos4VM2oU/hqdefault.jpg' });
  });

  it('skips videos that are already in the static index', async () => {
    const m = memoryStore();
    const report = await runDetection(m.store, {
      via: 'admin',
      fetchFn: fetchFrom({ [FEED_URL]: feed }),
      isStatic: (id) => id === 'EeMos4VM2oU',
      config,
    });
    expect(report.inStaticIndex).toBe(1);
    expect(report.inserted.map((i) => i.external_id)).toEqual(['trfkU0TW8RI']);
  });

  it('is idempotent: a second run inserts nothing', async () => {
    const m = memoryStore();
    const opts = { via: 'cron' as const, fetchFn: fetchFrom({ [FEED_URL]: feed }), isStatic: () => false, config };
    expect((await runDetection(m.store, opts)).inserted).toHaveLength(2);
    expect((await runDetection(m.store, opts)).inserted).toHaveLength(0);
  });

  it('also watches PODCAST_RSS_URL and reports feed errors without failing', async () => {
    const m = memoryStore();
    const report = await runDetection(m.store, {
      via: 'cron',
      fetchFn: fetchFrom({ [FEED_URL]: 503, 'https://pod.example.test/rss': PODCAST }),
      isStatic: () => false,
      config: { ...config, podcastRssUrl: 'https://pod.example.test/rss' },
    });
    expect(report.feeds[0]).toMatchObject({ kind: 'youtube', items: 0, error: 'HTTP 503' });
    expect(report.feeds[1]).toMatchObject({ kind: 'podcast', items: 1 });
    expect(report.inserted).toEqual([expect.objectContaining({ kind: 'podcast', external_id: 'ep-114' })]);
  });
});
