import type { VideoRecord } from '@/app/api/_lib/data';

/**
 * Per-instance memory of PUBLISHED runtime (Content Autopilot) videos that
 * search just returned, so the synchronous getVideo() lookups in the search
 * and answer routes resolve their titles and metadata unchanged.
 *
 * Entries come only from match_knowledge_chunks() (published sources) and the
 * published-video resolver, and expire after a few minutes, so an unpublished
 * video drops out of other instances quickly; search stops returning it at once.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

const entries = new Map<string, { at: number; video: VideoRecord }>();

export function rememberRuntimeVideo(video: VideoRecord, now = Date.now()): void {
  entries.delete(video.youtube_id);
  entries.set(video.youtube_id, { at: now, video });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function recallRuntimeVideo(youtubeId: string, now = Date.now()): VideoRecord | null {
  const e = entries.get(youtubeId);
  if (!e) return null;
  if (now - e.at > TTL_MS) {
    entries.delete(youtubeId);
    return null;
  }
  return e.video;
}

export function forgetRuntimeVideo(youtubeId: string): void {
  entries.delete(youtubeId);
}

export function clearRuntimeVideos(): void {
  entries.clear();
}
