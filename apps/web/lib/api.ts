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

// On Render the NEXT_PUBLIC_API_URL env var is set via render.yaml (fromService).
// Render provides the external URL, e.g. https://bonimbait-api.onrender.com
// For a custom domain, update the env var to https://api.bonimbait.com (or similar).
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Generic fetcher
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
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
  if (params.category_id) sp.set('category_id', params.category_id);
  if (params.sort) sp.set('sort', params.sort);
  const qs = sp.toString();
  return apiFetch<PaginatedVideos>(`/api/videos${qs ? `?${qs}` : ''}`);
}

export async function getVideoDetail(id: string): Promise<VideoDetail> {
  return apiFetch<VideoDetail>(`/api/videos/${id}`);
}

export async function getRelatedVideos(id: string): Promise<Video[]> {
  return apiFetch<Video[]>(`/api/videos/${id}/related`);
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

  // The API returns flat SearchResultItem objects; transform to nested SearchResult
  const raw = await apiFetch<{
    results: Array<{
      video_id: string;
      youtube_id: string;
      title: string;
      description?: string;
      summary?: string;
      thumbnail_url?: string;
      duration_seconds: number;
      published_at?: string;
      category_id?: string;
      category_name?: string;
      score: number;
      snippet?: string;
      matching_segment_time?: number;
      segment_thumbnail_url?: string;
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
        channel_name: r.category_name || '',
        duration_seconds: r.duration_seconds,
        published_at: r.published_at || '',
        category_id: r.category_id || '',
        category_name: r.category_name || '',
        category_slug: '',
        thumbnail_url: r.thumbnail_url,
      },
      score: r.score,
      snippet: r.snippet || '',
      matching_segment_time: r.matching_segment_time,
      segment_thumbnail_url: r.segment_thumbnail_url
        ? `${API_URL}${r.segment_thumbnail_url}`
        : undefined,
    })),
    total: raw.total,
    query: raw.query,
  };
}

export async function getSuggestions(query: string): Promise<string[]> {
  const data = await apiFetch<{ suggestions: string[] }>(
    `/api/search/suggest?q=${encodeURIComponent(query)}`,
  );
  return data.suggestions;
}

// ---------------------------------------------------------------------------
// AI Answer
// ---------------------------------------------------------------------------

export async function getAnswer(query: string): Promise<AnswerResponse> {
  return apiFetch<AnswerResponse>('/api/answer', {
    method: 'POST',
    body: JSON.stringify({ query, stream: false }),
  });
}

/**
 * Stream an AI answer via SSE.  Returns an AbortController so the caller can
 * cancel the request.
 */
export function streamAnswer(
  query: string,
  onChunk: (text: string) => void,
  onDone: (sources: AnswerSource[], confidence: 'high' | 'medium' | 'low') => void,
  onError?: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_URL}/api/answer/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.type === 'chunk' && parsed.text) {
                onChunk(parsed.text);
              } else if (parsed.type === 'done') {
                onDone(parsed.sources ?? [], parsed.confidence ?? 'medium');
              }
            } catch {
              // plain text chunk
              onChunk(payload);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError?.(err as Error);
      }
    }
  })();

  return controller;
}
