import 'server-only';

/**
 * Which partner is on which tier: live subscriptions joined to their tier.
 *
 * The partner key everywhere in the platform is the partner's businesses.id:
 * <PartnerOfferSlot> / <ViewableImpression> send it as `partner_id` on
 * partner_impression / partner_click, the 4-hour attribution stores it as
 * leads.attribution.source, and partner_subscriptions.business_id is the same
 * id. The command center (lib/command/load.ts partnerDirectory()) reads tiers
 * through loadPartnerTiers().
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbClient } from '@/lib/db/client';
import { asRevenueDb } from './db';
import type { PartnerSubscriptionStatus } from './types';

/** Subscriptions that count as "on a tier" (paid, or paid and awaiting renewal). */
export const LIVE_SUBSCRIPTION_STATUSES: readonly PartnerSubscriptionStatus[] = ['active', 'past_due'];

export type PartnerTierRecord = {
  businessId: string;
  tierId: string;
  tierSlug: string;
  tierName: string;
  badgeLabel: string;
  /** 1 = חברים ... 3 = שגרירים. */
  rank: number;
  /** What this partner pays per month (locked at purchase), agorot. */
  priceAgorot: number;
  monthlyImpressionTarget: number | null;
  status: PartnerSubscriptionStatus;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Live tier per business id (ids that aren't business ids are ignored). Throws on a DB error. */
export async function loadPartnerTiers(
  db: DbClient | SupabaseClient,
  businessIds?: readonly string[] | null,
): Promise<Map<string, PartnerTierRecord>> {
  const rdb = asRevenueDb(db);
  const ids = businessIds ? businessIds.filter((id) => UUID_RE.test(id)).slice(0, 500) : null;
  const out = new Map<string, PartnerTierRecord>();
  if (ids && ids.length === 0) return out;

  let subsQuery = rdb
    .from('partner_subscriptions')
    .select('business_id, tier_id, status, price_agorot, started_at')
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES]);
  if (ids) subsQuery = subsQuery.in('business_id', ids);
  const subs = await subsQuery;
  if (subs.error) throw new Error(subs.error.message);
  if (!subs.data?.length) return out;

  const tiers = await rdb
    .from('partner_tiers')
    .select('id, slug, name, badge_label, rank, monthly_impression_target')
    .in('id', Array.from(new Set(subs.data.map((s) => s.tier_id))));
  if (tiers.error) throw new Error(tiers.error.message);
  const tierById = new Map((tiers.data ?? []).map((t) => [t.id, t]));

  for (const s of subs.data) {
    const t = tierById.get(s.tier_id);
    if (!t) continue;
    const prev = out.get(s.business_id);
    // One live subscription per business (unique index); keep the higher tier if data ever disagrees.
    if (prev && prev.rank >= t.rank) continue;
    out.set(s.business_id, {
      businessId: s.business_id,
      tierId: t.id,
      tierSlug: t.slug,
      tierName: t.name,
      badgeLabel: t.badge_label,
      rank: t.rank,
      priceAgorot: s.price_agorot,
      monthlyImpressionTarget: t.monthly_impression_target,
      status: s.status,
    });
  }
  return out;
}

/** The command center's tier id for a tier ('members' | 'partners' | 'ambassadors'), by slug, else by rank. */
export function commandTierId(record: Pick<PartnerTierRecord, 'tierSlug' | 'rank'>): 'members' | 'partners' | 'ambassadors' {
  if (record.tierSlug === 'members' || record.tierSlug === 'partners' || record.tierSlug === 'ambassadors') return record.tierSlug;
  return record.rank >= 3 ? 'ambassadors' : record.rank === 2 ? 'partners' : 'members';
}
