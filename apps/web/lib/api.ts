import type {
  Video,
  VideoDetail,
  Category,
  SearchResponse,
  AnswerResponse,
  AnswerSource,
  PaginatedVideos,
  PregeneratedAnswer,
  VideoListParams,
} from './types';

// ---------------------------------------------------------------------------
// Generic fetcher — uses same-origin Next.js API routes
// ---------------------------------------------------------------------------

// Default timeouts in milliseconds
const DEFAULT_TIMEOUT = 10_000; // 10s for regular requests
const STREAM_TIMEOUT = 30_000; // 30s for streaming requests

// Hebrew user-friendly error messages for gateway errors
const GATEWAY_ERROR_MESSAGES: Record<number, string> = {
  502: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.',
  503: 'השירות בתחזוקה זמנית. אנא נסו שוב בקרוב.',
  504: 'הבקשה ארכה זמן רב מדי. אנא נסו שוב.',
};

function getHebrewErrorMessage(status: number): string {
  return (
    GATEWAY_ERROR_MESSAGES[status] ||
    'אירעה שגיאה בעת עיבוד הבקשה. אנא נסו שוב.'
  );
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { timeout?: number },
): Promise<T> {
  // For server-side rendering we need an absolute URL.
  // NEXT_PUBLIC_SITE_URL is set on Vercel; fallback to localhost for dev.
  const base =
    typeof window !== 'undefined'
      ? ''
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const timeout = init?.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      if (res.status >= 502 && res.status <= 504) {
        throw new Error(getHebrewErrorMessage(res.status));
      }
      throw new Error(`API error ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(getHebrewErrorMessage(504));
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
      matching_segment_time?: number;
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
      matching_segment_time: r.matching_segment_time,
    })),
    total: raw.total,
    query: raw.query,
  };
}

export async function getSuggestions(query: string): Promise<string[]> {
  if (query.trim().length < 2) return [];
  const data = await apiFetch<{ suggestions: string[] }>(
    `/api/suggestions?q=${encodeURIComponent(query.trim())}`,
  );
  return data.suggestions;
}

// ---------------------------------------------------------------------------
// Pre-generated Answer — instant lookup via 3-tier matching
// ---------------------------------------------------------------------------

export async function getPregeneratedAnswer(query: string): Promise<PregeneratedAnswer | null> {
  const base =
    typeof window !== 'undefined'
      ? ''
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  try {
    const res = await fetch(
      `${base}/api/answer/pregenerated?q=${encodeURIComponent(query)}`,
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as PregeneratedAnswer;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI Answer — wired to live backend
// ---------------------------------------------------------------------------

function mapConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export async function getAnswer(query: string): Promise<AnswerResponse> {
  const raw = await apiFetch<{
    answer: string;
    sources: Array<{
      video_id: string;
      youtube_id: string;
      title: string;
      timestamp: number;
      relevance_score: number;
    }>;
    confidence: number;
    query: string;
  }>('/api/answer', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

  return {
    answer: raw.answer,
    sources: raw.sources.map((s) => ({
      video_id: s.video_id,
      youtube_id: s.youtube_id,
      title: s.title,
      timestamp: s.timestamp,
    })),
    confidence: mapConfidence(raw.confidence),
  };
}

/**
 * Stream an AI answer via SSE from the backend.
 */
export function streamAnswer(
  query: string,
  onChunk: (text: string) => void,
  onDone: (sources: AnswerSource[], confidence: 'high' | 'medium' | 'low') => void,
  onError?: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  const base =
    typeof window !== 'undefined'
      ? ''
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

  fetch(`${base}/api/answer/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${res.statusText}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          try {
            const event = JSON.parse(json) as {
              type: string;
              content?: string;
              sources?: Array<{
                video_id: string;
                youtube_id: string;
                title: string;
                timestamp: number;
                relevance_score: number;
              }>;
              confidence?: number;
            };

            if (event.type === 'chunk' && event.content) {
              onChunk(event.content);
            } else if (event.type === 'done') {
              const sources: AnswerSource[] = (event.sources || []).map((s) => ({
                video_id: s.video_id,
                youtube_id: s.youtube_id,
                title: s.title,
                timestamp: s.timestamp,
              }));
              onDone(sources, mapConfidence(event.confidence ?? 0));
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    })
    .catch((err: Error) => {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') return;
      if (onError) {
        onError(err);
      }
    });

  return controller;
}
