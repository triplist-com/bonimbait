import 'server-only';

/**
 * getContextualOffers(): the partner offers that fit a context, ready to
 * render. Exported for the advisor (offers next to an answer), the hub
 * (offers per roadmap stage) and the planner (offers on the estimate); they
 * wire it at integration:
 *
 *   const [offer] = await getContextualOffers({ topic: 'windows', stage: 'permit', region: 'sharon', placement: 'answer' });
 *   // render inside <ViewableImpression slot={`answer:${offer.businessId}`} partnerId={offer.businessId} offerId={offer.campaignId}>
 *
 * The partner key is the business id (lib/revenue/partner-tiers.ts). Uses the
 * anonymous client (live campaigns and badges are public), so ISR pages stay
 * static. Campaigns are cached per instance for a minute. Never throws: no
 * offer is always an acceptable answer. Off unless FLAG_REVENUE.
 */
import { isEnabled } from '@/lib/flags';
import { loadPartnerBadges, tierRanks } from './badges';
import { revenuePublicDb } from './db';
import { matchOffers } from './offers';
import type { OfferContext, PartnerCampaignRow, PartnerOffer } from './types';

const TTL_MS = 60_000;
type Loaded = {
  at: number;
  campaigns: PartnerCampaignRow[];
  businesses: Map<string, { name: string; slug: string; logo_url: string | null }>;
  ranks: Map<string, number>;
  badges: Awaited<ReturnType<typeof loadPartnerBadges>>;
};
let cache: Loaded | null = null;

/** Forget cached campaigns (after an admin edit; tests). */
export function invalidateOffers(): void {
  cache = null;
}

async function load(): Promise<Loaded | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const db = revenuePublicDb();
  if (!db) return null;
  const { data, error } = await db.from('partner_campaigns').select('*').eq('status', 'active');
  if (error) throw new Error(error.message);
  const campaigns = (data ?? []) as PartnerCampaignRow[];
  const ids = Array.from(new Set(campaigns.map((c) => c.business_id)));
  const [biz, badges] = await Promise.all([
    ids.length ? db.from('businesses').select('id, name, slug, logo_url').in('id', ids) : Promise.resolve({ data: [], error: null }),
    loadPartnerBadges(db),
  ]);
  if (biz.error) throw new Error(biz.error.message);
  cache = {
    at: Date.now(),
    campaigns,
    businesses: new Map((biz.data ?? []).map((b) => [b.id, { name: b.name, slug: b.slug, logo_url: b.logo_url }])),
    ranks: tierRanks(badges),
    badges,
  };
  return cache;
}

export async function getContextualOffers(ctx: OfferContext, opts: { limit?: number; now?: Date } = {}): Promise<PartnerOffer[]> {
  if (!isEnabled('revenue')) return [];
  try {
    const data = await load();
    if (!data) return [];
    // Only campaigns of businesses that are published (the public client sees no others).
    const visible = data.campaigns.filter((c) => data.businesses.has(c.business_id));
    return matchOffers(visible, ctx, { now: opts.now, limit: opts.limit ?? 1, tierRanks: data.ranks }).map(({ campaign: c, topics }) => {
      const b = data.businesses.get(c.business_id)!;
      const badge = data.badges.get(c.business_id) ?? null;
      return {
        campaignId: c.id,
        businessId: c.business_id,
        businessName: b.name,
        businessSlug: b.slug,
        logoUrl: b.logo_url,
        tier: badge ? { slug: badge.tierSlug, name: badge.tierName, badgeLabel: badge.badgeLabel, rank: badge.rank } : null,
        headline: c.headline,
        body: c.body,
        ctaLabel: c.cta_label,
        href: c.target_url,
        imageUrl: c.image_url,
        topics,
      };
    });
  } catch (err) {
    console.error(`[revenue] offers unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
