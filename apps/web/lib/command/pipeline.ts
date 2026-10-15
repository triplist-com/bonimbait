/**
 * Pipeline value ("צבר פוטנציאלי"): every open lead x the expected value of
 * its lead type or plan. Pure and client-safe.
 *
 *   expected value = deal value x close rate
 *
 * Defaults are business assumptions, written down so the owner can correct
 * them in /admin/insights/pipeline/ (rows in public.pipeline_expected_values
 * replace them one key at a time). Plan deal values come from the live price
 * of each plan in service_plan_prices (ex-VAT), so a price change flows
 * through without touching this file.
 */
import type { LeadType } from '@/lib/db/types';
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { isCountableLead, isOpenLead, WON_LEAD_STATUSES } from './leads';
import { inRange, periodDelta } from './period';
import type { CommandCenterData, ExpectedValue, LeadFact, PlanFact } from './types';

type TypeDefault = { dealNis: number; closeRate: number; note: string };

/** Per lead type. Partner and listing deals use the owner's public tier prices. */
export const DEFAULT_TYPE_VALUES: Record<LeadType, TypeDefault> = {
  consultation: {
    dealNis: 6_900,
    closeRate: 0.35,
    note: 'פגישת הייעוץ החינמית מובילה בעיקר למסלול בונים תקציב.',
  },
  budget_report: {
    dealNis: 6_900,
    closeRate: 0.25,
    note: 'בונה שביקש את דוח התקציב הראשוני: מועמד חם למסלול בונים תקציב.',
  },
  service_plan: {
    dealNis: 29_000,
    closeRate: 0.2,
    note: 'התעניינות במסלול ליווי בלי מסלול מסוים.',
  },
  partner: {
    dealNis: 8_940,
    closeRate: 0.3,
    note: 'חצי שנה במסלול שותפים (₪1,490 לחודש).',
  },
  advertise: {
    dealNis: 5_880,
    closeRate: 0.2,
    note: 'שנה במסלול חברים (₪490 לחודש).',
  },
  join_pro: {
    dealNis: 5_880,
    closeRate: 0.15,
    note: 'בעל מקצוע שמצטרף לנבחרת: שנה במסלול חברים.',
  },
  claim_business: {
    dealNis: 5_880,
    closeRate: 0.1,
    note: 'בעל עסק שמבקש לנהל את הכרטיס: שנה במסלול חברים.',
  },
  business_contact: {
    dealNis: 150,
    closeRate: 0.5,
    note: 'פנייה שמנותבת לבעל מקצוע: הערך שלה לשותף ולמסלול שלו.',
  },
  benefit: {
    dealNis: 300,
    closeRate: 0.2,
    note: 'פנייה על הטבה או מוצר של שותף.',
  },
  whatsapp_join: { dealNis: 0, closeRate: 0, note: 'הצטרפות לקהילה: ערך עתידי, לא עסקה.' },
  contact: { dealNis: 0, closeRate: 0, note: 'פנייה כללית.' },
};

/** Close rate per plan slug; other plans use DEFAULT_PLAN_CLOSE_RATE. */
export const DEFAULT_PLAN_CLOSE_RATES: Readonly<Record<string, number>> = {
  'bonim-budget': 0.4,
  'bonim-bait-plus': 0.25,
  'bonim-bait-turnkey': 0.15,
};
export const DEFAULT_PLAN_CLOSE_RATE = 0.25;

export const typeKey = (type: LeadType) => `type:${type}`;
export const planKey = (slug: string) => `plan:${slug}`;

/** The default table: plans first (by sort order), then lead types. */
export function defaultExpectedValues(plans: readonly PlanFact[]): ExpectedValue[] {
  const planRows: ExpectedValue[] = [...plans]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({
      key: planKey(p.slug),
      group: 'plan',
      label: p.name,
      dealValueAgorot: p.priceAgorot ?? 0,
      closeRate: DEFAULT_PLAN_CLOSE_RATES[p.slug] ?? DEFAULT_PLAN_CLOSE_RATE,
      note: 'מחיר המסלול באתר, לפני מע״מ.',
      isDefault: true,
    }));
  const typeRows: ExpectedValue[] = LEAD_TYPES.map((t) => ({
    key: typeKey(t),
    group: 'type',
    label: LEAD_TYPE_LABELS[t],
    dealValueAgorot: DEFAULT_TYPE_VALUES[t].dealNis * 100,
    closeRate: DEFAULT_TYPE_VALUES[t].closeRate,
    note: DEFAULT_TYPE_VALUES[t].note,
    isDefault: true,
  }));
  return [...planRows, ...typeRows];
}

export type ExpectedValueOverride = { key: string; deal_value_agorot: number; close_rate: number; note?: string | null };

/** Admin overrides replace defaults key by key; unknown keys are ignored. */
export function mergeExpectedValues(defaults: readonly ExpectedValue[], overrides: readonly ExpectedValueOverride[]): ExpectedValue[] {
  const byKey = new Map(overrides.map((o) => [o.key, o]));
  return defaults.map((d) => {
    const o = byKey.get(d.key);
    if (!o) return d;
    return {
      ...d,
      dealValueAgorot: clampAgorot(Number(o.deal_value_agorot)),
      closeRate: clampRate(Number(o.close_rate)),
      note: o.note ?? d.note,
      isDefault: false,
    };
  });
}

function clampAgorot(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

function clampRate(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

/** Expected value of one row, in agorot. */
export function expectedValueAgorot(ev: Pick<ExpectedValue, 'dealValueAgorot' | 'closeRate'>): number {
  return Math.round(clampAgorot(ev.dealValueAgorot) * clampRate(ev.closeRate));
}

export type ExpectedValueTable = ReadonlyMap<string, ExpectedValue>;

export function expectedValueTable(rows: readonly ExpectedValue[]): ExpectedValueTable {
  return new Map(rows.map((r) => [r.key, r]));
}

/** The row that prices a lead: its plan when it names one, else its type. */
export function expectedValueRow(lead: Pick<LeadFact, 'type' | 'planSlug'>, table: ExpectedValueTable): ExpectedValue | null {
  if (lead.planSlug) {
    const plan = table.get(planKey(lead.planSlug));
    if (plan) return plan;
  }
  return table.get(typeKey(lead.type)) ?? null;
}

export function leadExpectedValue(lead: Pick<LeadFact, 'type' | 'planSlug'>, table: ExpectedValueTable): number {
  const row = expectedValueRow(lead, table);
  return row ? expectedValueAgorot(row) : 0;
}

/**
 * The pipeline tile. Open = new or contacted; created = every non-spam lead
 * of the period (the fair period-over-period comparison: older leads have
 * had more time to close, so their open value isn't comparable).
 */
export function pipelineSummary(
  leads: readonly LeadFact[],
  table: ExpectedValueTable,
  window: { from: string; to: string; prevFrom: string; prevTo: string },
): CommandCenterData['pipeline'] {
  let openAgorot = 0;
  let openCount = 0;
  let createdAgorot = 0;
  let prevCreatedAgorot = 0;
  let wonAgorot = 0;
  const groups = new Map<string, { key: string; label: string; count: number; openAgorot: number }>();
  for (const lead of leads) {
    if (!isCountableLead(lead)) continue;
    const row = expectedValueRow(lead, table);
    const value = row ? expectedValueAgorot(row) : 0;
    if (inRange(lead.createdAt, window.prevFrom, window.prevTo)) prevCreatedAgorot += value;
    if (!inRange(lead.createdAt, window.from, window.to)) continue;
    createdAgorot += value;
    if (WON_LEAD_STATUSES.has(lead.status) && row) wonAgorot += row.dealValueAgorot;
    if (!isOpenLead(lead)) continue;
    openAgorot += value;
    openCount += 1;
    const key = row?.key ?? `type:${lead.type}`;
    const g = groups.get(key) ?? { key, label: row?.label ?? lead.type, count: 0, openAgorot: 0 };
    g.count += 1;
    g.openAgorot += value;
    groups.set(key, g);
  }
  return {
    openAgorot,
    openCount,
    createdAgorot,
    createdDelta: periodDelta(createdAgorot, prevCreatedAgorot),
    wonAgorot,
    byGroup: Array.from(groups.values()).sort((a, b) => b.openAgorot - a.openAgorot || b.count - a.count),
  };
}

/** Upper bound for a deal value typed in the editor (₪). */
export const MAX_DEAL_NIS = 10_000_000;

/**
 * The editor's two fields for one row: deal value in shekels ("6,900",
 * "₪29000") and close rate in percent ("35", "35%"). Returns agorot and a
 * 0..1 rate, or a Hebrew error.
 */
export function parseExpectedValueInput(raw: { deal: string; rate: string }):
  | { ok: true; dealValueAgorot: number; closeRate: number }
  | { ok: false; error: string } {
  const deal = Number(raw.deal.replace(/[₪,\s]/g, ''));
  const rate = Number(raw.rate.replace(/[%\s]/g, ''));
  if (!raw.deal.trim() || !Number.isFinite(deal) || deal < 0 || deal > MAX_DEAL_NIS) {
    return { ok: false, error: `שווי עסקה צריך להיות מספר בין 0 ל-${MAX_DEAL_NIS.toLocaleString('en-US')} ₪` };
  }
  if (!raw.rate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { ok: false, error: 'סיכוי סגירה צריך להיות אחוז בין 0 ל-100' };
  }
  return { ok: true, dealValueAgorot: Math.round(deal * 100), closeRate: Math.round(rate * 100) / 10_000 };
}

/** Same value as the default (so the override can be dropped)? */
export function sameAsDefault(def: Pick<ExpectedValue, 'dealValueAgorot' | 'closeRate'>, v: { dealValueAgorot: number; closeRate: number }): boolean {
  return def.dealValueAgorot === v.dealValueAgorot && Math.abs(def.closeRate - v.closeRate) < 1e-6;
}

/**
 * A plan's typical price ex-VAT from its price tiers: the middle of the tiers
 * (turnkey ₪133K-149K -> ₪141K). Prices marked VAT-included are divided by
 * 1 + VAT.
 */
export const VAT_RATE = 0.18;

export function typicalPlanPrice(prices: ReadonlyArray<{ price_agorot: number; vat_included: boolean }>): number | null {
  const values = prices
    .map((p) => (p.vat_included ? Math.round(p.price_agorot / (1 + VAT_RATE)) : p.price_agorot))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  return Math.round((values[0] + values[values.length - 1]) / 2);
}
