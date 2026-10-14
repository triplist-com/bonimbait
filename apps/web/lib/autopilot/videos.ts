import 'server-only';

import { cache } from 'react';
import { serviceDb } from './db';
import { categoryName, toVideoRecord } from './records';
import { rememberRuntimeVideo } from './registry';
import { YOUTUBE_ID_RE, youtubeThumbnail } from './rss';
import { DEFAULT_CATEGORY } from './summary';
import type { KnowledgeSourceRow, SourceSummary } from './types';

/**
 * Published Content Autopilot videos for public pages: /video/<youtube-id>/,
 * the sitemap, and search/answer metadata. Reads with the service role
 * (the tables have no anon access) and only ever returns published YouTube
 * sources.
 */

export interface RuntimeVideo {
  youtube_id: string;
  title: string;
  url: string;
  published_at: string | null;
  duration_s: number | null;
  thumbnail_url: string;
  summary: SourceSummary;
  category_slug: string;
  category_name: string;
  chunk_count: number;
  updated_at: string;
}

function toRuntimeVideo(row: KnowledgeSourceRow): RuntimeVideo | null {
  if (row.kind !== 'youtube' || row.status !== 'published' || !row.summary || !YOUTUBE_ID_RE.test(row.external_id)) return null;
  const category = row.summary.category_slug || DEFAULT_CATEGORY;
  return {
    youtube_id: row.external_id,
    title: row.title,
    url: row.url || `https://www.youtube.com/watch?v=${row.external_id}`,
    published_at: row.published_at,
    duration_s: row.duration_s,
    thumbnail_url: row.thumbnail_url || youtubeThumbnail(row.external_id),
    summary: row.summary,
    category_slug: category,
    category_name: categoryName(category),
    chunk_count: row.chunk_count,
    updated_at: row.updated_at,
  };
}

/**
 * A published runtime video by YouTube id (memoized per request), or null when
 * there is none (or no store is configured). Throws when the store errors, so
 * an ISR revalidation during an outage keeps serving the last good page.
 */
export const loadPublishedRuntimeVideo = cache(async (youtubeId: string): Promise<RuntimeVideo | null> => {
  if (!YOUTUBE_ID_RE.test(youtubeId)) return null;
  const db = serviceDb();
  if (!db) return null;
  const { data, error } = await db
    .from('knowledge_sources')
    .select('*')
    .eq('kind', 'youtube')
    .eq('external_id', youtubeId)
    .eq('status', 'published')
    .maybeSingle();
  if (error) {
    console.error('[autopilot] video lookup failed:', error.message);
    throw new Error(`knowledge store unavailable: ${error.message}`);
  }
  const video = data ? toRuntimeVideo(data as KnowledgeSourceRow) : null;
  if (video) {
    rememberRuntimeVideo(toVideoRecord({ ...video, chunk_count: video.chunk_count }));
  }
  return video;
});

/** Published runtime videos for the sitemap (newest first). Never throws. */
export async function listPublishedRuntimeVideos(limit = 2000): Promise<Array<{ youtube_id: string; updated_at: string; published_at: string | null }>> {
  const db = serviceDb();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from('knowledge_sources')
      .select('external_id, updated_at, published_at')
      .eq('kind', 'youtube')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((r) => YOUTUBE_ID_RE.test(r.external_id))
      .map((r) => ({ youtube_id: r.external_id, updated_at: r.updated_at, published_at: r.published_at }));
  } catch (err) {
    console.error('[autopilot] published list failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
