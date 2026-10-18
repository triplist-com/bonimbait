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

/**
 * On production, a tier "paid" with the mock provider never shows: a mock
 * purchase on a preview deployment sharing the database must not feature a
 * business on the live site (QA; partner_badges.is_mock, migration 20261014131200).
 */
export function countsPublicly(badge: { is_mock?: boolean | null }, env: Record<string, string | undefined> = process.env): boolean {
  return !(badge.is_mock && env.VERCEL_ENV === 'production');
}

export async function loadPartnerBadges(db?: DbClient | SupabaseClient | null): Promise<Map<string, PartnerBadge>> {
  const out = new Map<string, PartnerBadge>();
  if (!isEnabled('revenue')) return out;
  const client = db ? asRevenueDb(db) : revenuePublicDb();
  if (!client) return out;
  try {
    const { data, error } = await client.from('partner_badges').select('business_id, tier_slug, tier_name, badge_label, rank, is_mock');
    if (error) throw new Error(error.message);
    for (const b of data ?? []) {
      if (!countsPublicly(b)) continue;
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
