import type { ConstructionStage } from '@/lib/db/types';
import { stageForProfile } from '@/lib/stages';

/**
 * Published Content Autopilot videos in the site's video lists: the video hub
 * (/בונים-בית-tv/), the homepage rails and /videos. Pure helpers (no DB, no
 * server-only), so the merge rules are unit-tested.
 */

/** One published runtime video, as the list query returns it. */
export interface RuntimeListItem {
  youtube_id: string;
  title: string;
  published_at: string | null;
  duration_s: number | null;
  thumbnail_url: string;
  category_slug: string;
  category_name: string;
  stage: ConstructionStage | null;
  summary: string;
  costs_count: number;
  tips_count: number;
}

/** The channel's podcast episodes are YouTube uploads too; their titles say so. */
export function runtimeKind(title: string): 'video' | 'podcast' {
  return /פודקאסט/.test(title) ? 'podcast' : 'video';
}

/**
 * The hub's stage category ([{ name, slug }], like a legacy page's
 * legacy_categories) for the summary's build stage. Empty when the stage has
 * no hub section.
 */
export function stageCategories(stage: ConstructionStage | null): Array<{ name: string; slug: string }> {
  // Renovation has no build stage, but the hub has a section for it.
  if (stage === 'renovation') return [{ name: 'שיפוצים', slug: 'שיפוצים' }];
  const s = stageForProfile(stage);
  return s ? [{ name: `שלב ${s.label}`, slug: s.categorySlug }] : [];
}

function time(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * Merge two lists that are each already sorted newest first, keeping each
 * list's own order. An item of `b` goes before an item of `a` only when it is
 * strictly newer, so ties keep `a` (the existing list) first.
 */
export function mergeNewestFirst<A, B>(
  a: readonly A[],
  b: readonly B[],
  dateA: (x: A) => string | null | undefined,
  dateB: (x: B) => string | null | undefined,
): Array<A | B> {
  const out: Array<A | B> = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j < b.length && (i >= a.length || time(dateB(b[j])) > time(dateA(a[i])))) out.push(b[j++]);
    else out.push(a[i++]);
  }
  return out;
}

/**
 * /videos order for static-index videos (already sorted by `sort`) plus
 * runtime videos (newest first). Runtime videos have no view counts, so under
 * "popular" they come after every static video.
 */
export function mergeForSort<T extends { published_at: string | null; view_count?: number }>(
  statics: readonly T[],
  runtime: readonly T[],
  sort: string,
): T[] {
  const date = (v: T) => v.published_at;
  if (sort === 'popular') return [...statics, ...runtime];
  if (sort === 'oldest') {
    // Oldest first is newest first read backwards; reverse back keeping static order on ties.
    return mergeNewestFirst([...statics].reverse(), [...runtime], date, date).reverse() as T[];
  }
  return mergeNewestFirst(statics, runtime, date, date) as T[];
}

/** Runtime videos that no legacy page already embeds (a legacy page wins). */
export function withoutEmbedded<T extends { youtube_id: string }>(
  items: readonly T[],
  legacyYoutubeIds: ReadonlyArray<string | null | undefined>,
): T[] {
  const taken = new Set(legacyYoutubeIds.filter((id): id is string => !!id));
  return items.filter((v) => !taken.has(v.youtube_id));
}
