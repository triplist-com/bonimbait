import 'server-only';

/**
 * Public partner badges (the partner_badges view): which published business
 * is on which tier. Safe for anonymous, cookie-less pages (ISR). Never throws:
 * no badges is a fine fallback.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbClient } from '@/lib/db/client';
import { isEnabled } from '@/lib/flags';
import { asRevenueDb, revenuePublicDb } from './db';
import type { PartnerBadge } from './tiers';

export async function loadPartnerBadges(db?: DbClient | SupabaseClient | null): Promise<Map<string, PartnerBadge>> {
  const out = new Map<string, PartnerBadge>();
  if (!isEnabled('revenue')) return out;
  const client = db ? asRevenueDb(db) : revenuePublicDb();
  if (!client) return out;
  try {
    const { data, error } = await client.from('partner_badges').select('business_id, tier_slug, tier_name, badge_label, rank');
    if (error) throw new Error(error.message);
    for (const b of data ?? []) {
      const prev = out.get(b.business_id);
      if (prev && prev.rank >= b.rank) continue;
      out.set(b.business_id, { tierSlug: b.tier_slug, tierName: b.tier_name, badgeLabel: b.badge_label, rank: b.rank });
    }
  } catch (err) {
    console.error(`[revenue] partner badges unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}

/** Business id -> tier rank, for ordering and the answer pros boost. */
export function tierRanks(badges: ReadonlyMap<string, PartnerBadge>): Map<string, number> {
  return new Map(Array.from(badges, ([id, b]) => [id, b.rank]));
}
