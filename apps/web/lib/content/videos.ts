import 'server-only';

import { cache } from 'react';
import { getVideo as getIndexedVideo, getVideos as getIndexedVideos } from '@/app/api/_lib/data';
import type { Video } from '@/lib/types';
import type { VideoPageRow } from '@/lib/db/types';
import { getPublishedVideoPageBySlug, listPublishedVideoPages, type VideoPageSummary } from '@/lib/db/videos';
import { getPublicDb, safeQuery } from './db';

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Legacy WordPress video page by decoded slug (memoized per request). */
export const loadVideoPage = cache(async (slug: string): Promise<VideoPageRow | null> => {
  const db = getPublicDb();
  if (!db) return null;
  return getPublishedVideoPageBySlug(db, slug);
});

/** First YouTube id of a legacy page that is in our AI index (timestamped segments), if any. */
export function findIndexedYoutubeId(youtubeIds: string[]): string | null {
  for (const id of youtubeIds) {
    try {
      if (getIndexedVideo(id)) return id;
    } catch {
      return null; // static index unavailable
    }
  }
  return null;
}

export function isIndexedYoutubeId(id: string): boolean {
  try {
    return !!getIndexedVideo(id);
  } catch {
    return false;
  }
}

export type VideoHubItem = VideoPageSummary & { legacy_categories: unknown };

/** All published legacy video pages (188), newest first, with their legacy categories. */
export const loadAllVideoPages = cache(async (): Promise<VideoHubItem[]> => {
  const db = getPublicDb();
  if (!db) return [];
  return safeQuery(async () => {
    const out: VideoHubItem[] = [];
    for (let from = 0; from < 5000; from += 1000) {
      const { data, error } = await db
        .from('video_pages')
        .select('id, legacy_slug, title, excerpt, featured_image, youtube_ids, kind, published_at, legacy_categories')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as VideoHubItem[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  }, []);
});

/** Latest legacy video pages of one kind (homepage carousels). */
export async function loadLatestVideoPages(kind: VideoPageRow['kind'], limit: number): Promise<VideoPageSummary[]> {
  const db = getPublicDb();
  if (!db) return [];
  return safeQuery(async () => (await listPublishedVideoPages(db, { page: 1, pageSize: limit, kind })).items, []);
}

/** Legacy pages that embed any of the given YouTube ids ("more videos"). */
export async function loadVideoPagesForYoutubeIds(ids: string[], excludeId: string, limit = 6): Promise<VideoPageSummary[]> {
  const db = getPublicDb();
  if (!db || ids.length === 0) return [];
  return safeQuery(async () => {
    const { data, error } = await db
      .from('video_pages')
      .select('id, legacy_slug, title, excerpt, featured_image, youtube_ids, kind, published_at')
      .eq('status', 'published')
      .overlaps('youtube_ids', ids)
      .neq('id', excludeId)
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as VideoPageSummary[];
  }, []);
}

/** AI-indexed videos (static index) in the frontend `Video` shape, for VideoGrid. */
export function listIndexedVideos(limit: number, sort: 'newest' | 'popular' = 'newest'): Video[] {
  try {
    return getIndexedVideos({ limit, sort }).videos.map((v) => ({
      id: v.id,
      youtube_id: v.youtube_id,
      title: v.title,
      channel_name: 'בונים בית',
      duration_seconds: v.duration_seconds,
      published_at: v.published_at,
      category_id: v.category_slug,
      category_name: v.category_name_he,
      category_slug: v.category_slug,
      thumbnail_url: v.thumbnail_url,
      view_count: v.view_count,
      summary: v.summary || undefined,
    }));
  } catch {
    return [];
  }
}

export function videoThumb(page: Pick<VideoPageRow, 'featured_image' | 'youtube_ids'>): string | null {
  if (page.featured_image) return page.featured_image;
  const id = page.youtube_ids?.[0];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Legacy categories stored as JSON ([{ name, slug, url }]) by the importer. */
export function legacyCategories(value: unknown): Array<{ name: string; slug: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((c) =>
    c && typeof c === 'object' && typeof (c as { name?: unknown }).name === 'string'
      ? [{ name: (c as { name: string }).name, slug: String((c as { slug?: unknown }).slug ?? '') }]
      : [],
  );
}
