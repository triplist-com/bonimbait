import 'server-only';

import { cache } from 'react';
import type { DbClient } from '@/lib/db/client';
import type { PostCategoryRow } from '@/lib/db/types';
import { listAuthors, listPostCategories } from '@/lib/db/posts';
import { getPublicDb, safeQuery } from './db';

/**
 * Content-workstream queries that don't belong in a single lib/db domain
 * module: per-request cached lookups and small read-only teasers of other
 * domains (businesses, products) for the homepage.
 */

/** Construction-stage categories, in journey order (live "איפה אתם במסע?"). */
export const STAGE_CATEGORY_SLUGS = [
  'שלב-רכישה',
  'שלב-תכנון',
  'שלב-היתר',
  'שלב-שלד',
  'שלב-תשתיות',
  'שלב-גמרים',
  'כניסה-לבית',
  'שיפוצים',
] as const;

/** Fallback names if the categories table is still empty. */
export const STAGE_FALLBACK_NAMES: Record<string, string> = {
  'שלב-רכישה': 'שלב רכישת נכס',
  'שלב-תכנון': 'שלב תכנון הפרויקט',
  'שלב-היתר': 'שלב מכרז קבלנים',
  'שלב-שלד': 'שלב עבודות שלד',
  'שלב-תשתיות': 'שלב עבודות תשתית',
  'שלב-גמרים': 'שלב עבודות גמר',
  'כניסה-לבית': 'שלב אכלוס הבית',
  'שיפוצים': 'שיפוצים',
};

export const getCategoryMap = cache(async (): Promise<Map<string, PostCategoryRow>> => {
  const db = getPublicDb();
  if (!db) return new Map();
  const rows = await safeQuery(() => listPostCategories(db), []);
  return new Map(rows.map((c) => [c.id, c]));
});

export const getAuthorMap = cache(async () => {
  const db = getPublicDb();
  if (!db) return new Map<string, { slug: string; name: string }>();
  const rows = await safeQuery(() => listAuthors(db), []);
  return new Map(rows.map((a) => [a.id, a]));
});

export interface StageLink {
  slug: string;
  name: string;
  href: string;
}

export async function getStageLinks(): Promise<StageLink[]> {
  const categories = Array.from((await getCategoryMap()).values());
  const bySlug = new Map(categories.map((c) => [c.slug.normalize('NFC'), c]));
  return STAGE_CATEGORY_SLUGS.map((slug) => ({
    slug,
    name: bySlug.get(slug)?.name ?? STAGE_FALLBACK_NAMES[slug] ?? slug,
    href: `/category/${slug}/`,
  }));
}

// ---------------------------------------------------------------------------
// Read-only teasers of other domains (homepage)
// ---------------------------------------------------------------------------

export interface BusinessTeaser {
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  city: string | null;
  specialty: string | null;
}

export async function listFeaturedBusinesses(limit = 6): Promise<BusinessTeaser[]> {
  const db = getPublicDb();
  if (!db) return [];
  return safeQuery(async () => {
    const { data, error } = await db
      .from('businesses')
      .select('slug, name, tagline, logo_url, city, primary_specialty_id')
      .eq('status', 'published')
      .order('is_featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const specialtyIds = Array.from(new Set(rows.map((r) => r.primary_specialty_id).filter((x): x is string => !!x)));
    const names = new Map<string, string>();
    if (specialtyIds.length) {
      const res = await db.from('specialties').select('id, name').in('id', specialtyIds);
      for (const s of res.data ?? []) names.set(s.id, s.name);
    }
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      logo_url: r.logo_url,
      city: r.city,
      specialty: r.primary_specialty_id ? names.get(r.primary_specialty_id) ?? null : null,
    }));
  }, []);
}

export interface ProductTeaser {
  slug: string;
  name: string;
  short_description: string | null;
  featured_image: string | null;
}

export async function listBenefitProducts(limit = 3): Promise<ProductTeaser[]> {
  const db = getPublicDb();
  if (!db) return [];
  return safeQuery(async () => {
    const { data, error } = await db
      .from('products')
      .select('slug, name, short_description, featured_image')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }, []);
}

/** Slugs for the sitemap from other domains' public tables. */
export async function listSlugs(
  db: DbClient,
  table: 'businesses' | 'products',
): Promise<Array<{ slug: string; updated_at: string }>> {
  return safeQuery(async () => {
    const out: Array<{ slug: string; updated_at: string }> = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from(table)
        .select('slug, updated_at')
        .eq('status', 'published')
        .order('slug')
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }, []);
}
