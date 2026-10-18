import 'server-only';

/**
 * Server-side initial data for /video/<youtube-id>/ (AI-indexed videos).
 * Same static index (app/api/_lib/data.ts) and the same field mapping as
 * /api/videos/[id] and /api/videos, so the page can render the player and
 * summary in its first HTML (fast LCP) instead of fetching after hydration.
 */
import { getStaticVideo, getVideos, type VideoRecord } from '@/app/api/_lib/data';
import { keyPointsWithTimes, videoChapters } from '@/lib/knowledge/video-detail';
import type { Video, VideoDetail } from '@/lib/types';

function toVideo(v: VideoRecord): Video {
  return {
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
    costs_count: v.costs?.length || 0,
    tips_count: v.tips?.length || 0,
  };
}

/** VideoDetail as /api/videos/[id] returns it, or null. */
export function loadIndexedVideoDetail(id: string): VideoDetail | null {
  let v: VideoRecord | null = null;
  try {
    v = getStaticVideo(id);
  } catch {
    return null;
  }
  if (!v) return null;
  const base = toVideo(v);
  return {
    ...base,
    costs_count: undefined,
    tips_count: undefined,
    key_points: keyPointsWithTimes(v),
    chapters: videoChapters(v),
    kind: v.kind,
    costs_data: v.costs?.length ? v.costs.map((c) => ({ item: c.item, price: c.price, unit: c.unit, context: c.context })) : undefined,
    tips: v.tips?.length ? v.tips : undefined,
    warnings: v.warnings?.length ? v.warnings : undefined,
  };
}

/** Same-category videos, excluding this one (as lib/api.ts getRelatedVideos). */
export function loadRelatedIndexedVideos(video: Pick<VideoDetail, 'youtube_id' | 'category_slug'>, limit = 3): Video[] {
  if (!video.category_slug) return [];
  try {
    return getVideos({ category: video.category_slug, limit: limit + 1 })
      .videos.filter((v) => v.youtube_id !== video.youtube_id)
      .slice(0, limit)
      .map(toVideo);
  } catch {
    return [];
  }
}
