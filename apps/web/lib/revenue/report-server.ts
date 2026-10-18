import 'server-only';

/**
 * Loads a partner's monthly report, for the business's owner or staff
 * (canReadBusinessMetrics(), then the service-role metrics RPC), so the same
 * loader serves the partner's own /partner-portal/report/ and the admin's
 * /admin/partners/<id>/report/.
 */
import { israelDay, israelMidnight } from '@/lib/command/period';
import { LEAD_STATUS } from '@/lib/admin/labels';
import type { LeadStatus } from '@/lib/db/types';
import type { RevenueDb } from './db';
import { businessMetrics, canReadBusinessMetrics } from './metrics';
import { LIVE_SUBSCRIPTION_STATUSES } from './partner-tiers';
import { EMPTY_METRICS, parseMetrics } from './portal';
import { buildPartnerReport, nextMonth, previousMonth, type PartnerReportData } from './report';
import { getTopic, topicPatterns, topicsForSpecialty } from './topics';

export type ReportLead = {
  id: string;
  ref: string;
  createdAt: string;
  name: string;
  kindLabel: string;
  statusLabel: string;
  deal: { valueAgorot: number | null } | null;
};

export type PartnerReportPage = { report: PartnerReportData; leads: ReportLead[]; businessSlug: string };

const KIND_LABELS: Record<string, string> = { phone_reveal: 'צפייה בטלפון', contact_form: 'טופס יצירת קשר', quote_request: 'בקשת הצעת מחיר' };

export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

/** The current Israel month ('YYYY-MM'). */
export function currentMonth(now: Date = new Date()): string {
  return israelDay(now).slice(0, 7);
}

/** The last `n` months, newest first, ending with the current one. */
export function recentMonths(n = 6, now: Date = new Date()): string[] {
  const out = [currentMonth(now)];
  while (out.length < n) out.push(previousMonth(out[out.length - 1]));
  return out;
}

function bounds(month: string): { from: string; to: string } {
  return { from: new Date(israelMidnight(`${month}-01`)).toISOString(), to: new Date(israelMidnight(`${nextMonth(month)}-01`)).toISOString() };
}

export async function loadPartnerReport(db: RevenueDb, businessId: string, month: string): Promise<PartnerReportPage | null> {
  // The metrics RPC is service-role only: the caller's session must own the
  // business or be staff (any published business is readable under RLS).
  if (!(await canReadBusinessMetrics(db, businessId))) return null;
  const { data: business } = await db.from('businesses').select('id, name, slug').eq('id', businessId).maybeSingle();
  if (!business) return null;
  const { data: links } = await db.from('business_specialties').select('specialties(slug)').eq('business_id', businessId);
  const slugs = ((links ?? []) as Array<{ specialties: { slug: string } | null }>).map((l) => l.specialties?.slug).filter((s): s is string => Boolean(s));
  const topics = Array.from(new Set(slugs.flatMap((s) => topicsForSpecialty(s))));
  const patterns = topicPatterns(topics).slice(0, 12);

  const cur = bounds(month);
  const prev = bounds(previousMonth(month));
  const id = businessId;
  const [m, pm, sub, deals, leads] = await Promise.all([
    businessMetrics(db, id, cur, patterns, { authorized: true }),
    businessMetrics(db, id, prev, patterns, { authorized: true }),
    db
      .from('partner_subscriptions')
      .select('price_agorot, tier_id, partner_tiers:tier_id(name)')
      .eq('business_id', id)
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES])
      .maybeSingle(),
    db.from('partner_deals').select('lead_id, value_agorot').eq('business_id', id).gte('closed_on', `${month}-01`).lt('closed_on', `${nextMonth(month)}-01`),
    db
      .from('leads')
      .select('id, ref, created_at, full_name, status, business_id, payload')
      .or(`business_id.eq.${id},payload->routing->>business_id.eq.${id}`)
      .neq('status', 'spam')
      .gte('created_at', cur.from)
      .lt('created_at', cur.to)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (m.error) throw new Error(m.error.message);

  const tierName = ((sub.data as { partner_tiers?: { name: string } | null } | null)?.partner_tiers?.name ?? null) as string | null;
  const dealRows = deals.data ?? [];
  const dealByLead = new Map(dealRows.filter((d) => d.lead_id).map((d) => [d.lead_id as string, d.value_agorot]));
  const report = buildPartnerReport({
    month,
    partner: {
      id,
      name: business.name,
      topicTitle: topics.length ? getTopic(topics[0])?.title ?? null : null,
      tierName,
      monthlyCostAgorot: sub.data?.price_agorot ?? null,
    },
    metrics: parseMetrics(m.data),
    previous: pm.error ? EMPTY_METRICS : parseMetrics(pm.data),
    deals: dealRows.map((d) => ({ valueAgorot: d.value_agorot })),
  });
  return {
    report,
    businessSlug: business.slug,
    leads: (leads.data ?? []).map((l) => {
      const payload = l.payload && typeof l.payload === 'object' && !Array.isArray(l.payload) ? (l.payload as Record<string, unknown>) : {};
      const status = l.status as LeadStatus;
      return {
        id: l.id,
        ref: l.ref,
        createdAt: l.created_at,
        name: l.full_name?.trim() || 'ללא שם',
        kindLabel: l.business_id !== id ? 'הועבר אליכם' : KIND_LABELS[String(payload.kind)] ?? 'פנייה',
        statusLabel: LEAD_STATUS[status]?.label ?? status,
        deal: dealByLead.has(l.id) ? { valueAgorot: dealByLead.get(l.id) ?? null } : null,
      };
    }),
  };
}
