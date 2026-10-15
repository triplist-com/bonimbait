/**
 * Links for a result: the shareable planner URL, the printable report and the
 * WhatsApp share. Client-safe.
 */
import { absoluteUrl } from '@/lib/site';
import { FLOOR_LABELS, regionName } from './content';
import { asOfBadge, rangeText } from './format';
import { plannerQuery } from './prefill';
import type { PlannerEstimate, PlannerInput } from './types';

export const PLANNER_PATH = '/calculator/';
export const REPORT_PATH = '/calculator/report/';
/** The בונים תקציב plan ("סטייה ממחירי השוק 3%–5% בלבד") on the plans page. */
export const BUDGET_PLAN_HREF = '/membership-tiers/#plans';
/** The hub (P2). */
export const MY_HOME_HREF = '/my-home/';
/**
 * "שמרו בבית שלי" on a result: the hub's budget, told the builder chose to
 * save this estimate (a member's project gets a new budget version from it;
 * components/hub/BudgetControls.tsx PlannerRebasePrompt).
 */
export const SAVE_TO_HOME_HREF = `${MY_HOME_HREF}?saved=planner#budget`;

export function plannerHref(input: PlannerInput): string {
  return `${PLANNER_PATH}?${plannerQuery(input)}`;
}

export function reportHref(input: PlannerInput): string {
  return `${REPORT_PATH}?${plannerQuery(input)}`;
}

/** Absolute planner URL with share UTMs, so shares show up as their own source. */
export function shareUrl(input: PlannerInput, source = 'whatsapp'): string {
  const utm = new URLSearchParams({ utm_source: source, utm_medium: 'share', utm_campaign: 'planner' });
  return absoluteUrl(`${PLANNER_PATH}?${plannerQuery(input)}&${utm.toString()}`);
}

export function whatsappShareText(estimate: PlannerEstimate, url = shareUrl(estimate.input)): string {
  const { input } = estimate;
  const details = [`${input.sizeM2} מ״ר`, FLOOR_LABELS[input.floors].label, regionName(input.regionSlug)].join(', ');
  return [
    `בדקנו כמה יעלה לבנות את הבית: ${rangeText(estimate.total)} לתכנון ובנייה, לפני מע״מ (${details}).`,
    `${asOfBadge(estimate.validAsOf)}, לפי הנתונים של בונים בית. בדקו גם אתם:`,
    url,
  ].join('\n');
}

/** wa.me without a number: the visitor picks the chat. */
export function whatsappShareHref(estimate: PlannerEstimate): string {
  return `https://wa.me/?text=${encodeURIComponent(whatsappShareText(estimate))}`;
}
