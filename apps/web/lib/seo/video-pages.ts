/**
 * SEO rules for the static /video/<youtube-id>/ pages (apps/web/data/videos.json).
 *
 * Title-only videos (no captions, so no transcript, summary or moments; the
 * search index marks their rows `title_only`, lib/knowledge/segment-text.ts)
 * are thin pages: they stay reachable for visitors and internal links, but get
 * `noindex, follow`, no key-moment markup and no sitemap entry.
 */
import type { VideoRecord } from '@/app/api/_lib/data';
import { keyPointsWithTimes, videoChapters } from '@/lib/knowledge/video-detail';
import { videoMoments, videoObjectJsonLd } from '@/lib/jsonld';

/** No transcript = a title-level catalog entry (the record flag behind the index's title_only rows). */
export function isTitleOnlyVideo(video: Pick<VideoRecord, 'has_transcript' | 'segment_count'>): boolean {
  return !video.has_transcript || !(Number(video.segment_count) > 0);
}

/** robots metadata for a title-only page: out of the index, links still followed. */
export const TITLE_ONLY_ROBOTS = { index: false, follow: true } as const;

/**
 * VideoObject for a legacy /video/<slug>/ page (its first YouTube video). Key
 * moments come from the static index when that video is transcribed (Clip), else
 * SeekToAction (the page honours ?t= on its first player). A page whose canonical
 * points elsewhere gets no moment markup: Clip URLs must be the page itself.
 */
export function legacyVideoJsonLd(opts: {
  youtubeId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  uploadDate: string | null;
  /** Absolute URL of this page. */
  pageUrl: string;
  /** Absolute canonical URL (usually the same). */
  canonicalUrl: string;
  /** The video's static index record, if any. */
  record: VideoRecord | null;
}): Record<string, unknown> {
  const self = opts.canonicalUrl === opts.pageUrl;
  const transcribed = opts.record && !isTitleOnlyVideo(opts.record) ? opts.record : null;
  const moments =
    self && transcribed
      ? videoMoments({ chapters: videoChapters(transcribed), key_points: keyPointsWithTimes(transcribed), duration_seconds: transcribed.duration_seconds })
      : [];
  return videoObjectJsonLd({
    youtubeId: opts.youtubeId,
    name: opts.title,
    description: opts.description,
    thumbnailUrl: opts.thumbnailUrl,
    uploadDate: opts.uploadDate,
    durationSec: opts.record?.duration_seconds,
    pageUrl: opts.canonicalUrl,
    moments,
    seekable: self,
  });
}

/** VideoObject (+ Clip or SeekToAction) for a static video page. */
export function staticVideoJsonLd(video: VideoRecord, pageUrl: string): Record<string, unknown> {
  const titleOnly = isTitleOnlyVideo(video);
  const moments = titleOnly
    ? []
    : videoMoments({ chapters: videoChapters(video), key_points: keyPointsWithTimes(video), duration_seconds: video.duration_seconds });
  return videoObjectJsonLd({
    youtubeId: video.youtube_id,
    name: video.title,
    description: video.summary || `צפו בסרטון "${video.title}" בנושא ${video.category_name_he} - בונים בית`,
    thumbnailUrl: video.thumbnail_url,
    uploadDate: video.published_at,
    durationSec: video.duration_seconds,
    pageUrl,
    moments,
    seekable: !titleOnly,
  });
}
