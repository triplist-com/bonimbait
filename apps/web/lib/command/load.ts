import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isEnabled } from '@/lib/flags';
import { dailyBudgetUsd } from '@/lib/guard/aiBudget';
import { commandTierId, loadPartnerTiers, type PartnerTierRecord } from '@/lib/revenue/partner-tiers';
import { commandUserDb, selectAll } from './db';
import type { QuestionStatRow } from './db-types';
import { loadInsights } from './insights/store';
import { LEAD_FACT_COLUMNS, toLeadFact, type RawLeadRow } from './leads';
import { isPartnerTier } from './partners';
import { defaultExpectedValues, mergeExpectedValues, typicalPlanPrice, type ExpectedValueOverride } from './pipeline';
import { inRange, periodWindow, utcDayOf } from './period';
import type {
  AiUsageDay,
  CommandInputs,
  DailyEventCount,
  ExpectedValue,
  LeadFact,
  OrderFact,
  PartnerFact,
  PartnerTierId,
  PartnerTierInfo,
  PendingCounts,
  PeriodDays,
  PlanFact,
  QuestionFact,
} from './types';

/**
 * Loads the Command Center's raw inputs as the signed-in staff member (RLS).
 * Every section degrades on its own: a missing table or RPC (a migration not
 * applied yet), or a failing query, logs and yields empty data, so the page
 * always renders.
 */

/** Events the dashboard counts per day. */
export const DASHBOARD_EVENTS = ['consult_booked', 'answer_requested', 'answer_completed', 'search_submitted', 'lead_submitted'] as const;

/** AI routes that answer a builder's question (for the cost-per-question fallback). */
const ANSWER_ROUTES = new Set(['answer_stream', 'advisor_chat', 'advisor_answer']);

async function safe<T>(label: string, run: () => PromiseLike<T> | T, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[command] ${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PartnerDirectoryEntry = { name: string; tier: PartnerTierId | null; tierInfo: PartnerTierInfo | null };

/**
 * Partner names and tiers. The partner key is the partner's businesses.id
 * (what <PartnerOfferSlot> sends as partner_id and attribution stores as the
 * source), so the name comes from businesses and the tier from its live
 * subscription (partner_subscriptions -> partner_tiers, lib/revenue/partner-tiers.ts),
 * mapped to 'members' | 'partners' | 'ambassadors' (חברים / שותפים / שגרירים)
 * with its own price and impression target.
 */
async function partnerDirectory(
  ids: readonly string[],
  tiers: ReadonlyMap<string, PartnerTierRecord>,
): Promise<Map<string, PartnerDirectoryEntry>> {
  const out = new Map<string, PartnerDirectoryEntry>();
  const businessIds = ids.filter((id) => UUID_RE.test(id)).slice(0, 200);
  if (businessIds.length > 0) {
    const rows = await safe(
      'partner names',
      async () => unwrap(await createClient().from('businesses').select('id, name').in('id', businessIds)),
      [] as { id: string; name: string }[],
    );
    for (const b of rows) {
      const t = tiers.get(b.id);
      out.set(b.id, {
        name: b.name,
        tier: t ? commandTierId(t) : null,
        tierInfo: t ? { label: t.tierName, monthlyPriceNis: Math.round(t.priceAgorot / 100), monthlyImpressionTarget: t.monthlyImpressionTarget } : null,
      });
    }
  }
  for (const id of ids) if (!out.has(id)) out.set(id, { name: id, tier: isPartnerTier(id) ? id : null, tierInfo: null });
  return out;
}

export async function loadCommandInputs(opts: { periodDays: PeriodDays; now?: number }): Promise<CommandInputs> {
  const nowMs = opts.now ?? Date.now();
  const window = periodWindow(nowMs, opts.periodDays);
  const db = createClient();
  const cdb = commandUserDb();
  const nowIso = new Date(nowMs).toISOString();

  const [regions, plansRaw, leadRows, firstChanges, orderRows, events, aiRows, overrides, insights, pending] = await Promise.all([
    safe('regions', async () => unwrap(await db.from('regions').select('id, slug, name')), [] as { id: string; slug: string; name: string }[]),
    safe(
      'plans',
      async () =>
        unwrap(
          await db
            .from('service_plans')
            .select('id, slug, name, sort_order, is_active, service_plan_prices(id, price_agorot, vat_included)')
            .eq('is_active', true),
        ),
      [] as Array<{ id: string; slug: string; name: string; sort_order: number; service_plan_prices: { id: string; price_agorot: number; vat_included: boolean }[] }>,
    ),
    safe(
      'leads',
      () =>
        selectAll<RawLeadRow>((from, to) =>
          db
            .from('leads')
            .select(LEAD_FACT_COLUMNS)
            .gte('created_at', window.prevFrom)
            .lt('created_at', nowIso)
            .order('created_at', { ascending: false })
            .range(from, to) as unknown as PromiseLike<{ data: RawLeadRow[] | null; error: { message: string } | null }>,
        ),
      [] as RawLeadRow[],
    ),
    safe(
      'lead first changes',
      async () => unwrap(await cdb.rpc('command_lead_first_changes', { p_from: window.prevFrom, p_to: nowIso })),
      [] as { lead_id: string; first_changed_at: string; first_status: string }[],
    ),
    safe(
      'orders',
      async () =>
        unwrap(
          await db
            .from('orders')
            .select('id, created_at, status, total_agorot, order_items(service_plan_price_id, total_agorot)')
            .gte('created_at', window.prevFrom)
            .limit(5000),
        ),
      [] as Array<{ id: string; created_at: string; status: OrderFact['status']; total_agorot: number; order_items: { service_plan_price_id: string | null; total_agorot: number }[] }>,
    ),
    safe(
      'daily events',
      async () => unwrap(await cdb.rpc('platform_daily_counts', { p_from: window.prevFrom, p_to: nowIso, p_names: [...DASHBOARD_EVENTS] })),
      [] as DailyEventCount[],
    ),
    safe(
      'ai usage',
      async () => unwrap(await cdb.from('ai_usage').select('day, route, calls, cost_usd').gte('day', utcDayOf(window.prevFrom))),
      [] as { day: string; route: string; calls: number; cost_usd: number }[],
    ),
    safe(
      'expected values',
      async () => unwrap(await cdb.from('pipeline_expected_values').select('key, deal_value_agorot, close_rate, note')),
      [] as ExpectedValueOverride[],
    ),
    safe('insights', async () => (await loadInsights(cdb)).shown, null),
    safe('pending counts', () => pendingCounts(), null),
  ]);

  const regionSlugById = new Map(regions.map((r) => [r.id, r.slug]));
  const regionNames = Object.fromEntries(regions.map((r) => [r.slug, r.name]));
  const planSlugById = new Map(plansRaw.map((p) => [p.id, p.slug]));
  const planSlugByPriceId = new Map(plansRaw.flatMap((p) => (p.service_plan_prices ?? []).map((pr) => [pr.id, p.slug] as const)));
  const plans: PlanFact[] = plansRaw.map((p) => ({
    slug: p.slug,
    name: p.name,
    priceAgorot: typicalPlanPrice(p.service_plan_prices ?? []),
    sortOrder: p.sort_order,
  }));

  const firstResponseAt = new Map(firstChanges.map((c) => [c.lead_id, c.first_changed_at]));
  const leads: LeadFact[] = leadRows.map((r) => toLeadFact(r, { regionSlugById, planSlugById, firstResponseAt }));

  const orders: OrderFact[] = orderRows.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    status: o.status,
    totalAgorot: o.total_agorot,
    planItems: (o.order_items ?? []).flatMap((i) => {
      const slug = i.service_plan_price_id ? planSlugByPriceId.get(i.service_plan_price_id) : undefined;
      return slug ? [{ planSlug: slug, totalAgorot: i.total_agorot }] : [];
    }),
  }));

  const aiByDay = new Map<string, AiUsageDay>();
  for (const row of aiRows) {
    const d = aiByDay.get(row.day) ?? { day: row.day, costUsd: 0, calls: 0, answerCalls: 0 };
    d.costUsd += Number(row.cost_usd) || 0;
    d.calls += Number(row.calls) || 0;
    if (ANSWER_ROUTES.has(row.route)) d.answerCalls += Number(row.calls) || 0;
    aiByDay.set(row.day, d);
  }
  const today = utcDayOf(nowMs);

  const partners = await loadPartners(cdb, window, nowIso, leads);
  const expectedValues: ExpectedValue[] = mergeExpectedValues(defaultExpectedValues(plans), overrides);
  const topQuestions = insights ? [] : await loadTopQuestions(cdb, window.from, nowIso);

  return {
    now: nowIso,
    periodDays: opts.periodDays,
    leads,
    plans,
    orders,
    events,
    aiUsage: Array.from(aiByDay.values()),
    aiBudgetUsd: isEnabled('aiAnswers') ? dailyBudgetUsd() : 0,
    aiSpentTodayUsd: aiByDay.get(today)?.costUsd ?? 0,
    partners,
    expectedValues,
    insights,
    topQuestions,
    regionNames,
    pending,
  };
}

/** Just the expected-value table (defaults from live plan prices, plus admin overrides). */
export async function loadExpectedValueTable(): Promise<ExpectedValue[]> {
  const db = createClient();
  const [plansRaw, overrides] = await Promise.all([
    safe(
      'plans',
      async () =>
        unwrap(await db.from('service_plans').select('slug, name, sort_order, service_plan_prices(price_agorot, vat_included)').eq('is_active', true)),
      [] as Array<{ slug: string; name: string; sort_order: number; service_plan_prices: { price_agorot: number; vat_included: boolean }[] }>,
    ),
    safe(
      'expected values',
      async () => unwrap(await commandUserDb().from('pipeline_expected_values').select('key, deal_value_agorot, close_rate, note')),
      [] as ExpectedValueOverride[],
    ),
  ]);
  const plans: PlanFact[] = plansRaw.map((p) => ({ slug: p.slug, name: p.name, sortOrder: p.sort_order, priceAgorot: typicalPlanPrice(p.service_plan_prices ?? []) }));
  return mergeExpectedValues(defaultExpectedValues(plans), overrides);
}

async function loadPartners(
  cdb: ReturnType<typeof commandUserDb>,
  window: ReturnType<typeof periodWindow>,
  nowIso: string,
  leads: readonly LeadFact[],
): Promise<PartnerFact[]> {
  type Stat = { partner_id: string; impressions: number; clicks: number };
  const [cur, prev, tiers] = await Promise.all([
    safe('partner stats', async () => unwrap(await cdb.rpc('command_partner_stats', { p_from: window.from, p_to: nowIso })) as Stat[], [] as Stat[]),
    safe('partner stats (previous)', async () => unwrap(await cdb.rpc('command_partner_stats', { p_from: window.prevFrom, p_to: window.prevTo })) as Stat[], [] as Stat[]),
    // Every live subscription, so a partner that got nothing this period still shows (at risk).
    safe('partner tiers', () => loadPartnerTiers(createClient()), new Map<string, PartnerTierRecord>()),
  ]);
  const leadsBy = (from: string, to: string) => {
    const m = new Map<string, number>();
    for (const l of leads) {
      if (l.source.medium !== 'partner' || !l.source.source || l.status === 'spam' || !inRange(l.createdAt, from, to)) continue;
      m.set(l.source.source, (m.get(l.source.source) ?? 0) + 1);
    }
    return m;
  };
  const curLeads = leadsBy(window.from, nowIso);
  const prevLeads = leadsBy(window.prevFrom, window.prevTo);
  const ids = Array.from(
    new Set([
      ...cur.map((s) => s.partner_id),
      ...prev.map((s) => s.partner_id),
      ...Array.from(curLeads.keys()),
      ...Array.from(prevLeads.keys()),
      ...Array.from(tiers.keys()),
    ]),
  );
  if (ids.length === 0) return [];
  const directory = await partnerDirectory(ids, tiers);
  const curBy = new Map(cur.map((s) => [s.partner_id, s]));
  const prevBy = new Map(prev.map((s) => [s.partner_id, s]));
  return ids.map((id) => ({
    id,
    name: directory.get(id)?.name ?? id,
    tier: directory.get(id)?.tier ?? null,
    tierInfo: directory.get(id)?.tierInfo ?? null,
    impressions: Number(curBy.get(id)?.impressions ?? 0),
    clicks: Number(curBy.get(id)?.clicks ?? 0),
    leads: curLeads.get(id) ?? 0,
    prevImpressions: Number(prevBy.get(id)?.impressions ?? 0),
    prevClicks: Number(prevBy.get(id)?.clicks ?? 0),
    prevLeads: prevLeads.get(id) ?? 0,
  }));
}

async function loadTopQuestions(cdb: ReturnType<typeof commandUserDb>, from: string, to: string): Promise<QuestionFact[]> {
  const weekStart = new Date(Date.parse(to) - 7 * 86_400_000).toISOString();
  const rows = await safe(
    'top questions',
    async () => unwrap(await cdb.rpc('command_question_stats', { p_from: from, p_to: to, p_week_start: weekStart, p_limit: 6 })) as QuestionStatRow[],
    [] as QuestionStatRow[],
  );
  return rows.map((r) => ({
    question: r.question,
    asks: Number(r.asks) || 0,
    asksThisWeek: Number(r.asks_this_week) || 0,
    avgConfidence: r.avg_confidence == null ? null : Number(r.avg_confidence),
    zeroSourceAnswers: Number(r.zero_source_answers) || 0,
    lastSeen: r.last_seen,
  }));
}

/** What the old dashboard showed: things waiting for someone. */
async function pendingCounts(): Promise<PendingCounts> {
  const db = createClient();
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  };
  const [newLeads, pendingReviews, pendingBusinesses, openRequests] = await Promise.all([
    count(db.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new')),
    count(db.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    count(db.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    count(
      db
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .in('type', ['claim_business', 'join_pro'])
        .in('status', ['new', 'contacted', 'in_progress']),
    ),
  ]);
  return { newLeads, pendingReviews, pendingBusinesses, openRequests };
}
