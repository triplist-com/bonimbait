import fs from 'fs';
import path from 'path';

// ---- Types for the static JSON data ----

export interface VideoCost {
  item: string;
  price: string;
  unit: string;
  context: string;
}

export interface VideoRecord {
  id: string;
  youtube_id: string;
  title: string;
  description: string;
  duration_seconds: number;
  thumbnail_url: string;
  published_at: string;
  view_count: number;
  category_slug: string;
  category_name_he: string;
  summary: string;
  key_points: string[];
  costs: VideoCost[];
  tips: string[];
  rules: string[];
  warnings: string[];
  materials: string[];
  difficulty_level: string;
  has_transcript: boolean;
  segment_count: number;
}

export interface CategoryRecord {
  slug: string;
  name_he: string;
  description_he: string;
  video_count: number;
}

interface DataFile {
  generated_at: string;
  total_videos: number;
  categories: CategoryRecord[];
  videos: VideoRecord[];
}

// ---- Singleton cache ----

let _data: DataFile | null = null;

function loadData(): DataFile {
  if (_data) return _data;

  // Try multiple paths to handle both local dev and Vercel deployment
  const candidates = [
    path.join(process.cwd(), 'data', 'videos.json'),
    path.join(process.cwd(), 'apps', 'web', 'data', 'videos.json'),
    path.resolve(__dirname, '..', '..', '..', 'data', 'videos.json'),
  ];

  let raw: string | null = null;
  for (const filePath of candidates) {
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
      break;
    } catch {
      // try next candidate
    }
  }

  if (!raw) {
    throw new Error(
      `Could not find videos.json. Tried: ${candidates.join(', ')}. CWD: ${process.cwd()}`,
    );
  }

  _data = JSON.parse(raw) as DataFile;
  return _data;
}

// ---- Public helpers ----

export function getVideos(params: {
  page?: number;
  limit?: number;
  category?: string;
  sort?: string;
}): { videos: VideoRecord[]; total: number; page: number; pages: number } {
  const data = loadData();
  let filtered = data.videos;

  // Filter by category slug
  if (params.category) {
    filtered = filtered.filter((v) => v.category_slug === params.category);
  }

  // Sort
  const sort = params.sort || 'newest';
  if (sort === 'oldest') {
    filtered = [...filtered].sort(
      (a, b) => a.published_at.localeCompare(b.published_at),
    );
  } else if (sort === 'popular') {
    filtered = [...filtered].sort(
      (a, b) => (b.view_count || 0) - (a.view_count || 0),
    );
  }
  // default 'newest' — data is already sorted newest-first

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const total = filtered.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const videos = filtered.slice(start, start + limit);

  return { videos, total, page, pages };
}

export function getVideo(id: string): VideoRecord | null {
  const data = loadData();
  return data.videos.find((v) => v.youtube_id === id || v.id === id) || null;
}

export function getCategories(): CategoryRecord[] {
  const data = loadData();
  return data.categories;
}

export function searchVideos(
  query: string,
  params: { page?: number; limit?: number; category?: string } = {},
): { results: SearchResultItem[]; total: number; query: string } {
  const data = loadData();
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], total: 0, query };

  const terms = q.split(/\s+/).filter(Boolean);

  interface ScoredVideo {
    video: VideoRecord;
    score: number;
    snippet: string;
  }

  const scored: ScoredVideo[] = [];

  for (const v of data.videos) {
    // Filter by category if provided
    if (params.category && v.category_slug !== params.category) continue;

    let score = 0;
    let snippet = '';
    const titleLower = v.title.toLowerCase();
    const summaryLower = (v.summary || '').toLowerCase();
    const keyPointsJoined = (v.key_points || []).join(' ').toLowerCase();

    for (const term of terms) {
      if (titleLower.includes(term)) score += 10;
      if (summaryLower.includes(term)) score += 5;
      if (keyPointsJoined.includes(term)) score += 3;
    }

    if (score > 0) {
      // Build snippet from summary
      if (v.summary) {
        snippet = v.summary.substring(0, 150);
        if (v.summary.length > 150) snippet += '...';
      }
      scored.push({ video: v, score, snippet });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const total = scored.length;
  const start = (page - 1) * limit;
  const paged = scored.slice(start, start + limit);

  const results: SearchResultItem[] = paged.map((s) => ({
    video_id: s.video.id,
    youtube_id: s.video.youtube_id,
    title: s.video.title,
    summary: s.video.summary,
    thumbnail_url: s.video.thumbnail_url,
    duration_seconds: s.video.duration_seconds,
    published_at: s.video.published_at,
    category_slug: s.video.category_slug,
    category_name: s.video.category_name_he,
    score: s.score,
    snippet: s.snippet,
  }));

  return { results, total, query };
}

export interface SearchResultItem {
  video_id: string;
  youtube_id: string;
  title: string;
  summary: string;
  thumbnail_url: string;
  duration_seconds: number;
  published_at: string;
  category_slug: string;
  category_name: string;
  score: number;
  snippet: string;
}

export function getTotalVideoCount(): number {
  const data = loadData();
  return data.total_videos;
}

export function getSuggestions(query: string, limit = 6): string[] {
  const data = loadData();
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return [];

  const seen = new Set<string>();
  const results: string[] = [];

  // Match video titles containing the query terms
  for (const v of data.videos) {
    if (results.length >= limit) break;
    const titleLower = v.title.toLowerCase();
    if (titleLower.includes(q)) {
      // Use the full title as a suggestion, truncated
      const suggestion = v.title.length > 60 ? v.title.substring(0, 57) + '...' : v.title;
      if (!seen.has(suggestion)) {
        seen.add(suggestion);
        results.push(suggestion);
      }
    }
  }

  // Also match key_points for broader suggestions
  if (results.length < limit) {
    for (const v of data.videos) {
      if (results.length >= limit) break;
      for (const kp of v.key_points || []) {
        if (results.length >= limit) break;
        const kpLower = kp.toLowerCase();
        if (kpLower.includes(q)) {
          const suggestion = kp.length > 60 ? kp.substring(0, 57) + '...' : kp;
          if (!seen.has(suggestion)) {
            seen.add(suggestion);
            results.push(suggestion);
          }
        }
      }
    }
  }

  return results;
}
