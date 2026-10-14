import { getCategories, type VideoRecord } from '@/app/api/_lib/data';
import { rememberRuntimeVideo } from './registry';
import { youtubeThumbnail } from './rss';
import { DEFAULT_CATEGORY, FALLBACK_CATEGORIES } from './summary';
import type { KnowledgeMatchRow, SourceSummary } from './types';

/**
 * Runtime video -> the static index's VideoRecord shape (what getVideo()
 * returns), and registry entries from search matches. No React or DB imports:
 * this sits on the search path (fusion.ts).
 */

/** AI-index video categories (videos.json), with a built-in fallback. */
export function videoCategories(): ReadonlyArray<{ slug: string; name_he: string }> {
  try {
    const cats = getCategories();
    return cats.length > 0 ? cats : FALLBACK_CATEGORIES;
  } catch {
    return FALLBACK_CATEGORIES;
  }
}

export function categoryName(slug: string | null | undefined): string {
  const s = slug || DEFAULT_CATEGORY;
  try {
    const hit = getCategories().find((c) => c.slug === s);
    if (hit) return hit.name_he;
  } catch {
    // static data unavailable
  }
  return FALLBACK_CATEGORIES.find((c) => c.slug === s)?.name_he ?? 'טיפים כלליים';
}

/** The static-index record shape, so getVideo() consumers work unchanged. */
export function toVideoRecord(v: {
  youtube_id: string;
  title: string;
  duration_s: number | null;
  thumbnail_url: string | null;
  published_at: string | null;
  category_slug: string | null;
  summary: Partial<SourceSummary> | null;
  chunk_count?: number;
}): VideoRecord {
  const category = v.category_slug || v.summary?.category_slug || DEFAULT_CATEGORY;
  return {
    id: v.youtube_id,
    youtube_id: v.youtube_id,
    title: v.title,
    description: '',
    duration_seconds: v.duration_s ?? 0,
    thumbnail_url: v.thumbnail_url || youtubeThumbnail(v.youtube_id),
    published_at: v.published_at ? v.published_at.slice(0, 10) : '',
    view_count: 0,
    category_slug: category,
    category_name_he: categoryName(category),
    summary: v.summary?.summary ?? '',
    key_points: (v.summary?.key_points ?? []).map((k) => k.text),
    costs: (v.summary?.costs ?? []).map((c) => ({ item: c.item, price: c.price, unit: c.unit, context: c.context })),
    tips: v.summary?.tips ?? [],
    rules: [],
    warnings: v.summary?.warnings ?? [],
    materials: [],
    difficulty_level: '',
    has_transcript: true,
    segment_count: v.chunk_count ?? 0,
  };
}

/** Registry entry from a search match (the RPC returns the source fields with each chunk). */
export function rememberMatch(row: KnowledgeMatchRow): void {
  rememberRuntimeVideo(
    toVideoRecord({
      youtube_id: row.external_id,
      title: row.title,
      duration_s: row.duration_s,
      thumbnail_url: row.thumbnail_url,
      published_at: row.published_at,
      category_slug: row.category_slug,
      summary: row.summary_text ? { summary: row.summary_text } : null,
    }),
  );
}
