/**
 * Shared TypeScript types for Bonimbait.
 * These interfaces should stay in sync with the Python Pydantic schemas in apps/api/.
 */

/** A construction-related content category */
export interface Category {
  id: string;
  slug: string;
  /** Hebrew display name */
  nameHe: string;
  /** English display name */
  nameEn: string;
  createdAt: string;
}

/** A YouTube video record */
export interface Video {
  id: string;
  youtubeId: string;
  title: string;
  description: string | null;
  channelName: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  categorySlug: string;
  /** AI-generated Hebrew summary */
  summary: string | null;
  /** Full transcript text */
  transcript: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A segment of a video (e.g., a chapter or time-stamped section) */
export interface VideoSegment {
  id: string;
  videoId: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Transcript text for this segment */
  text: string;
  /** AI-generated summary for this segment */
  summary: string | null;
  /** pgvector embedding (not sent to frontend; used for search) */
  embedding?: number[];
  createdAt: string;
}

/** A single result from a search query */
export interface SearchResult {
  video: Video;
  /** The matching segment, if the search matched a specific segment */
  segment: VideoSegment | null;
  /** Relevance score (0-1, higher is better) */
  score: number;
  /** Text snippet with highlighted matches */
  highlightedSnippet: string | null;
}

/** AI-generated answer to a user's question, with source references */
export interface AiAnswer {
  /** The generated Hebrew answer text */
  text: string;
  /** Source videos/segments that informed the answer */
  sources: SearchResult[];
  /** The original user query */
  query: string;
  /** Model used for generation */
  model: string;
  /** Time taken to generate in milliseconds */
  latencyMs: number;
}
