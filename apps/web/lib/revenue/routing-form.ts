/**
 * Routing rules in the admin (/admin/lead-routing/): parse the editor's form
 * into a lead_routing_rules row, and describe a rule in one Hebrew line.
 * Pure and client-safe (unit-tested).
 */
import type { LeadType } from '@/lib/db/types';
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { REGIONS } from '@/lib/constants/community';
import { BUILD_STAGES } from '@/lib/stages';
import { ROUTING_TARGET_LABELS } from './routing';
import type { LeadRoutingRuleRow, RoutingTarget } from './types';

export const ROUTING_TARGETS: readonly RoutingTarget[] = ['owner_inbox', 'business', 'partner_campaign', 'business_default'];

export type RuleInput = Pick<
  LeadRoutingRuleRow,
  | 'name'
  | 'is_active'
  | 'priority'
  | 'lead_types'
  | 'specialty_slugs'
  | 'region_slugs'
  | 'stages'
  | 'min_score'
  | 'max_score'
  | 'target'
  | 'target_business_id'
  | 'target_campaign_id'
  | 'note'
>;

/** What a form submission looks like (FormData read into strings / string lists). */
export type RuleFormValues = {
  name?: string;
  is_active?: string;
  priority?: string;
  lead_types?: string[];
  specialty_slugs?: string[];
  region_slugs?: string[];
  stages?: string[];
  min_score?: string;
  max_score?: string;
  target?: string;
  target_business_id?: string;
  target_campaign_id?: string;
  note?: string;
};

export type RuleParse = { ok: true; rule: RuleInput } | { ok: false; fieldErrors: Record<string, string> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGION_SLUGS = new Set(REGIONS.map((r) => r.slug));
const STAGE_IDS = new Set<string>(BUILD_STAGES.map((s) => s.id));

function intOrNull(raw: string | undefined): number | null | 'bad' {
  const v = (raw ?? '').trim();
  if (!v) return null;
  return /^\d{1,5}$/.test(v) ? Number(v) : 'bad';
}

function uniq(list: string[] | undefined, allowed?: (v: string) => boolean, max = 60): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const v = raw.trim().normalize('NFC');
    if (v && !out.includes(v) && (!allowed || allowed(v))) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export function parseRuleForm(values: RuleFormValues): RuleParse {
  const errors: Record<string, string> = {};
  const name = (values.name ?? '').trim();
  if (name.length < 2 || name.length > 120) errors.name = 'שם הכלל: 2 עד 120 תווים';

  const priority = intOrNull(values.priority);
  if (priority === 'bad' || (priority !== null && priority > 10_000)) errors.priority = 'עדיפות: מספר שלם בין 0 ל-10,000';

  const leadTypes = uniq(values.lead_types, (v) => (LEAD_TYPES as readonly string[]).includes(v));
  const regions = uniq(values.region_slugs, (v) => REGION_SLUGS.has(v));
  const stages = uniq(values.stages, (v) => STAGE_IDS.has(v));
  const specialties = uniq(values.specialty_slugs, (v) => v.length <= 100);

  const min = intOrNull(values.min_score);
  const max = intOrNull(values.max_score);
  if (min === 'bad' || (typeof min === 'number' && min > 100)) errors.min_score = 'ציון מינימלי: 0 עד 100';
  if (max === 'bad' || (typeof max === 'number' && max > 100)) errors.max_score = 'ציון מקסימלי: 0 עד 100';
  if (typeof min === 'number' && typeof max === 'number' && min > max) errors.max_score = 'הציון המקסימלי קטן מהמינימלי';

  const target = values.target as RoutingTarget;
  if (!ROUTING_TARGETS.includes(target)) errors.target = 'יש לבחור יעד';
  const businessId = (values.target_business_id ?? '').trim();
  const campaignId = (values.target_campaign_id ?? '').trim();
  if (target === 'business' && !UUID_RE.test(businessId)) errors.target_business_id = 'יש לבחור בעל מקצוע';
  if (target === 'partner_campaign' && !UUID_RE.test(campaignId)) errors.target_campaign_id = 'יש לבחור קמפיין';

  const note = (values.note ?? '').trim();
  if (note.length > 500) errors.note = 'עד 500 תווים';

  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    rule: {
      name,
      is_active: values.is_active === 'on' || values.is_active === 'true' || values.is_active === '1',
      priority: typeof priority === 'number' ? priority : 100,
      lead_types: leadTypes,
      specialty_slugs: specialties,
      region_slugs: regions,
      stages,
      min_score: typeof min === 'number' ? min : null,
      max_score: typeof max === 'number' ? max : null,
      target,
      target_business_id: target === 'business' ? businessId : null,
      target_campaign_id: target === 'partner_campaign' ? campaignId : null,
      note: note || null,
    },
  };
}

export type RuleNames = {
  specialties?: ReadonlyMap<string, string>;
  businesses?: ReadonlyMap<string, string>;
  campaigns?: ReadonlyMap<string, string>;
};

function names(list: readonly string[], label: (v: string) => string, max = 3): string {
  const shown = list.slice(0, max).map(label);
  return list.length > max ? `${shown.join(', ')} ועוד ${list.length - max}` : shown.join(', ');
}

/** "ייעוץ תקציב בניה · אזור השרון · היתר/מכרז · ציון 70 ומעלה" (or "כל ליד"). */
export function describeConditions(rule: Pick<RuleInput, 'lead_types' | 'specialty_slugs' | 'region_slugs' | 'stages' | 'min_score' | 'max_score'>, n: RuleNames = {}): string {
  const parts: string[] = [];
  if (rule.lead_types.length) parts.push(names(rule.lead_types, (t) => LEAD_TYPE_LABELS[t as LeadType] ?? t));
  if (rule.specialty_slugs.length) parts.push(names(rule.specialty_slugs, (s) => n.specialties?.get(s) ?? s.replace(/-/g, ' ')));
  if (rule.region_slugs.length) parts.push(names(rule.region_slugs, (r) => REGIONS.find((x) => x.slug === r)?.name ?? r));
  if (rule.stages.length) parts.push(names(rule.stages, (s) => BUILD_STAGES.find((x) => x.id === s)?.label ?? s));
  if (rule.min_score != null && rule.max_score != null) parts.push(`ציון ${rule.min_score} עד ${rule.max_score}`);
  else if (rule.min_score != null) parts.push(`ציון ${rule.min_score} ומעלה`);
  else if (rule.max_score != null) parts.push(`ציון עד ${rule.max_score}`);
  return parts.length ? parts.join(' · ') : 'כל ליד';
}

/** "העברה לבעל מקצוע: חלונות לדוגמה" / "תיבת הלידים של בונים בית". */
export function describeTarget(rule: Pick<RuleInput, 'target' | 'target_business_id' | 'target_campaign_id'>, n: RuleNames = {}): string {
  const label = ROUTING_TARGET_LABELS[rule.target];
  if (rule.target === 'business' && rule.target_business_id) return `${label}: ${n.businesses?.get(rule.target_business_id) ?? 'עסק'}`;
  if (rule.target === 'partner_campaign' && rule.target_campaign_id) return `${label}: ${n.campaigns?.get(rule.target_campaign_id) ?? 'קמפיין'}`;
  return label;
}
