import type { VideoRecord } from '@/app/api/_lib/data';
import type { KeyPoint, VideoChapter } from '@/lib/types';

/** Key points with their video moment, when the catalog has one (AI summaries of the full-channel index). */
export function keyPointsWithTimes(video: Pick<VideoRecord, 'key_points' | 'key_point_times' | 'duration_seconds'>): KeyPoint[] | undefined {
  if (!video.key_points?.length) return undefined;
  return video.key_points.map((text, i) => {
    const t = video.key_point_times?.[i];
    const valid = typeof t === 'number' && Number.isFinite(t) && t >= 0 && (!video.duration_seconds || t < video.duration_seconds);
    return valid ? { text, timestamp: Math.floor(t) } : { text };
  });
}

/** Chapters in ascending order, inside the video, with a non-empty title; fewer than two means none. */
export function videoChapters(video: Pick<VideoRecord, 'chapters' | 'duration_seconds'>): VideoChapter[] | undefined {
  const chapters = (video.chapters ?? [])
    .filter((c) => c.title?.trim() && Number.isFinite(c.start_time) && c.start_time >= 0)
    .filter((c) => !video.duration_seconds || c.start_time < video.duration_seconds)
    .map((c) => ({ start_time: Math.floor(c.start_time), title: c.title.trim() }))
    .sort((a, b) => a.start_time - b.start_time);
  return chapters.length >= 2 ? chapters : undefined;
}
