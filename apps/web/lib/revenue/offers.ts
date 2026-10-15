/**
 * Sponsored offers: which live partner campaign fits a page or an answer.
 * Pure and client-safe (unit-tested); lib/revenue/offers-server.ts loads the
 * campaigns and <PartnerOfferSlot> renders the winner.
 *
 * A campaign targets topics, stages, regions and placements; an empty list
 * means "any". A targeted dimension the context doesn't know never matches
 * (a windows campaign is not shown on a page with no topic). Among matches:
 *
 *   score = 30 per matched topic dimension + 10 per matched stage / region
 *         + priority (admin, -100..100) + 5 x the partner's tier rank
 *
 * so the most specific, then the highest-paying, offer wins.
 */
import { isTopicKey, topicsForContext, type TopicKey } from './topics';
import type { OfferContext, PartnerCampaignRow } from './types';

export type OfferCampaign = Pick<
  PartnerCampaignRow,
  'id' | 'business_id' | 'status' | 'starts_at' | 'ends_at' | 'topics' | 'stages' | 'region_slugs' | 'placements' | 'priority' | 'created_at'
>;

export const OFFER_WEIGHTS = { topic: 30, stage: 10, region: 10, tierRank: 5 } as const;

export function isCampaignLive(c: Pick<OfferCampaign, 'status' | 'starts_at' | 'ends_at'>, now: Date = new Date()): boolean {
  const t = now.getTime();
  return (
    c.status === 'active' &&
    (!c.starts_at || Date.parse(c.starts_at) <= t) &&
    (!c.ends_at || Date.parse(c.ends_at) > t)
  );
}

export type OfferMatch<C extends OfferCampaign> = { campaign: C; score: number; topics: TopicKey[] };

export function matchOffers<C extends OfferCampaign>(
  campaigns: readonly C[],
  ctx: OfferContext,
  opts: { now?: Date; limit?: number; tierRanks?: ReadonlyMap<string, number> } = {},
): OfferMatch<C>[] {
  const now = opts.now ?? new Date();
  const ctxTopics = topicsForContext(ctx.topic ?? null);
  const out: OfferMatch<C>[] = [];
  for (const c of campaigns) {
    if (!isCampaignLive(c, now)) continue;
    if (c.placements.length && (!ctx.placement || !c.placements.includes(ctx.placement))) continue;
    let score = c.priority + (opts.tierRanks?.get(c.business_id) ?? 0) * OFFER_WEIGHTS.tierRank;
    let matched: TopicKey[] = [];
    if (c.topics.length) {
      matched = ctxTopics.filter((t) => c.topics.includes(t));
      if (!matched.length) continue;
      score += OFFER_WEIGHTS.topic;
    }
    if (c.stages.length) {
      if (!ctx.stage || !c.stages.includes(ctx.stage)) continue;
      score += OFFER_WEIGHTS.stage;
    }
    if (c.region_slugs.length) {
      if (!ctx.region || !c.region_slugs.includes(ctx.region)) continue;
      score += OFFER_WEIGHTS.region;
    }
    out.push({ campaign: c, score, topics: matched.length ? matched : c.topics.filter(isTopicKey) });
  }
  out.sort((a, b) => b.score - a.score || a.campaign.created_at.localeCompare(b.campaign.created_at));
  return typeof opts.limit === 'number' ? out.slice(0, Math.max(0, opts.limit)) : out;
}
