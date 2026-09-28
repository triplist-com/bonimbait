/**
 * /recommended/ listing: URL <-> filter state, filtering, sorting, paging.
 *
 * URL contract (shareable and crawlable, matches the live site where it has one):
 *   /recommended/                         page 1, live order
 *   /recommended/page/<n>/                pagination (live WordPress form)
 *   ?sort_by=rating | comments            live sort options
 *   ?specialty=<specialty slug>           91 specialties
 *   ?region=<region slug>                 master `regions` (nationwide businesses always match)
 *   ?q=<free text>                        name / description / specialty names
 *
 * Pure module: safe for server and client.
 */
import type { DirectoryEntry } from '@/lib/db/businesses';
import type { BusinessReviewStatsRow, RegionRow, SpecialtyRow } from '@/lib/db/types';
import { htmlToText } from './html';

export const PAGE_SIZE = 12; // live: 12 per page
export const LISTING_PATH = '/recommended/';

export type SortKey = 'default' | 'rating' | 'comments';

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'default', label: 'מיון: ברירת מחדל' },
  { value: 'rating', label: 'הכי מדורג' },
  { value: 'comments', label: 'הכי הרבה חוות דעת' },
];

export type ListingFilters = {
  specialty: string | null; // slug
  region: string | null; // slug
  q: string | null;
  sort: SortKey;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed.normalize('NFC') : null;
}

export function parseFilters(searchParams: SearchParams, page = 1): ListingFilters {
  const sortRaw = first(searchParams.sort_by);
  const q = first(searchParams.q);
  return {
    specialty: first(searchParams.specialty),
    region: first(searchParams.region),
    q: q ? q.slice(0, 80) : null,
    sort: sortRaw === 'rating' || sortRaw === 'comments' ? sortRaw : 'default',
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  };
}

/** Canonical listing URL for a filter state (relative, percent-encoded). */
export function listingHref(filters: Partial<ListingFilters>): string {
  const page = filters.page && filters.page > 1 ? filters.page : 1;
  const path = page > 1 ? `${LISTING_PATH}page/${page}/` : LISTING_PATH;
  const params = new URLSearchParams();
  if (filters.specialty) params.set('specialty', filters.specialty);
  if (filters.region) params.set('region', filters.region);
  if (filters.q) params.set('q', filters.q);
  if (filters.sort && filters.sort !== 'default') params.set('sort_by', filters.sort);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function hasActiveFilters(f: ListingFilters): boolean {
  return Boolean(f.specialty || f.region || f.q);
}

/** Lower-case, strip Hebrew niqqud/cantillation and punctuation for matching. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[״"׳'`.,:;!?()[\]{}\-–—/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ListingResult = {
  items: DirectoryEntry[];
  total: number;
  page: number;
  pageCount: number;
  specialty: SpecialtyRow | null;
  region: RegionRow | null;
};

export function applyListing(
  entries: DirectoryEntry[],
  filters: ListingFilters,
  ctx: {
    specialties: SpecialtyRow[];
    regions: RegionRow[];
    stats: Map<string, BusinessReviewStatsRow>;
  },
): ListingResult {
  const specialty = filters.specialty ? ctx.specialties.find((s) => s.slug === filters.specialty) ?? null : null;
  const region = filters.region ? ctx.regions.find((r) => r.slug === filters.region) ?? null : null;
  const nationwideIds = new Set(ctx.regions.filter((r) => r.is_nationwide).map((r) => r.id));
  const specialtyName = new Map(ctx.specialties.map((s) => [s.id, s.name]));

  let items = entries;
  // An unknown specialty/region slug yields no results rather than silently ignoring the filter.
  if (filters.specialty) {
    items = specialty ? items.filter((b) => b.specialtyIds.includes(specialty.id)) : [];
  }
  if (filters.region) {
    items = region
      ? items.filter((b) => b.regionIds.some((id) => id === region.id || nationwideIds.has(id)))
      : [];
  }
  if (filters.q) {
    const terms = normalizeForSearch(filters.q).split(' ').filter(Boolean);
    items = items.filter((b) => {
      const haystack = normalizeForSearch(
        [b.name, b.tagline ?? '', b.city ?? '', htmlToText(b.description_html), ...b.specialtyIds.map((id) => specialtyName.get(id) ?? '')].join(' '),
      );
      return terms.every((t) => haystack.includes(t));
    });
  }

  const stat = (b: DirectoryEntry) => ctx.stats.get(b.id);
  const liveOrder = (a: DirectoryEntry, b: DirectoryEntry) =>
    Number(b.is_featured) - Number(a.is_featured) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'he');
  const byRating = (a: DirectoryEntry, b: DirectoryEntry) =>
    (stat(b)?.rating_percent ?? -1) - (stat(a)?.rating_percent ?? -1);
  const byCount = (a: DirectoryEntry, b: DirectoryEntry) => (stat(b)?.review_count ?? 0) - (stat(a)?.review_count ?? 0);

  const sorted = [...items].sort((a, b) => {
    if (filters.sort === 'rating') return byRating(a, b) || byCount(a, b) || liveOrder(a, b);
    if (filters.sort === 'comments') return byCount(a, b) || byRating(a, b) || liveOrder(a, b);
    return liveOrder(a, b);
  });

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  return {
    items: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total,
    page,
    pageCount,
    specialty,
    region,
  };
}

/** Page numbers with gaps, like WordPress paginate_links: 1 2 3 … 14 */
export function pageWindow(current: number, count: number): Array<number | 'gap'> {
  const pages = new Set<number>([1, count, current - 1, current, current + 1]);
  if (current <= 3) [2, 3].forEach((p) => pages.add(p));
  const list = Array.from(pages).filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}
