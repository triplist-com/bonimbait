/**
 * "דוח שותף": the monthly partner report, as pure functions (unit-tested).
 *
 *   viewable exposures -> clicks -> builders who asked about the trade ->
 *   leads -> of them, quote requests -> deals reported  =>  ROI estimate
 *
 * Not every step is a subset of the one before it (builders ask about a trade
 * whether or not they clicked the offer), so a step shows a share only of the
 * step it is really part of: clicks of exposures, quote requests and deals of
 * the leads.
 *
 * ROI method (stated on the report): the gross margin of the deals the
 * partner reported this month (deal value x margin rate, 10% unless the
 * report is given another), divided by what the partner paid for the month.
 * Deals reported without a value are estimated at the month's average
 * reported value; with no values at all there is no ROI, only a prompt to
 * add them. The automated version of the owner's "200 לידים. 50 סגירות."
 */
import type { BusinessMetrics } from './types';

export const DEFAULT_MARGIN_RATE = 0.1;

export type FunnelStepKey = 'exposures' | 'clicks' | 'askers' | 'leads' | 'quotes' | 'deals';

export type FunnelStep = {
  key: FunnelStepKey;
  label: string;
  value: number;
  /** Share (0..1) of the step this one is part of; null when it isn't part of one, or the base is zero. */
  rate: number | null;
  /** What `rate` is a share of, in Hebrew ("מהחשיפות"); null without a rate. */
  rateOf: string | null;
  hint: string;
};

/** A funnel step's value by key (0 when absent). */
export function funnelValue(funnel: readonly FunnelStep[], key: FunnelStepKey): number {
  return funnel.find((s) => s.key === key)?.value ?? 0;
}

export type ReportPartner = {
  id: string;
  name: string;
  /** The trade the report measures intent for ("חלונות ואלומיניום"). */
  topicTitle: string | null;
  tierName: string | null;
  /** What the partner paid for the month (agorot); null = not on a paid tier. */
  monthlyCostAgorot: number | null;
};

export type ReportDeal = { valueAgorot: number | null };

export type PartnerReportData = {
  month: string;
  monthLabel: string;
  partner: ReportPartner;
  funnel: FunnelStep[];
  reach: number;
  assistedLeads: number;
  deals: { count: number; withValue: number; reportedAgorot: number; estimatedAgorot: number };
  roi: {
    /** Gross margin attributed this month (agorot). */
    marginAgorot: number;
    costAgorot: number | null;
    /** marginAgorot / costAgorot, one decimal; null when it can't be computed. */
    multiple: number | null;
    marginRate: number;
    /** Why there's no multiple, in Hebrew. */
    missing: string | null;
  };
  /** Month over month, for the headline numbers. */
  change: { exposures: number | null; leads: number | null; deals: number | null };
  highlights: string[];
};

const MONTH_FMT = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const NUM = new Intl.NumberFormat('he-IL');

export function monthLabel(month: string): string {
  return /^\d{4}-\d{2}$/.test(month) ? MONTH_FMT.format(new Date(`${month}-01T00:00:00Z`)) : month;
}

/** 'YYYY-MM' of the month before. */
export function previousMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function rate(value: number, base: number): number | null {
  return base > 0 ? value / base : null;
}

function change(cur: number, prev: number | undefined): number | null {
  if (prev === undefined) return null;
  return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
}

export function buildPartnerReport(input: {
  month: string;
  partner: ReportPartner;
  metrics: BusinessMetrics;
  previous?: BusinessMetrics | null;
  deals: readonly ReportDeal[];
  marginRate?: number;
}): PartnerReportData {
  const m = input.metrics;
  const topic = input.partner.topicTitle ?? 'התחום שלכם';
  const dealCount = Math.max(input.deals.length, m.deals);
  const withValue = input.deals.filter((d) => typeof d.valueAgorot === 'number' && d.valueAgorot > 0);
  const reported = withValue.reduce((s, d) => s + (d.valueAgorot ?? 0), 0);
  const avg = withValue.length ? reported / withValue.length : 0;
  const estimated = Math.round(reported + avg * (dealCount - withValue.length));
  const marginRate = input.marginRate ?? DEFAULT_MARGIN_RATE;
  const margin = Math.round(estimated * marginRate);
  const cost = input.partner.monthlyCostAgorot;

  let missing: string | null = null;
  if (!cost) missing = 'העסק לא במסלול שותפות בתשלום החודש.';
  else if (dealCount === 0) missing = 'עוד לא דווחו עסקאות החודש.';
  else if (withValue.length === 0) missing = 'סמנו סכום לעסקאות כדי לחשב את ההחזר.';
  const multiple = missing || !cost ? null : Math.round((margin / cost) * 10) / 10;

  // A share above 100% means the month's numbers aren't nested (deals this month
  // on last month's leads, say): no share then.
  const share = (value: number, base: number, of: string) => {
    const r = value <= base ? rate(value, base) : null;
    return { rate: r, rateOf: r === null ? null : of };
  };
  const none = { rate: null, rateOf: null };
  const funnel: FunnelStep[] = [
    { key: 'exposures', label: 'חשיפות נצפות', value: m.impressions, ...none, hint: 'ההצעה שלכם נראתה באמת: לפחות חצי ממנה על המסך, שנייה ומעלה' },
    { key: 'clicks', label: 'לחיצות על ההצעה', value: m.clicks, ...share(m.clicks, m.impressions, 'מהחשיפות'), hint: 'בונים שלחצו כדי לשמוע עוד' },
    { key: 'askers', label: `בונים ששאלו על ${topic}`, value: m.category_askers, ...none, hint: 'שאלות באתר על העבודה שאתם עושים' },
    { key: 'leads', label: 'פניות שהגיעו אליכם', value: m.leads, ...none, hint: 'כל הפניות: הצעות מחיר, טפסים ופניות שנותבו אליכם' },
    { key: 'quotes', label: 'בקשות הצעת מחיר', value: m.quote_requests, ...share(m.quote_requests, m.leads, 'מהפניות'), hint: 'פניות עם תיק פרויקט שביקשו הצעה' },
    { key: 'deals', label: 'עסקאות שדיווחתם', value: dealCount, ...share(dealCount, m.leads, 'מהפניות'), hint: 'מה שסגרתם מתוך הפניות' },
  ];

  const n = (v: number, one: string, many: string) => (v === 1 ? one : `${NUM.format(v)} ${many}`);
  const highlights: string[] = [];
  if (m.impressions > 0) {
    const where = m.reach > 0 ? `, אצל ${n(m.reach, 'בונה אחד', 'בונים שונים')}` : '';
    highlights.push(`ההצעה שלכם נראתה ${n(m.impressions, 'פעם אחת', 'פעמים')}${where}.`);
  }
  if (m.category_askers > 0) highlights.push(`${m.category_askers === 1 ? 'בונה אחד שאל' : `${NUM.format(m.category_askers)} בונים שאלו`} באתר על ${topic}.`);
  if (m.quote_requests > 0) {
    highlights.push(`${m.quote_requests === 1 ? 'בונה אחד ביקש' : `${NUM.format(m.quote_requests)} ביקשו`} מכם הצעת מחיר, עם פרטי הפרויקט.`);
  }
  if (dealCount > 0) highlights.push(`סגרתם ${n(dealCount, 'עסקה אחת', 'עסקאות')} מתוך הפניות.`);
  if (multiple !== null) highlights.push(`כל שקל ששילמתם החזיר בערך ${multiple} שקלים ברווח גולמי.`);

  return {
    month: input.month,
    monthLabel: monthLabel(input.month),
    partner: input.partner,
    funnel,
    reach: m.reach,
    assistedLeads: m.assisted_leads,
    deals: { count: dealCount, withValue: withValue.length, reportedAgorot: reported, estimatedAgorot: estimated },
    roi: { marginAgorot: margin, costAgorot: cost, multiple, marginRate, missing },
    change: {
      exposures: change(m.impressions, input.previous?.impressions),
      leads: change(m.leads, input.previous?.leads),
      deals: change(dealCount, input.previous?.deals),
    },
    highlights,
  };
}

// ---------------------------------------------------------------------------
// Partner health (admin): one line per partner for the month
// ---------------------------------------------------------------------------

export type HealthStatus = 'healthy' | 'watch' | 'at_risk' | 'no_tier';

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  healthy: 'בריא',
  watch: 'במעקב',
  at_risk: 'בסיכון',
  no_tier: 'בלי מסלול',
};

/**
 * Health from the month's delivery: on a paid tier, a partner with an ROI of
 * 3x or more (or, before deals are reported, on pace with its exposure
 * target and getting leads) is healthy; below 1x, or with no leads and under
 * 60% of its exposure target, it is at risk; anything else is watched.
 */
export function partnerHealthStatus(h: {
  onTier: boolean;
  roiMultiple: number | null;
  leads: number;
  /** Delivered exposures / target for the period; null without a target. */
  pace: number | null;
}): HealthStatus {
  if (!h.onTier) return 'no_tier';
  if (h.roiMultiple !== null) return h.roiMultiple >= 3 ? 'healthy' : h.roiMultiple < 1 ? 'at_risk' : 'watch';
  if (h.leads === 0 && (h.pace === null || h.pace < 0.6)) return 'at_risk';
  if (h.leads > 0 && (h.pace === null || h.pace >= 0.9)) return 'healthy';
  return 'watch';
}
