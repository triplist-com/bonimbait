import 'server-only';

/**
 * Routing rules on the server: load the active rules (cached per instance for
 * a minute), evaluate them for a lead (lib/revenue/routing.ts), and turn the
 * decision into the notifier's recipient override. Never throws: any failure
 * falls back to the default routing, so a broken rule can't lose a lead.
 */
import { getLeadRoutingTarget } from '@/lib/db/leads';
import type { RouteOverride } from '@/lib/leads/notify';
import { asRevenueDb, type RevenueDb } from './db';
import { defaultDecision, evaluateRouting, type RoutingDecision, type RoutingFacts, type RoutingRule } from './routing';
import type { DbClient } from '@/lib/db/client';

const RULES_TTL_MS = 60_000;
let cache: { at: number; rules: RoutingRule[]; campaigns: Map<string, string> } | null = null;

/** Forget cached rules (after an admin edit, and in tests). */
export function invalidateRoutingRules(): void {
  cache = null;
}

async function loadRules(db: RevenueDb): Promise<{ rules: RoutingRule[]; campaigns: Map<string, string> }> {
  if (cache && Date.now() - cache.at < RULES_TTL_MS) return cache;
  const { data, error } = await db
    .from('lead_routing_rules')
    .select('id, name, is_active, priority, lead_types, specialty_slugs, region_slugs, stages, min_score, max_score, target, target_business_id, target_campaign_id')
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  const rules = (data ?? []) as RoutingRule[];
  const campaignIds = rules.map((r) => r.target_campaign_id).filter((id): id is string => Boolean(id));
  const campaigns = new Map<string, string>();
  if (campaignIds.length) {
    const now = new Date().toISOString();
    const res = await db
      .from('partner_campaigns')
      .select('id, business_id, status, starts_at, ends_at')
      .in('id', campaignIds)
      .eq('status', 'active');
    if (res.error) throw new Error(res.error.message);
    for (const c of res.data ?? []) {
      if ((c.starts_at && c.starts_at > now) || (c.ends_at && c.ends_at <= now)) continue;
      campaigns.set(c.id, c.business_id);
    }
  }
  cache = { at: Date.now(), rules, campaigns };
  return cache;
}

export type ResolvedRouting = { decision: RoutingDecision; route: RouteOverride | null };

/** Evaluate the rules for a lead about to be stored (service-role client). */
export async function resolveLeadRouting(adminDb: DbClient | RevenueDb, facts: RoutingFacts): Promise<ResolvedRouting> {
  try {
    const db = asRevenueDb(adminDb);
    const { rules, campaigns } = await loadRules(db);
    const decision = evaluateRouting(facts, rules, (id) => campaigns.get(id) ?? null);
    if (decision.target === 'owner_inbox') return { decision, route: { kind: 'site' } };
    if ((decision.target === 'business' || decision.target === 'partner_campaign') && decision.businessId) {
      const target = await getLeadRoutingTarget(adminDb as DbClient, decision.businessId).catch(() => null);
      return { decision, route: { kind: 'business', business: target ? { leadEmail: target.leadEmail } : null } };
    }
    return { decision, route: null };
  } catch (err) {
    console.error(`[revenue] routing failed, using the default: ${err instanceof Error ? err.message : String(err)}`);
    return { decision: defaultDecision(), route: null };
  }
}
