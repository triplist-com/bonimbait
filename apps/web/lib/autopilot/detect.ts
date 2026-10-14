import 'server-only';

import { getStaticVideo } from '@/app/api/_lib/data';
import { autopilotConfig, type AutopilotConfig } from './config';
import { parsePodcastFeed, parseYoutubeFeed, youtubeFeedUrl, type FeedItem } from './rss';
import type { SourceStore } from './store';
import type { DetectedVia } from './types';

/**
 * Detection: read the channel's RSS feed (and the optional podcast feed) and
 * add a `detected` row for every item that is neither in the static index
 * (apps/web/data/videos.json, a superset of the search index's videos) nor
 * already in the knowledge store.
 */

export interface FeedReport {
  kind: 'youtube' | 'podcast';
  url: string;
  items: number;
  error?: string;
}

export interface DetectionReport {
  checkedAt: string;
  feeds: FeedReport[];
  inserted: Array<{ id: string; kind: 'youtube' | 'podcast'; external_id: string; title: string }>;
  alreadyKnown: number;
  inStaticIndex: number;
}

/** True when the video is part of the static AI index (static wins). */
export function isInStaticIndex(youtubeId: string): boolean {
  try {
    return getStaticVideo(youtubeId) !== null;
  } catch {
    return false; // static data unavailable: let the DB dedupe decide
  }
}

async function fetchFeed(url: string, fetchFn: typeof fetch): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BonimBaitAutopilot/1.0)', Accept: 'application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.5' },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function runDetection(
  store: SourceStore,
  opts: {
    via: DetectedVia;
    fetchFn?: typeof fetch;
    isStatic?: (youtubeId: string) => boolean;
    config?: AutopilotConfig;
    now?: () => Date;
  },
): Promise<DetectionReport> {
  const config = opts.config ?? autopilotConfig();
  const fetchFn = opts.fetchFn ?? fetch;
  const isStatic = opts.isStatic ?? isInStaticIndex;

  const feeds: FeedReport[] = [];
  const items: FeedItem[] = [];

  const ytUrl = youtubeFeedUrl(config.channelId);
  try {
    const parsed = parseYoutubeFeed(await fetchFeed(ytUrl, fetchFn));
    feeds.push({ kind: 'youtube', url: ytUrl, items: parsed.length });
    items.push(...parsed);
  } catch (err) {
    feeds.push({ kind: 'youtube', url: ytUrl, items: 0, error: (err as Error)?.message ?? String(err) });
  }

  if (config.podcastRssUrl) {
    try {
      const parsed = parsePodcastFeed(await fetchFeed(config.podcastRssUrl, fetchFn));
      feeds.push({ kind: 'podcast', url: config.podcastRssUrl, items: parsed.length });
      items.push(...parsed);
    } catch (err) {
      feeds.push({ kind: 'podcast', url: config.podcastRssUrl, items: 0, error: (err as Error)?.message ?? String(err) });
    }
  }

  let inStaticIndex = 0;
  const candidates = items.filter((it) => {
    if (it.kind === 'youtube' && isStatic(it.externalId)) {
      inStaticIndex += 1;
      return false;
    }
    return true;
  });

  const known = new Set<string>();
  for (const kind of ['youtube', 'podcast'] as const) {
    const ids = candidates.filter((c) => c.kind === kind).map((c) => c.externalId);
    (await store.existingExternalIds(kind, ids)).forEach((id) => known.add(`${kind}:${id}`));
  }
  const fresh = candidates.filter((c) => !known.has(`${c.kind}:${c.externalId}`));

  const rows = await store.insertDetected(
    fresh.map((c) => ({
      kind: c.kind,
      external_id: c.externalId,
      title: c.title,
      url: c.url,
      published_at: c.publishedAt,
      duration_s: c.durationS,
      thumbnail_url: c.thumbnailUrl,
      detected_via: opts.via,
    })),
  );
  const insertedIds = new Map(rows.map((r) => [r.external_id, r.id]));

  return {
    checkedAt: (opts.now ?? (() => new Date()))().toISOString(),
    feeds,
    inserted: fresh
      .filter((c) => insertedIds.has(c.externalId))
      .map((c) => ({ id: insertedIds.get(c.externalId)!, kind: c.kind, external_id: c.externalId, title: c.title })),
    alreadyKnown: candidates.length - fresh.length,
    inStaticIndex,
  };
}
