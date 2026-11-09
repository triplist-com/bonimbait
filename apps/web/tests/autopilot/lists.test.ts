/**
 * Published Content Autopilot videos in the site's video lists: /api/videos
 * (the /videos page), the homepage rails and the video hub.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeListItem } from '@/lib/autopilot/listing';
import type { VideoPageSummary } from '@/lib/db/videos';

// React's request cache only exists in the server (RSC) build.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const state = vi.hoisted(() => ({
  runtime: [] as RuntimeListItem[],
  legacy: { video: [] as unknown[], podcast: [] as unknown[] },
  hub: [] as unknown[],
  embeddedRows: [] as Array<{ youtube_ids: string[] }>,
}));

vi.mock('@/lib/autopilot/video-list', () => ({ listPublishedRuntimeVideoItems: async () => state.runtime }));
vi.mock('@/lib/autopilot/videos', () => ({ findPublishedRuntimeIds: async () => new Set<string>() }));
vi.mock('@/lib/content/db', () => {
  // video_pages queries: the hub's paged list and the "already embedded" lookup.
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    range: () => Promise.resolve({ data: state.hub, error: null }),
    overlaps: () => Promise.resolve({ data: state.embeddedRows, error: null }),
  };
  return {
    getPublicDb: () => ({ from: () => chain }),
    safeQuery: async <T,>(fn: () => Promise<T>, fallback: T) => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    },
  };
});
vi.mock('@/lib/db/videos', () => ({
  listPublishedVideoPages: async (_db: unknown, opts: { kind: 'video' | 'podcast' }) => ({ items: state.legacy[opts.kind] }),
  getPublishedVideoPageBySlug: async () => null,
}));

import { GET as videosRoute } from '@/app/api/videos/route';
import { listVideos } from '@/app/api/_lib/data';
import { getHomeMedia } from '@/lib/home/data';
import { loadVideoHubItems } from '@/lib/content/videos';

function runtime(patch: Partial<RuntimeListItem> & Pick<RuntimeListItem, 'youtube_id'>): RuntimeListItem {
  return {
    title: `סרטון ${patch.youtube_id}`,
    published_at: '2030-01-01T19:00:00+00:00',
    duration_s: 600,
    thumbnail_url: `https://i.ytimg.com/vi/${patch.youtube_id}/hqdefault.jpg`,
    category_slug: 'finishes-design',
    category_name: 'גמרים ועיצוב',
    stage: 'finishing',
    summary: 'סיכום',
    costs_count: 2,
    tips_count: 3,
    ...patch,
  };
}

function legacy(id: string, published_at: string, patch: Partial<VideoPageSummary> = {}) {
  return {
    id,
    legacy_slug: `עמוד-${id}`,
    title: `עמוד ${id}`,
    excerpt: null,
    featured_image: null,
    youtube_ids: [],
    kind: 'video' as const,
    published_at,
    legacy_categories: [],
    ...patch,
  };
}

const R1 = runtime({ youtube_id: 'JFnOeDtyeIs', published_at: '2030-02-01T19:00:00+00:00' });
const R2 = runtime({ youtube_id: 'A4v1KhJAi34', published_at: '2030-01-01T19:00:00+00:00', category_slug: 'structure-construction', stage: 'frame' });
const POD = runtime({ youtube_id: 'Pod00000001', title: 'פודקאסט פרק 120 - גמרים', published_at: '2030-01-15T19:00:00+00:00' });

beforeEach(() => {
  state.runtime = [];
  state.legacy = { video: [], podcast: [] };
  state.hub = [];
  state.embeddedRows = [];
});

async function getVideos(query: string) {
  const res = await videosRoute(new NextRequest(`http://localhost/api/videos?${query}`));
  return (await res.json()) as { videos: Array<{ id: string; youtube_id: string; category_slug: string; view_count: number }>; total: number; pages: number };
}

describe('/api/videos', () => {
  const staticCount = listVideos({}).length;

  it('lists runtime videos with the static index, newest first', async () => {
    state.runtime = [R1, R2];
    const body = await getVideos('limit=5');
    expect(body.total).toBe(staticCount + 2);
    expect(body.videos.slice(0, 2).map((v) => v.id)).toEqual(['JFnOeDtyeIs', 'A4v1KhJAi34']);
    expect(body.videos[0]).toMatchObject({ youtube_id: 'JFnOeDtyeIs', category_slug: 'finishes-design', view_count: 0, costs_count: 2, tips_count: 3 });
  });

  it('filters runtime videos by category too', async () => {
    state.runtime = [R1, R2];
    const body = await getVideos('category=structure-construction&limit=100');
    expect(body.total).toBe(listVideos({ category: 'structure-construction' }).length + 1);
    expect(body.videos[0].id).toBe('A4v1KhJAi34');
    expect(body.videos.some((v) => v.id === 'JFnOeDtyeIs')).toBe(false);
  });

  it('puts runtime videos last under "popular"', async () => {
    state.runtime = [R1];
    const body = await getVideos(`sort=popular&limit=100&page=${Math.ceil((staticCount + 1) / 100)}`);
    expect(body.videos.at(-1)?.id).toBe('JFnOeDtyeIs');
  });

  it('lets the static index win on a shared YouTube id', async () => {
    const known = listVideos({})[0];
    state.runtime = [runtime({ youtube_id: known.youtube_id })];
    const body = await getVideos('limit=5');
    expect(body.total).toBe(staticCount);
  });

  it('is the static list unchanged when there are no runtime videos', async () => {
    const body = await getVideos('limit=3');
    expect(body.total).toBe(staticCount);
    expect(body.videos.map((v) => v.id)).toEqual(listVideos({}).slice(0, 3).map((v) => v.id));
  });
});

describe('getHomeMedia', () => {
  it('merges runtime videos into the rail of their kind, newest first', async () => {
    state.runtime = [R1, POD, R2];
    state.legacy = {
      video: [legacy('v1', '2030-01-20T00:00:00+00:00'), legacy('v2', '2025-01-01T00:00:00+00:00')],
      podcast: [legacy('p1', '2025-06-01T00:00:00+00:00', { kind: 'podcast', title: 'פודקאסט פרק 90' })],
    };
    const media = await getHomeMedia(3);
    expect(media.videos.map((m) => m.id)).toEqual(['JFnOeDtyeIs', 'v1', 'A4v1KhJAi34']);
    expect(media.videos[0]).toMatchObject({ href: '/video/JFnOeDtyeIs/', durationSeconds: 600, kind: 'video', episode: null });
    expect(media.podcasts.map((m) => m.id)).toEqual(['Pod00000001', 'p1']);
    expect(media.podcasts[0]).toMatchObject({ kind: 'podcast', episode: '120' });
  });

  it('shows a runtime video that a legacy page embeds as that page only', async () => {
    state.runtime = [R1];
    state.embeddedRows = [{ youtube_ids: ['JFnOeDtyeIs', 'other'] }];
    state.legacy.video = [legacy('v1', '2025-01-01T00:00:00+00:00', { youtube_ids: ['JFnOeDtyeIs'] })];
    expect((await getHomeMedia(4)).videos.map((m) => m.id)).toEqual(['v1']);
  });
});

describe('loadVideoHubItems', () => {
  it('adds runtime videos to the hub with their stage category', async () => {
    state.runtime = [R1, R2];
    state.hub = [legacy('v1', '2030-01-20T00:00:00+00:00', { youtube_ids: ['zzzzzzzzzzz'] })];
    const items = await loadVideoHubItems();
    expect(items.map((i) => i.id)).toEqual(['JFnOeDtyeIs', 'v1', 'A4v1KhJAi34']);
    expect(items[0]).toMatchObject({
      legacy_slug: 'JFnOeDtyeIs',
      featured_image: 'https://i.ytimg.com/vi/JFnOeDtyeIs/hqdefault.jpg',
      youtube_ids: ['JFnOeDtyeIs'],
      kind: 'video',
      legacy_categories: [{ name: 'שלב גמרים', slug: 'שלב-גמרים' }],
    });
    expect(items[2].legacy_categories).toEqual([{ name: 'שלב שלד', slug: 'שלב-שלד' }]);
  });

  it('skips runtime videos that a legacy page embeds', async () => {
    state.runtime = [R1];
    state.hub = [legacy('v1', '2025-01-01T00:00:00+00:00', { youtube_ids: ['JFnOeDtyeIs'] })];
    expect((await loadVideoHubItems()).map((i) => i.id)).toEqual(['v1']);
  });
});
