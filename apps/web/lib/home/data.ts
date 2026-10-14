import 'server-only';

/**
 * Homepage data. Every loader degrades to empty data when Supabase is not
 * configured or a query fails, so the page always renders (ISR).
 */
import { cache } from 'react';
import { getVideo as getIndexedVideo, getVideos as getIndexedVideos, type VideoRecord } from '@/app/api/_lib/data';
import { getPublicDb, safeQuery } from '@/lib/content/db';
import { listActiveServicePlans, type ServicePlanWithPrices } from '@/lib/db/commerce';
import { getReviewStats } from '@/lib/db/reviews';
import { listPublishedVideoPages, type VideoPageSummary } from '@/lib/db/videos';
import { videoThumb } from '@/lib/content/videos';
import { BUILD_STAGES } from '@/lib/stages';
import { computeVideoStats, type KnowledgeStats } from './stats';
import { episodeNumber } from '@/lib/format';

/* ------------------------------------------------------------------ */
/* Knowledge stats                                                     */
/* ------------------------------------------------------------------ */

function allIndexedVideos(): VideoRecord[] {
  try {
    const first = getIndexedVideos({ page: 1, limit: 100 });
    const out = [...first.videos];
    for (let page = 2; page <= first.pages; page++) out.push(...getIndexedVideos({ page, limit: 100 }).videos);
    return out;
  } catch {
    return [];
  }
}

async function countPublishedPosts(): Promise<number> {
  const db = getPublicDb();
  if (!db) return 0;
  return safeQuery(async () => {
    const { count, error } = await db.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'published');
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, 0);
}

export const getKnowledgeStats = cache(async (): Promise<KnowledgeStats> => {
  const { videos, hours } = computeVideoStats(allIndexedVideos());
  const articles = await countPublishedPosts();
  return { videos, hours, articles };
});

/* ------------------------------------------------------------------ */
/* Journey stages                                                      */
/* ------------------------------------------------------------------ */

/** Published articles per stage category slug. */
export async function getStageArticleCounts(): Promise<Record<string, number>> {
  const db = getPublicDb();
  if (!db) return {};
  return safeQuery(async () => {
    const slugs = BUILD_STAGES.map((s) => s.categorySlug);
    const { data: cats, error } = await db.from('post_categories').select('id, slug').in('slug', slugs);
    if (error) throw new Error(error.message);
    const entries = await Promise.all(
      (cats ?? []).map(async (c) => {
        const res = await db
          .from('post_category_assignments')
          .select('post_id', { count: 'exact', head: true })
          .eq('category_id', c.id);
        return [c.slug.normalize('NFC'), res.count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries);
  }, {});
}

/* ------------------------------------------------------------------ */
/* Media rails                                                         */
/* ------------------------------------------------------------------ */

export interface HomeMediaItem {
  id: string;
  title: string;
  href: string;
  thumb: string | null;
  durationSeconds: number | null;
  kind: 'video' | 'podcast';
  /** "פרק 112" for podcasts, parsed from the title. */
  episode: string | null;
}

function toMediaItem(p: VideoPageSummary): HomeMediaItem {
  let duration: number | null = null;
  for (const id of p.youtube_ids ?? []) {
    try {
      const v = getIndexedVideo(id);
      if (v?.duration_seconds) {
        duration = Number(v.duration_seconds) || null;
        break;
      }
    } catch {
      break;
    }
  }
  return {
    id: p.id,
    title: p.title,
    href: `/video/${p.legacy_slug}/`,
    thumb: videoThumb(p),
    durationSeconds: duration,
    kind: p.kind,
    episode: p.kind === 'podcast' ? episodeNumber(p.title) : null,
  };
}

export async function getHomeMedia(limit = 8): Promise<{ podcasts: HomeMediaItem[]; videos: HomeMediaItem[] }> {
  const db = getPublicDb();
  if (!db) return { podcasts: [], videos: [] };
  const [podcasts, videos] = await Promise.all([
    safeQuery(async () => (await listPublishedVideoPages(db, { page: 1, pageSize: limit, kind: 'podcast' })).items, [] as VideoPageSummary[]),
    safeQuery(async () => (await listPublishedVideoPages(db, { page: 1, pageSize: limit, kind: 'video' })).items, [] as VideoPageSummary[]),
  ]);
  return { podcasts: podcasts.map(toMediaItem), videos: videos.map(toMediaItem) };
}

/* ------------------------------------------------------------------ */
/* Recommended pros                                                    */
/* ------------------------------------------------------------------ */

export interface HomePro {
  slug: string;
  name: string;
  tagline: string | null;
  photo: string | null;
  specialty: string | null;
  region: string | null;
  ratingPercent: number | null;
  ratingAvg: number | null;
  reviewCount: number;
}

export async function getHomePros(limit = 8): Promise<HomePro[]> {
  const db = getPublicDb();
  if (!db) return [];
  return safeQuery(async () => {
    const { data, error } = await db
      .from('businesses')
      .select('id, slug, name, tagline, logo_url, city, primary_specialty_id')
      .eq('status', 'published')
      .order('is_featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ids = rows.map((r) => r.id);
    const specialtyIds = Array.from(new Set(rows.map((r) => r.primary_specialty_id).filter((x): x is string => !!x)));
    const [stats, specialties, regionLinks] = await Promise.all([
      getReviewStats(db, ids),
      specialtyIds.length ? db.from('specialties').select('id, name').in('id', specialtyIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      ids.length ? db.from('business_regions').select('business_id, region_id').in('business_id', ids) : Promise.resolve({ data: [] as Array<{ business_id: string; region_id: string }> }),
    ]);
    const regionIds = Array.from(new Set((regionLinks.data ?? []).map((l) => l.region_id)));
    const regions = regionIds.length ? (await db.from('regions').select('id, name').in('id', regionIds)).data ?? [] : [];
    const specialtyName = new Map((specialties.data ?? []).map((s) => [s.id, s.name]));
    const regionName = new Map(regions.map((r) => [r.id, r.name]));
    const firstRegion = new Map<string, string>();
    for (const l of regionLinks.data ?? []) {
      if (!firstRegion.has(l.business_id)) firstRegion.set(l.business_id, regionName.get(l.region_id) ?? '');
    }
    return rows.map((r) => {
      const s = stats.get(r.id);
      return {
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        photo: r.logo_url,
        specialty: r.primary_specialty_id ? specialtyName.get(r.primary_specialty_id) ?? null : null,
        region: firstRegion.get(r.id) || r.city || null,
        ratingPercent: s?.rating_percent ?? null,
        ratingAvg: s?.rating_avg != null ? Number(s.rating_avg) : null,
        reviewCount: s?.review_count ?? 0,
      };
    });
  }, []);
}

/** Number of published pros (for "158 בעלי מקצוע"). */
export async function countPublishedPros(): Promise<number> {
  const db = getPublicDb();
  if (!db) return 0;
  return safeQuery(async () => {
    const { count, error } = await db.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'published');
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Benefits and plans                                                  */
/* ------------------------------------------------------------------ */

export interface HomeBenefit {
  slug: string;
  name: string;
  tag: string | null;
  subtitle: string | null;
  image: string | null;
}

export async function getHomeBenefits(limit = 3): Promise<HomeBenefit[]> {
  const db = getPublicDb();
  if (!db) return [];
  return safeQuery(async () => {
    const { data, error } = await db
      .from('products')
      .select('slug, name, tag_label, subtitle, featured_image')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({ slug: p.slug, name: p.name, tag: p.tag_label, subtitle: p.subtitle, image: p.featured_image }));
  }, []);
}

export async function getHomePlans(): Promise<ServicePlanWithPrices[]> {
  const db = getPublicDb();
  if (!db) return [];
  return safeQuery(() => listActiveServicePlans(db), []);
}
