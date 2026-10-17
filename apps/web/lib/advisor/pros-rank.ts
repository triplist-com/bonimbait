/**
 * The pros under an answer, in order: the revenue squad's rankPros()
 * (lib/directory/match.ts) over the specialty's published pros, so partner
 * tiers reorder pros WITHIN relevance (region fit and reputation) and never
 * replace it. Pure and client-safe; app/api/_lib/pros.ts loads the rows.
 *
 *   relevance   the question's specialty (the classifier), then the visitor's
 *               region: when any pro serves it (nationwide pros included),
 *               only those are candidates; otherwise everyone in the specialty
 *   order       rankPros(): exact region +30 / nationwide +15, rating and
 *               reviews, the owner's featured pick, +12 per partner tier rank
 */
import { rankPros, type ProCandidate } from '@/lib/directory/match';
import type { PartnerBadge } from '@/lib/revenue/tiers';

export type ProRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  city: string | null;
  logo_url: string | null;
  is_featured: boolean | null;
  sort_order: number | null;
};

export type ProRankInput = {
  rows: readonly ProRow[];
  /** business id -> regions.id it serves */
  regionsByBusiness: ReadonlyMap<string, readonly string[]>;
  /** business id -> review stats */
  statsByBusiness: ReadonlyMap<string, { ratingPercent: number | null; reviewCount: number }>;
  /** business id -> live partner tier (the public partner_badges view) */
  badges: ReadonlyMap<string, PartnerBadge>;
  /** The visitor's region (regions.id), when the list was narrowed to it. */
  regionId?: string | null;
  nationwideRegionIds?: ReadonlySet<string>;
  limit: number;
};

export type RankedAnswerPro = ProRow & { badge: PartnerBadge | null; boosted: boolean };

export function rankAnswerPros(input: ProRankInput): RankedAnswerPro[] {
  const candidates: Array<ProRow & ProCandidate> = input.rows.map((r) => {
    const stats = input.statsByBusiness.get(r.id);
    return {
      ...r,
      regionIds: input.regionsByBusiness.get(r.id) ?? [],
      ratingPercent: stats?.ratingPercent ?? null,
      reviewCount: stats?.reviewCount ?? 0,
      isFeatured: r.is_featured,
      sortOrder: r.sort_order,
    };
  });
  const tierRanks = new Map(Array.from(input.badges, ([id, b]) => [id, b.rank]));
  return rankPros(candidates, {
    tierRanks,
    regionId: input.regionId ?? null,
    nationwideRegionIds: input.nationwideRegionIds,
    limit: input.limit,
  }).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    city: p.city,
    logo_url: p.logo_url,
    is_featured: p.is_featured,
    sort_order: p.sort_order,
    badge: input.badges.get(p.id) ?? null,
    boosted: p.boosted,
  }));
}
