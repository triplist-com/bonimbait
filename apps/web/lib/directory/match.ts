/**
 * Ranking the pros shown under an AI answer (and anywhere else a few pros are
 * suggested for a question): rankPros() orders candidates of the matched
 * specialty by region fit, reputation and partner tier.
 *
 *   const ranked = rankPros(candidates, { tierRanks, regionId, nationwideRegionIds, limit: 3 });
 *
 * Score per candidate:
 *   region       +30 serves the asker's region, +15 serves nationwide
 *   reputation   rating % x 0.3 (0-30) + min(reviews, 20) x 0.5 (0-10)
 *   featured     +5 (the owner's manual pick)
 *   tier         +12 per tier rank (חברים 12, שותפים 24, שגרירים 36): the
 *                partner priority boost (lib/revenue/tiers.ts)
 * Ties keep the directory order (sort_order, then name).
 *
 * Pure and client-safe. The advisor squad wires it into the answer's pros CTA
 * (app/api/_lib/pros.ts) at integration; tier ranks come from the public
 * partner_badges view (lib/revenue/badges.ts loadPartnerBadges).
 */
import { tierScoreBoost } from '@/lib/revenue/tiers';

export type ProCandidate = {
  id: string;
  name: string;
  regionIds?: readonly string[] | null;
  ratingPercent?: number | null;
  reviewCount?: number | null;
  isFeatured?: boolean | null;
  sortOrder?: number | null;
};

export type RankProsOptions = {
  /** Business id -> tier rank (0 or absent = no tier). */
  tierRanks?: ReadonlyMap<string, number>;
  /** The asker's region (regions.id), when known. */
  regionId?: string | null;
  /** Region ids that mean "serves the whole country". */
  nationwideRegionIds?: ReadonlySet<string>;
  limit?: number;
};

export type RankedPro<T extends ProCandidate> = T & {
  matchScore: number;
  tierRank: number;
  /** True when the tier boost changed this pro's position. */
  boosted: boolean;
};

export const MATCH_WEIGHTS = {
  regionExact: 30,
  regionNationwide: 15,
  ratingFactor: 0.3,
  reviewFactor: 0.5,
  reviewCap: 20,
  featured: 5,
} as const;

function baseScore(c: ProCandidate, opts: RankProsOptions): number {
  const regions = c.regionIds ?? [];
  let score = 0;
  if (opts.regionId && regions.includes(opts.regionId)) score += MATCH_WEIGHTS.regionExact;
  else if (regions.some((r) => opts.nationwideRegionIds?.has(r))) score += MATCH_WEIGHTS.regionNationwide;
  score += Math.max(0, Math.min(100, c.ratingPercent ?? 0)) * MATCH_WEIGHTS.ratingFactor;
  score += Math.min(MATCH_WEIGHTS.reviewCap, Math.max(0, c.reviewCount ?? 0)) * MATCH_WEIGHTS.reviewFactor;
  if (c.isFeatured) score += MATCH_WEIGHTS.featured;
  return score;
}

function directoryOrder(a: ProCandidate, b: ProCandidate): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'he');
}

export function rankPros<T extends ProCandidate>(candidates: readonly T[], opts: RankProsOptions = {}): RankedPro<T>[] {
  const scored = candidates.map((c) => {
    const tierRank = opts.tierRanks?.get(c.id) ?? 0;
    const base = baseScore(c, opts);
    return { c, base, tierRank, matchScore: base + tierScoreBoost(tierRank) };
  });
  const byBase = [...scored].sort((a, b) => b.base - a.base || directoryOrder(a.c, b.c));
  const baseRank = new Map(byBase.map((s, i) => [s.c.id, i]));
  const ranked = [...scored].sort((a, b) => b.matchScore - a.matchScore || directoryOrder(a.c, b.c));
  const out = ranked.map((s, i) => ({
    ...s.c,
    matchScore: Math.round(s.matchScore * 10) / 10,
    tierRank: s.tierRank,
    boosted: s.tierRank > 0 && i < (baseRank.get(s.c.id) ?? i),
  }));
  return typeof opts.limit === 'number' ? out.slice(0, Math.max(0, opts.limit)) : out;
}
