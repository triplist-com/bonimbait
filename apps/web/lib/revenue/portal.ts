/**
 * The pro and partner portal (/partner-portal/), as pure functions and plain
 * view models, so the same components render a real business and the demo
 * (/platform/demo/pro/). Unit-tested.
 */
import type { BusinessMetrics, PeerRank } from './types';

// ---------------------------------------------------------------------------
// Profile completeness
// ---------------------------------------------------------------------------

export type CompletenessInput = {
  logoUrl: string | null;
  tagline: string | null;
  /** Plain-text "about" (HTML stripped). */
  about: string;
  galleryCount: number;
  specialtyCount: number;
  hasPrimarySpecialty: boolean;
  regionCount: number;
  phone: string | null;
  whatsapp: string | null;
  leadEmail: string | null;
  website: string | null;
  reviewCount: number;
};

export type CompletenessItem = {
  key: string;
  label: string;
  /** Why it matters, one short line. */
  why: string;
  weight: number;
  done: boolean;
  /** Where to fix it ('#details', '#media', ... or a page). */
  href: string;
};

export type Completeness = { score: number; items: CompletenessItem[]; next: CompletenessItem | null };

export const ABOUT_MIN_CHARS = 300;
export const GALLERY_MIN = 6;
export const REVIEWS_MIN = 3;

export function profileCompleteness(p: CompletenessInput, reviewHref = '#reviews'): Completeness {
  const items: CompletenessItem[] = [
    { key: 'logo', label: 'לוגו', why: 'כרטיס עם לוגו נראה אמין יותר ברשימה', weight: 10, done: Boolean(p.logoUrl), href: '#media' },
    { key: 'tagline', label: 'שורת תיאור קצרה', why: 'מופיעה מתחת לשם בכרטיס העסק', weight: 10, done: Boolean(p.tagline?.trim()), href: '#details' },
    {
      key: 'about',
      label: `אודות העסק (לפחות ${ABOUT_MIN_CHARS} תווים)`,
      why: 'בונים קוראים לפני שהם מתקשרים',
      weight: 15,
      done: p.about.trim().length >= ABOUT_MIN_CHARS,
      href: '#details',
    },
    {
      key: 'gallery',
      label: `לפחות ${GALLERY_MIN} תמונות עבודה`,
      why: 'תמונות מעבודות אמיתיות הן הסיבה הראשונה ללחוץ',
      weight: 15,
      done: p.galleryCount >= GALLERY_MIN,
      href: '#media',
    },
    {
      key: 'specialties',
      label: 'תחום עיקרי ותחומים נוספים',
      why: 'כך מוצאים אתכם בחיפוש ובתשובות באתר',
      weight: 10,
      done: p.specialtyCount > 0 && p.hasPrimarySpecialty,
      href: '#taxonomy',
    },
    { key: 'regions', label: 'אזורי שירות', why: 'בונים מסננים לפי אזור', weight: 10, done: p.regionCount > 0, href: '#taxonomy' },
    { key: 'phone', label: 'טלפון לפניות', why: 'בלי טלפון אין מה לחשוף', weight: 10, done: Boolean(p.phone), href: '#contacts' },
    {
      key: 'reach',
      label: 'וואטסאפ או מייל לפניות',
      why: 'פנייה בכתב מגיעה גם כשאתם בשטח',
      weight: 5,
      done: Boolean(p.whatsapp || p.leadEmail),
      href: '#contacts',
    },
    { key: 'website', label: 'אתר אינטרנט', why: 'עוד מקום לראות עבודות', weight: 5, done: Boolean(p.website), href: '#details' },
    {
      key: 'reviews',
      label: `לפחות ${REVIEWS_MIN} חוות דעת`,
      why: 'שלחו ללקוחות מרוצים את הקישור לחוות דעת',
      weight: 10,
      done: p.reviewCount >= REVIEWS_MIN,
      href: reviewHref,
    },
  ];
  const score = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0);
  const next = [...items].filter((i) => !i.done).sort((a, b) => b.weight - a.weight)[0] ?? null;
  return { score, items, next };
}

// ---------------------------------------------------------------------------
// Metrics: this period vs the previous one
// ---------------------------------------------------------------------------

export type Trend = { value: number; previous: number; pct: number | null };

export function trend(value: number, previous: number): Trend {
  return { value, previous, pct: previous > 0 ? Math.round(((value - previous) / previous) * 100) : value > 0 ? null : 0 };
}

export const EMPTY_METRICS: BusinessMetrics = {
  profile_views: 0,
  unique_viewers: 0,
  phone_reveals: 0,
  contact_clicks: 0,
  shortlist_adds: 0,
  quote_events: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  category_questions: 0,
  category_askers: 0,
  regional_questions: 0,
  regional_askers: 0,
  leads: 0,
  leads_new: 0,
  leads_contacted: 0,
  leads_won: 0,
  quote_requests: 0,
  routed_leads: 0,
  assisted_leads: 0,
  regional_builders: 0,
  deals: 0,
  deal_value_agorot: 0,
  daily: [],
};

/** Coerce the RPC's JSON into BusinessMetrics (missing numbers are 0). */
export function parseMetrics(value: unknown): BusinessMetrics {
  const o = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out: BusinessMetrics = { ...EMPTY_METRICS, daily: [] };
  for (const key of Object.keys(EMPTY_METRICS) as Array<keyof BusinessMetrics>) {
    if (key === 'daily') continue;
    const n = Number(o[key]);
    (out[key] as number) = Number.isFinite(n) ? n : 0;
  }
  if (Array.isArray(o.daily)) {
    out.daily = o.daily
      .map((d) => (d && typeof d === 'object' ? (d as Record<string, unknown>) : {}))
      .filter((d) => typeof d.day === 'string')
      .map((d) => ({ day: String(d.day), views: Number(d.views) || 0, impressions: Number(d.impressions) || 0 }));
  }
  return out;
}

export function parsePeerRank(value: unknown): PeerRank {
  const o = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  return {
    peers: num(o.peers) ?? 0,
    specialty: typeof o.specialty === 'string' ? o.specialty : null,
    views: num(o.views),
    leads: num(o.leads),
    view_rank: num(o.view_rank),
    lead_rank: num(o.lead_rank),
    median_views: num(o.median_views),
    median_leads: num(o.median_leads),
  };
}

export type PortalKpis = {
  views: Trend;
  reveals: Trend;
  leads: Trend;
  /** Builders who asked about this business's trade (site-wide answers). */
  askers: Trend;
};

export function portalKpis(cur: BusinessMetrics, prev: BusinessMetrics): PortalKpis {
  return {
    views: trend(cur.profile_views, prev.profile_views),
    reveals: trend(cur.phone_reveals, prev.phone_reveals),
    leads: trend(cur.leads, prev.leads),
    askers: trend(cur.category_askers, prev.category_askers),
  };
}
