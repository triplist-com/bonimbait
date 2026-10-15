/**
 * Partner tier effects, as pure functions (unit-tested):
 *
 *   orderWithinRelevance()  /recommended/: paid tiers come first INSIDE each
 *                           relevance bucket, never above a better match.
 *   tierScoreBoost()        the pros shown under AI answers (lib/directory/match.ts
 *                           rankPros) get a priority boost per tier rank.
 *
 * Tier rank: 0 = no tier, 1 = חברים, 2 = שותפים, 3 = שגרירים (partner_tiers.rank).
 * Client-safe.
 */

export type PartnerBadge = {
  tierSlug: string;
  tierName: string;
  badgeLabel: string;
  rank: number;
};

/** Points a tier adds to a pro's match score under an answer (per rank). */
export const TIER_MATCH_BOOST = 12;

export function tierScoreBoost(rank: number | null | undefined): number {
  return Math.max(0, Math.min(9, Math.floor(rank ?? 0))) * TIER_MATCH_BOOST;
}

/**
 * Stable order: relevance bucket first (lower = more relevant), then tier
 * rank (higher first), then the caller's own order. Paying never lifts a
 * business above a more relevant one.
 */
export function orderWithinRelevance<T>(
  items: readonly T[],
  opts: {
    relevance?: (item: T) => number;
    tierRank: (item: T) => number;
    tiebreak: (a: T, b: T) => number;
  },
): T[] {
  const relevance = opts.relevance ?? (() => 0);
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        relevance(a.item) - relevance(b.item) ||
        opts.tierRank(b.item) - opts.tierRank(a.item) ||
        opts.tiebreak(a.item, b.item) ||
        a.index - b.index,
    )
    .map((x) => x.item);
}
