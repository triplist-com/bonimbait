import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runDetection, unreadSourceKinds } from '@/lib/autopilot/detect';
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
  youtubeApiKey: null as string | null,
  podcastRssUrl: null as string | null,
  autoProcess: false,
  autoProcessLimit: 1,
  searchEnabled: true,
  searchTimeoutMs: 800,
};
const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCCehs0A1gUmOUtZIhvkXVJQ';
const API_KEY = 'AIzaTestKey-not-real';
const API_URL =
  'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet%2CcontentDetails%2Cstatus' +
  `&playlistId=UUCehs0A1gUmOUtZIhvkXVJQ&maxResults=15&key=${API_KEY}`;
const API_REPORT_URL = 'https://www.googleapis.com/youtube/v3/playlistItems?playlistId=UUCehs0A1gUmOUtZIhvkXVJQ';
const API_BODY = JSON.stringify({
  items: [
    {
      snippet: { title: 'התקנת סיפון - אפשרי לבד?!', publishedAt: '2026-11-08T19:00:05Z', resourceId: { videoId: 'JFnOeDtyeIs' } },
      contentDetails: { videoId: 'JFnOeDtyeIs', videoPublishedAt: '2026-11-08T19:00:00Z' },
      status: { privacyStatus: 'public' },
    },
    {
      snippet: { title: 'שלב הפינישים - מה זה אומר ?!', resourceId: { videoId: 'A4v1KhJAi34' } },
      contentDetails: { videoId: 'A4v1KhJAi34', videoPublishedAt: '2026-11-05T19:00:00Z' },
      status: { privacyStatus: 'public' },
    },
  ],
});

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

  describe('YouTube Data API fallback', () => {
    const withKey = { ...config, youtubeApiKey: API_KEY };

    it('reads the uploads from the Data API when the feed fails', async () => {
      const m = memoryStore();
      const report = await runDetection(m.store, {
        via: 'cron',
        fetchFn: fetchFrom({ [FEED_URL]: 404, [API_URL]: API_BODY }),
        isStatic: () => false,
        config: withKey,
      });
      expect(report.feeds).toEqual([
        { kind: 'youtube', url: FEED_URL, items: 0, error: 'HTTP 404' },
        { kind: 'youtube', url: API_REPORT_URL, items: 2 },
      ]);
      expect(report.inserted.map((i) => i.external_id)).toEqual(['JFnOeDtyeIs', 'A4v1KhJAi34']);
      const added = Array.from(m.rows.values()).find((r) => r.external_id === 'JFnOeDtyeIs')!;
      expect(added).toMatchObject({
        status: 'detected',
        title: 'התקנת סיפון - אפשרי לבד?!',
        url: 'https://www.youtube.com/watch?v=JFnOeDtyeIs',
        published_at: '2026-11-08T19:00:00.000Z',
        thumbnail_url: 'https://i.ytimg.com/vi/JFnOeDtyeIs/hqdefault.jpg',
      });
      expect(unreadSourceKinds(report.feeds)).toEqual([]);
    });

    it('never puts the key in the report', async () => {
      const report = await runDetection(memoryStore().store, {
        via: 'cron',
        fetchFn: fetchFrom({ [FEED_URL]: 404, [API_URL]: API_BODY }),
        isStatic: () => false,
        config: withKey,
      });
      expect(JSON.stringify(report)).not.toContain(API_KEY);
    });

    it('also falls back when the feed is empty', async () => {
      const report = await runDetection(memoryStore().store, {
        via: 'cron',
        fetchFn: fetchFrom({ [FEED_URL]: '<feed></feed>', [API_URL]: API_BODY }),
        isStatic: () => false,
        config: withKey,
      });
      expect(report.feeds[0]).toMatchObject({ items: 0, error: 'empty feed' });
      expect(report.inserted).toHaveLength(2);
    });

    it('is not called when the feed works', async () => {
      const fetchFn = fetchFrom({ [FEED_URL]: feed });
      const report = await runDetection(memoryStore().store, { via: 'cron', fetchFn, isStatic: () => false, config: withKey });
      expect(report.feeds).toEqual([{ kind: 'youtube', url: FEED_URL, items: 2 }]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('is not called without YOUTUBE_API_KEY: the feed error stands', async () => {
      const report = await runDetection(memoryStore().store, {
        via: 'cron',
        fetchFn: fetchFrom({ [FEED_URL]: 404 }),
        isStatic: () => false,
        config,
      });
      expect(report.feeds).toEqual([{ kind: 'youtube', url: FEED_URL, items: 0, error: 'HTTP 404' }]);
      expect(unreadSourceKinds(report.feeds)).toEqual(['youtube']);
    });

    it("reports Google's error reason without the key", async () => {
      const denied = JSON.stringify({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } });
      const fetchFn = vi.fn(async (url: string | URL | Request) =>
        String(url) === FEED_URL ? new Response('nope', { status: 404 }) : new Response(denied, { status: 403 }),
      ) as unknown as typeof fetch;
      const report = await runDetection(memoryStore().store, { via: 'cron', fetchFn, isStatic: () => false, config: withKey });
      expect(report.feeds[1]).toEqual({ kind: 'youtube', url: API_REPORT_URL, items: 0, error: 'HTTP 403 quotaExceeded' });
      expect(unreadSourceKinds(report.feeds)).toEqual(['youtube']);
    });

    it('scrubs the key from network errors', async () => {
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        if (String(url) === FEED_URL) return new Response('nope', { status: 404 });
        throw new Error(`connect failed for ${url}`);
      }) as unknown as typeof fetch;
      const report = await runDetection(memoryStore().store, { via: 'cron', fetchFn, isStatic: () => false, config: withKey });
      expect(report.feeds[1].error).toContain('key=***');
      expect(JSON.stringify(report)).not.toContain(API_KEY);
    });
  });
});

describe('unreadSourceKinds', () => {
  it('lists a kind only when every attempt at it failed', () => {
    expect(unreadSourceKinds([])).toEqual([]);
    expect(
      unreadSourceKinds([
        { kind: 'youtube', url: 'a', items: 0, error: 'HTTP 404' },
        { kind: 'youtube', url: 'b', items: 0, error: 'HTTP 403' },
        { kind: 'podcast', url: 'c', items: 0, error: 'HTTP 500' },
        { kind: 'podcast', url: 'd', items: 3 },
      ]),
    ).toEqual(['youtube']);
  });
});
