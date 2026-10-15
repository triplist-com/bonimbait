/**
 * Partner health: what each strategic partner got this period (viewable
 * impressions, clicks, attributed leads) against what its tier is meant to
 * deliver. Pure and client-safe.
 *
 * Tier names and prices are the owner's public ones (חברים / שותפים /
 * שגרירים). Live data wins: lib/command/load.ts partnerDirectory() reads each
 * partner's subscription and tier (lib/revenue/partner-tiers.ts), so a fact
 * carries its own price (locked at purchase) and impression target
 * (partner_tiers.monthly_impression_target, admin-editable). PARTNER_TIERS
 * below are the seeded defaults, used by the demo and when a fact has no
 * live terms.
 */
import { periodDelta } from './period';
import type { CommandCenterData, PartnerFact, PartnerHealth, PartnerHealthStatus, PartnerTierId } from './types';

export type PartnerTier = {
  id: PartnerTierId;
  label: string;
  monthlyPriceNis: number;
  /** Viewable impressions a partner on this tier should get per 30 days. */
  monthlyImpressionTarget: number;
};

export const PARTNER_TIERS: Readonly<Record<PartnerTierId, PartnerTier>> = {
  members: { id: 'members', label: 'חברים', monthlyPriceNis: 490, monthlyImpressionTarget: 1_500 },
  partners: { id: 'partners', label: 'שותפים', monthlyPriceNis: 1_490, monthlyImpressionTarget: 5_000 },
  ambassadors: { id: 'ambassadors', label: 'שגרירים', monthlyPriceNis: 2_990, monthlyImpressionTarget: 12_000 },
};

export const PARTNER_STATUS_LABELS: Record<PartnerHealthStatus, string> = {
  on_track: 'בקצב',
  behind: 'מתחת לקצב',
  at_risk: 'בסיכון',
  no_tier: 'בלי מסלול',
};

/** Pace thresholds: delivered / pro-rated target. */
export const PACE_ON_TRACK = 0.9;
export const PACE_BEHIND = 0.6;

export function isPartnerTier(value: unknown): value is PartnerTierId {
  return value === 'members' || value === 'partners' || value === 'ambassadors';
}

export function partnerHealth(fact: PartnerFact, periodDays: number): PartnerHealth {
  const defaults = fact.tier ? PARTNER_TIERS[fact.tier] : null;
  const tier = fact.tierInfo
    ? {
        label: fact.tierInfo.label,
        monthlyPriceNis: fact.tierInfo.monthlyPriceNis,
        monthlyImpressionTarget: fact.tierInfo.monthlyImpressionTarget ?? defaults?.monthlyImpressionTarget ?? null,
      }
    : defaults;
  const target = tier?.monthlyImpressionTarget != null ? Math.round((tier.monthlyImpressionTarget * periodDays) / 30) : null;
  const pace = target && target > 0 ? fact.impressions / target : null;
  const status: PartnerHealthStatus =
    pace == null ? 'no_tier' : pace >= PACE_ON_TRACK ? 'on_track' : pace >= PACE_BEHIND ? 'behind' : 'at_risk';
  const periodPrice = tier ? (tier.monthlyPriceNis * periodDays) / 30 : null;
  return {
    id: fact.id,
    name: fact.name,
    tier: fact.tier,
    tierLabel: tier?.label ?? null,
    monthlyPriceNis: tier?.monthlyPriceNis ?? null,
    impressions: fact.impressions,
    impressionsTarget: target,
    clicks: fact.clicks,
    ctr: fact.impressions > 0 ? fact.clicks / fact.impressions : null,
    leads: fact.leads,
    leadsDelta: periodDelta(fact.leads, fact.prevLeads),
    pace,
    costPerLeadNis: periodPrice != null && fact.leads > 0 ? Math.round(periodPrice / fact.leads) : null,
    status,
  };
}

const STATUS_ORDER: Record<PartnerHealthStatus, number> = { at_risk: 0, behind: 1, on_track: 2, no_tier: 3 };

export function partnersSummary(facts: readonly PartnerFact[], periodDays: number): CommandCenterData['partners'] {
  const rows = facts
    .filter((f) => f.impressions + f.clicks + f.leads + f.prevImpressions + f.prevClicks + f.prevLeads > 0 || f.tier)
    .map((f) => partnerHealth(f, periodDays))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.impressions - a.impressions || a.name.localeCompare(b.name, 'he'));
  const sum = (pick: (f: PartnerFact) => number) => facts.reduce((a, f) => a + pick(f), 0);
  return {
    active: rows.filter((r) => r.impressions > 0 || r.clicks > 0 || r.leads > 0).length,
    onTrack: rows.filter((r) => r.status === 'on_track').length,
    behind: rows.filter((r) => r.status === 'behind').length,
    atRisk: rows.filter((r) => r.status === 'at_risk').length,
    impressions: periodDelta(sum((f) => f.impressions), sum((f) => f.prevImpressions)),
    clicks: periodDelta(sum((f) => f.clicks), sum((f) => f.prevClicks)),
    leads: periodDelta(sum((f) => f.leads), sum((f) => f.prevLeads)),
    rows,
  };
}
