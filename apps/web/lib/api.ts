import type {
  Video,
  VideoDetail,
  Category,
  SearchResponse,
  AnswerResponse,
  AnswerSource,
  PaginatedVideos,
  VideoListParams,
} from './types';

// ---------------------------------------------------------------------------
// Generic fetcher — uses same-origin Next.js API routes
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // For server-side rendering we need an absolute URL.
  // NEXT_PUBLIC_SITE_URL is set on Vercel; fallback to localhost for dev.
  const base =
    typeof window !== 'undefined'
      ? ''
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

export async function getVideos(params: VideoListParams = {}): Promise<PaginatedVideos> {
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.category_id) sp.set('category', params.category_id);
  if (params.sort) sp.set('sort', params.sort);
  const qs = sp.toString();
  return apiFetch<PaginatedVideos>(`/api/videos${qs ? `?${qs}` : ''}`);
}

export async function getVideoDetail(id: string): Promise<VideoDetail> {
  return apiFetch<VideoDetail>(`/api/videos/${id}`);
}

export async function getRelatedVideos(id: string): Promise<Video[]> {
  // For now, return same-category videos excluding the current one
  try {
    const video = await getVideoDetail(id);
    if (video.category_slug) {
      const data = await getVideos({ category_id: video.category_slug, limit: 4 });
      return data.videos.filter((v) => v.youtube_id !== id).slice(0, 3);
    }
  } catch {
    // ignore
  }
  return [];
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function getCategories(): Promise<Category[]> {
  const data = await apiFetch<{ categories: Category[] }>('/api/categories');
  return data.categories;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchVideos(
  query: string,
  category?: string,
  page?: number,
  limit?: number,
): Promise<SearchResponse> {
  const sp = new URLSearchParams({ q: query });
  if (category) sp.set('category', category);
  if (page) sp.set('page', String(page));
  if (limit) sp.set('limit', String(limit));

  const raw = await apiFetch<{
    results: Array<{
      video_id: string;
      youtube_id: string;
      title: string;
      summary?: string;
      thumbnail_url?: string;
      duration_seconds: number;
      published_at?: string;
      category_slug?: string;
      category_name?: string;
      score: number;
      snippet?: string;
    }>;
    total: number;
    query: string;
  }>(`/api/search?${sp.toString()}`);

  return {
    results: raw.results.map((r) => ({
      video: {
        id: r.video_id,
        youtube_id: r.youtube_id,
        title: r.title,
        channel_name: 'בונים בית',
        duration_seconds: r.duration_seconds,
        published_at: r.published_at || '',
        category_id: r.category_slug || '',
        category_name: r.category_name || '',
        category_slug: r.category_slug || '',
        thumbnail_url: r.thumbnail_url,
      },
      score: r.score,
      snippet: r.snippet || '',
    })),
    total: raw.total,
    query: raw.query,
  };
}

export async function getSuggestions(_query: string): Promise<string[]> {
  // Not implemented yet — return empty
  return [];
}

// ---------------------------------------------------------------------------
// AI Answer — stubbed for now (Python API not deployed)
// ---------------------------------------------------------------------------

export async function getAnswer(_query: string): Promise<AnswerResponse> {
  return {
    answer: 'תכונת AI תהיה זמינה בקרוב. בינתיים, ניתן לצפות בסרטונים הרלוונטיים למטה.',
    sources: [],
    confidence: 'low',
  };
}

/**
 * Stream an AI answer via SSE — stubbed for now.
 */
export function streamAnswer(
  query: string,
  onChunk: (text: string) => void,
  onDone: (sources: AnswerSource[], confidence: 'high' | 'medium' | 'low') => void,
  _onError?: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  // Immediately return the placeholder message
  setTimeout(() => {
    if (!controller.signal.aborted) {
      onChunk('תכונת AI תהיה זמינה בקרוב. בינתיים, ניתן לצפות בסרטונים הרלוונטיים למטה.');
      onDone([], 'low');
    }
  }, 300);

  return controller;
}
