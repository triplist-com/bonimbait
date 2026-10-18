/**
 * Lead routing rules (pure). Rules come from lead_routing_rules (admin:
 * /admin/leads/routing/); the first active rule, by priority, whose
 * conditions all match decides where a lead goes. An empty condition matches
 * anything. No match = the built-in default, which reproduces today's
 * behaviour exactly (lib/leads/notify.ts resolveRecipient): info@ for
 * businesses with lead_routing='site', direct for the rest.
 *
 * Client-safe and unit-tested; lib/revenue/routing-server.ts loads the rules
 * and turns a decision into a recipient.
 */
import type { LeadType } from '@/lib/db/types';
import type { LeadRoutingRuleRow, RoutingTarget } from './types';

export type RoutingRule = Pick<
  LeadRoutingRuleRow,
  | 'id'
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
>;

/** What a rule can look at. */
export type RoutingFacts = {
  type: LeadType;
  /** The lead's trade: its business's specialties, a quote's specialty, the file's question topics. */
  specialtySlugs: readonly string[];
  regionSlug: string | null;
  /** lib/stages.ts id. */
  stage: string | null;
  score: number | null;
  /** The business the lead was addressed to (business pages). */
  businessId: string | null;
};

export type RoutingDecision = {
  ruleId: string | null;
  ruleName: string;
  target: RoutingTarget;
  /** The business that receives the lead (business / partner_campaign targets). */
  businessId: string | null;
  campaignId: string | null;
};

export const DEFAULT_RULE_NAME = 'ברירת מחדל: לפי הגדרת הניתוב של העסק';

export const ROUTING_TARGET_LABELS: Record<RoutingTarget, string> = {
  owner_inbox: 'תיבת הלידים של בונים בית',
  business: 'העברה לבעל מקצוע',
  partner_campaign: 'קמפיין שותף',
  business_default: 'לפי הגדרת העסק (ברירת מחדל)',
};

export function defaultDecision(): RoutingDecision {
  return { ruleId: null, ruleName: DEFAULT_RULE_NAME, target: 'business_default', businessId: null, campaignId: null };
}

export function ruleMatches(rule: RoutingRule, facts: RoutingFacts): boolean {
  if (!rule.is_active) return false;
  if (rule.lead_types.length > 0 && !rule.lead_types.includes(facts.type)) return false;
  if (rule.specialty_slugs.length > 0 && !facts.specialtySlugs.some((s) => rule.specialty_slugs.includes(s))) return false;
  if (rule.region_slugs.length > 0 && (!facts.regionSlug || !rule.region_slugs.includes(facts.regionSlug))) return false;
  if (rule.stages.length > 0 && (!facts.stage || !rule.stages.includes(facts.stage))) return false;
  if (rule.min_score !== null && (facts.score === null || facts.score < rule.min_score)) return false;
  if (rule.max_score !== null && (facts.score === null || facts.score > rule.max_score)) return false;
  return true;
}

/** Rules in evaluation order: priority ascending, then name (stable for equal priorities). */
export function orderRules<R extends Pick<RoutingRule, 'priority' | 'name' | 'id'>>(rules: readonly R[]): R[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'he') || a.id.localeCompare(b.id));
}

/**
 * The routing decision for a lead. `campaignBusiness` maps a campaign id to
 * its partner business, or null when the campaign is missing or not live: a
 * rule pointing at such a campaign is skipped, so leads never vanish.
 */
export function evaluateRouting(
  facts: RoutingFacts,
  rules: readonly RoutingRule[],
  campaignBusiness: (campaignId: string) => string | null = () => null,
): RoutingDecision {
  for (const rule of orderRules(rules)) {
    if (!ruleMatches(rule, facts)) continue;
    const base = { ruleId: rule.id, ruleName: rule.name, target: rule.target };
    switch (rule.target) {
      case 'owner_inbox':
      case 'business_default':
        return { ...base, businessId: null, campaignId: null };
      case 'business':
        if (!rule.target_business_id) continue;
        return { ...base, businessId: rule.target_business_id, campaignId: null };
      case 'partner_campaign': {
        const partner = rule.target_campaign_id ? campaignBusiness(rule.target_campaign_id) : null;
        if (!partner) continue;
        return { ...base, businessId: partner, campaignId: rule.target_campaign_id };
      }
    }
  }
  return defaultDecision();
}

/** The routing record stored on the lead (payload.routing). */
export function routingRecord(decision: RoutingDecision): {
  rule_id: string | null;
  rule_name: string;
  target: RoutingTarget;
  business_id: string | null;
  campaign_id: string | null;
} {
  return {
    rule_id: decision.ruleId,
    rule_name: decision.ruleName,
    target: decision.target,
    business_id: decision.businessId,
    campaign_id: decision.campaignId,
  };
}
