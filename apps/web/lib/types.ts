// ============================================================
// Bonimbayit Frontend Types — matching the backend API contracts
// ============================================================

// --- Video ---

export interface Video {
  id: string;
  youtube_id: string;
  title: string;
  channel_name: string;
  duration_seconds: number;
  published_at: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  thumbnail_url?: string;
  view_count?: number;
  summary?: string;
  costs_count?: number;
  tips_count?: number;
}

export interface VideoSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
}

export interface KeyPoint {
  text: string;
  timestamp?: number;
}

export interface CostItem {
  item: string;
  price: string | number;
  unit: string;
  context?: string;
}

export interface VideoDetail extends Video {
  summary?: string;
  key_points?: KeyPoint[];
  segments?: VideoSegment[];
  costs_data?: CostItem[];
  tips?: string[];
  warnings?: string[];
}

// --- Category ---

export interface Category {
  id: string;
  name_he: string;
  slug: string;
  description_he?: string;
  video_count: number;
}

// --- Search ---

export interface SearchResult {
  video: Video;
  score: number;
  snippet: string;
  matching_segment_time?: number;
  segment_thumbnail_url?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

// --- AI Answer ---

export interface AnswerSource {
  video_id: string;
  youtube_id: string;
  title: string;
  timestamp: number;
}

export interface AnswerResponse {
  answer: string;
  sources: AnswerSource[];
  confidence: 'high' | 'medium' | 'low';
}

// --- Pagination ---

export interface PaginatedVideos {
  videos: Video[];
  total: number;
  page: number;
  pages: number;
}

export interface VideoListParams {
  page?: number;
  limit?: number;
  category_id?: string;
  sort?: 'newest' | 'oldest' | 'popular';
}

// --- Helpers ---

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function thumbnailUrl(youtubeId: string): string {
  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}

/**
 * Build a YouTube thumbnail URL for a specific timestamp.
 * YouTube doesn't serve arbitrary-timestamp frames, so we pick the closest
 * auto-generated thumbnail (1.jpg ≈ 25%, 2.jpg ≈ 50%, 3.jpg ≈ 75%).
 * For exact frames, use the pipeline script to pre-generate thumbnails.
 */
export function timestampThumbnailUrl(
  youtubeId: string,
  timestampSeconds: number,
  durationSeconds: number,
): string {
  if (durationSeconds <= 0) return thumbnailUrl(youtubeId);
  const ratio = timestampSeconds / durationSeconds;
  // Pick the closest auto-generated thumbnail
  let idx: number;
  if (ratio < 0.125) idx = 0;
  else if (ratio < 0.375) idx = 1;
  else if (ratio < 0.625) idx = 2;
  else idx = 3;
  return `https://img.youtube.com/vi/${youtubeId}/${idx}.jpg`;
}
