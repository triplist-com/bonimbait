import 'server-only';

/**
 * Loads the portal for one business, as its owner (RLS and the metric RPCs'
 * own ownership check: a pro only ever gets their own numbers and leads).
 */
import type { LeadStatus } from '@/lib/db/types';
import { LEAD_STATUS } from '@/lib/admin/labels';
import { REGIONS } from '@/lib/constants/community';
import { htmlToText } from '@/lib/directory/html';
import { projectHeadline } from '@/lib/project-file/format';
import { sanitizeProjectFile } from '@/lib/project-file/sanitize';
import { stageForProfile } from '@/lib/stages';
import type { ConstructionStage } from '@/lib/db/types';
import { loadPartnerBadges } from './badges';
import type { RevenueDb } from './db';
import { EMPTY_METRICS, parseMetrics, parsePeerRank, portalKpis, profileCompleteness, type Completeness, type PortalKpis } from './portal';
import { topicPatterns, topicsForSpecialty } from './topics';
import type { BusinessMetrics, PeerRank, PartnerSubscriptionStatus } from './types';
import type { PartnerBadge } from './tiers';

export const PORTAL_DAYS = 30;

export type PortalLeadKind = 'phone_reveal' | 'contact_form' | 'quote_request' | 'routed' | 'other';

export const LEAD_KIND_LABELS: Record<PortalLeadKind, string> = {
  phone_reveal: 'צפייה בטלפון',
  contact_form: 'טופס יצירת קשר',
  quote_request: 'בקשת הצעת מחיר',
  routed: 'הועבר אליכם',
  other: 'פנייה',
};

export type PortalLeadView = {
  id: string;
  ref: string;
  createdAt: string;
  name: string;
  phone: string | null;
  email: string | null;
  kind: PortalLeadKind;
  status: LeadStatus;
  statusLabel: string;
  /** "היתר/מכרז · אזור השרון · 220 מ״ר" from the project file (or the form). */
  project: string | null;
  message: string | null;
  deal: { valueAgorot: number | null } | null;
};

export type PortalTier = { id: string; slug: string; name: string; rank: number; priceAgorot: number; benefits: string[] };

export type PortalView = {
  business: { id: string; name: string; slug: string; status: string; specialty: string | null; badge: PartnerBadge | null };
  days: number;
  kpis: PortalKpis;
  metrics: BusinessMetrics;
  views: Array<{ date: string; value: number }>;
  peer: PeerRank;
  reviews: { count: number; percent: number | null };
  completeness: Completeness;
  leads: PortalLeadView[];
  tiers: PortalTier[];
  subscription: { tierSlug: string; tierName: string; status: PartnerSubscriptionStatus; priceAgorot: number; periodEnd: string | null } | null;
  /** Deals reported this period, and their total. */
  deals: { count: number; valueAgorot: number };
};

type BusinessInput = {
  id: string;
  name: string;
  slug: string;
  status: string;
  tagline: string | null;
  description_html: string | null;
  logo_url: string | null;
  website: string | null;
  gallery: unknown;
  primary_specialty_id: string | null;
  specialties: Array<{ id: string; slug: string; name: string }>;
  regions: Array<{ id: string }>;
};

function kindOf(payload: unknown, businessId: string, leadBusinessId: string | null): PortalLeadKind {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  if (leadBusinessId !== businessId) return 'routed';
  if (p.kind === 'phone_reveal' || p.kind === 'contact_form' || p.kind === 'quote_request') return p.kind;
  return 'other';
}

export async function loadPortalView(db: RevenueDb, business: BusinessInput, contacts: { phone: string | null; whatsapp: string | null; lead_email: string | null } | null): Promise<PortalView> {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now.getTime() - PORTAL_DAYS * 86_400_000).toISOString();
  const prevFrom = new Date(now.getTime() - 2 * PORTAL_DAYS * 86_400_000).toISOString();
  const topics = Array.from(new Set(business.specialties.flatMap((s) => topicsForSpecialty(s.slug))));
  const patterns = topicPatterns(topics).slice(0, 12);
  const id = business.id;

  const [cur, prev, peer, leadsRes, statsRes, tiersRes, subRes, dealsRes, badges] = await Promise.all([
    db.rpc('revenue_business_metrics', { p_business_id: id, p_from: from, p_to: to, p_patterns: patterns }),
    db.rpc('revenue_business_metrics', { p_business_id: id, p_from: prevFrom, p_to: from, p_patterns: patterns }),
    db.rpc('revenue_peer_rank', { p_business_id: id, p_from: from, p_to: to }),
    db
      .from('leads')
      .select('id, ref, created_at, full_name, phone, email, status, business_id, payload, construction_stage, region_id, message')
      .or(`business_id.eq.${id},payload->routing->>business_id.eq.${id}`)
      .neq('status', 'spam')
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('business_review_stats').select('review_count, rating_percent').eq('business_id', id).maybeSingle(),
    db.from('partner_tiers').select('id, slug, name, rank, price_agorot, benefits').eq('is_active', true).order('rank'),
    db.from('partner_subscriptions').select('tier_id, status, price_agorot, current_period_end').eq('business_id', id).in('status', ['active', 'past_due']).maybeSingle(),
    db.from('partner_deals').select('lead_id, value_agorot, closed_on').eq('business_id', id),
    loadPartnerBadges(db),
  ]);

  const metrics = cur.error ? EMPTY_METRICS : parseMetrics(cur.data);
  const previous = prev.error ? EMPTY_METRICS : parseMetrics(prev.data);
  if (cur.error) console.error(`[revenue] portal metrics failed: ${cur.error.message}`);

  const tiers: PortalTier[] = (tiersRes.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    rank: t.rank,
    priceAgorot: t.price_agorot,
    benefits: Array.isArray(t.benefits) ? t.benefits.filter((b): b is string => typeof b === 'string') : [],
  }));
  const subTier = subRes.data ? tiers.find((t) => t.id === subRes.data!.tier_id) : undefined;
  const deals = dealsRes.data ?? [];
  const dealByLead = new Map(deals.filter((d) => d.lead_id).map((d) => [d.lead_id as string, d.value_agorot]));
  const fromDay = from.slice(0, 10);
  const periodDeals = deals.filter((d) => d.closed_on >= fromDay);

  const leads: PortalLeadView[] = (leadsRes.data ?? []).map((l) => {
    const payload = l.payload && typeof l.payload === 'object' && !Array.isArray(l.payload) ? (l.payload as Record<string, unknown>) : {};
    const file = sanitizeProjectFile(payload.project_file);
    if (!file.stage && l.construction_stage) file.stage = stageForProfile(l.construction_stage as ConstructionStage)?.id;
    if (!file.regionSlug && typeof payload.region === 'string' && REGIONS.some((r) => r.slug === payload.region)) file.regionSlug = payload.region;
    const status = l.status as LeadStatus;
    return {
      id: l.id,
      ref: l.ref,
      createdAt: l.created_at,
      name: l.full_name?.trim() || 'ללא שם',
      phone: l.phone,
      email: l.email,
      kind: kindOf(l.payload, id, l.business_id),
      status,
      statusLabel: LEAD_STATUS[status]?.label ?? status,
      project: projectHeadline(file) || null,
      message: l.message,
      deal: dealByLead.has(l.id) ? { valueAgorot: dealByLead.get(l.id) ?? null } : null,
    };
  });

  const gallery = Array.isArray(business.gallery) ? business.gallery.length : 0;
  const reviewCount = statsRes.data?.review_count ?? 0;
  const completeness = profileCompleteness(
    {
      logoUrl: business.logo_url,
      tagline: business.tagline,
      about: htmlToText(business.description_html),
      galleryCount: gallery,
      specialtyCount: business.specialties.length,
      hasPrimarySpecialty: Boolean(business.primary_specialty_id),
      regionCount: business.regions.length,
      phone: contacts?.phone ?? null,
      whatsapp: contacts?.whatsapp ?? null,
      leadEmail: contacts?.lead_email ?? null,
      website: business.website,
      reviewCount,
    },
    `/business/${business.slug}/review/`,
  );

  return {
    business: {
      id,
      name: business.name,
      slug: business.slug,
      status: business.status,
      specialty: business.specialties.find((s) => s.id === business.primary_specialty_id)?.name ?? business.specialties[0]?.name ?? null,
      badge: badges.get(id) ?? null,
    },
    days: PORTAL_DAYS,
    kpis: portalKpis(metrics, previous),
    metrics,
    views: metrics.daily.map((d) => ({ date: d.day, value: d.views })),
    peer: peer.error ? { peers: 0 } : parsePeerRank(peer.data),
    reviews: { count: reviewCount, percent: statsRes.data?.rating_percent ?? null },
    completeness,
    leads,
    tiers,
    subscription:
      subRes.data && subTier
        ? {
            tierSlug: subTier.slug,
            tierName: subTier.name,
            status: subRes.data.status,
            priceAgorot: subRes.data.price_agorot,
            periodEnd: subRes.data.current_period_end,
          }
        : null,
    deals: { count: periodDeals.length, valueAgorot: periodDeals.reduce((s, d) => s + (d.value_agorot ?? 0), 0) },
  };
}
