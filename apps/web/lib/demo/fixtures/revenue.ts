/**
 * Revenue engine demo fixtures (/platform/demo/consult-queue/, /partner/, /pro/).
 * Fictional people and businesses only. Scores come from the real scorer
 * (lib/project-file/score.ts) and the report from the real report math
 * (lib/revenue/report.ts), so the demo shows exactly what the product computes:
 *
 *   consult queue  top lead: score 82, היתר/מכרז, אזור השרון, 220 מ״ר,
 *                  ~2.6 מיליון ₪, 4 questions about aluminium
 *   partner        "חלונות הגליל", last month: 3,940 viewable exposures ->
 *                  112 builders asked about windows -> 37 quote requests ->
 *                  9 deals -> ROI x6
 *   pro            a fictional shell contractor's portal
 */
import { sanitizeProjectFile } from '@/lib/project-file/sanitize';
import { scoreProjectFile } from '@/lib/project-file/score';
import type { ProjectFile } from '@/lib/project-file/types';
import { BUILD_STAGES, stageForProfile } from '@/lib/stages';
import type { ConsultLeadView } from '@/lib/revenue/consult-view';
import type { ConsultStage } from '@/lib/revenue/consult-workflow';
import { EMPTY_METRICS, portalKpis, profileCompleteness } from '@/lib/revenue/portal';
import type { PortalLeadView, PortalTier, PortalView } from '@/lib/revenue/portal-server';
import { buildPartnerReport, previousMonth } from '@/lib/revenue/report';
import type { ReportLead } from '@/lib/revenue/report-server';
import { BUDGET_BANDS } from '../data';
import type { DemoLead } from '../generator';
import { seriesTotal } from '../generator';
import { defineDemoFixture } from './define';

/** The seeded tiers (supabase/migrations/20261014122100_revenue_partners.sql). */
export const DEMO_TIERS: PortalTier[] = [
  {
    id: 'demo-tier-members',
    slug: 'members',
    name: 'חברים',
    rank: 1,
    priceAgorot: 49_000,
    benefits: ['פרופיל מורחב בנבחרת המומלצים', 'תג חבר בונים בית בכרטיס העסק', 'דוח חשיפות ופניות חודשי', 'הטבה ייעודית בעמוד ההטבות'],
  },
  {
    id: 'demo-tier-partners',
    slug: 'partners',
    name: 'שותפים',
    rank: 2,
    priceAgorot: 149_000,
    benefits: [
      'כל מה שבמסלול חברים',
      'קדימות בסדר ההופעה בנבחרת המומלצים',
      'קדימות בהמלצות על בעלי מקצוע בתשובות באתר',
      'באנרים בעמודי הבלוג והעמודים העסקיים',
      'מאמר תוכן מקצועי',
    ],
  },
  {
    id: 'demo-tier-ambassadors',
    slug: 'ambassadors',
    name: 'שגרירים',
    rank: 3,
    priceAgorot: 299_000,
    benefits: ['כל מה שבמסלול שותפים', 'קדימות עליונה בנבחרת ובתשובות באתר', 'פרק פודקאסט וסרטון ייעודי', 'באנר בעמוד הבית', 'הפניה פרונטלית בפגישות תקציב ובשטח'],
  },
];

const BAND_RANGES: Record<(typeof BUDGET_BANDS)[number], [number, number]> = {
  'עד 1.5 מיליון ₪': [1_100_000, 1_500_000],
  '1.5 עד 2 מיליון ₪': [1_500_000, 2_000_000],
  '2 עד 2.5 מיליון ₪': [2_000_000, 2_500_000],
  '2.5 עד 3.5 מיליון ₪': [2_500_000, 3_300_000],
  'מעל 3.5 מיליון ₪': [3_500_000, 4_200_000],
};

const CTA_SOURCES = ['site', 'post-footer', 'video-page', 'membership-tiers', 'home'] as const;
const DEFAULT_ROUTE = 'ברירת מחדל: לפי הגדרת הניתוב של העסק';

/** "YYYY-MM" a number of months after `today` (the move-in target). */
function monthsAhead(today: string, n: number): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
}

export const revenueDemo = defineDemoFixture('revenue', ({ gen, today }) => {
  // Everything is relative to "now" on the fixture's day (12:30 in Israel).
  const now = new Date(`${today}T09:30:00.000Z`);
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const daysAgo = (d: number, hour = 9) => ago(d * 24 * 60 + (12 - hour) * 60);

  // -------------------------------------------------------------------------
  // 1. The consult queue
  // -------------------------------------------------------------------------
  const topPerson = gen.fork('top-lead').person();
  const topFile = sanitizeProjectFile({
    stage: 'permit',
    regionSlug: 'sharon',
    sizeM2: 220,
    budgetRangeNis: [2_400_000, 2_800_000],
    targetMoveIn: monthsAhead(today, 20),
    questions: [
      { q: 'איזה פרופיל אלומיניום מתאים לבית ליד הים?', at: daysAgo(5, 21) },
      { q: 'חלונות עם תרמי-ברייק: באמת שווה את זה?', at: daysAgo(4, 22) },
      { q: 'כמה עולים חלונות אלומיניום לבית של 220 מ״ר?', at: daysAgo(2, 20) },
      { q: 'האם כדאי תריסים חשמליים בכל החלונות?', at: daysAgo(0, 11) },
    ],
    source: { landing: '/video/חלונות-אלומיניום-למה-לשים-לב/', lastTouch: 'ai_source:video:windows' },
  });
  const top: ConsultLeadView = {
    id: 'demo-lead-top',
    ref: `BB-${today.slice(2, 4)}-001874`,
    minutesAgo: 12,
    name: topPerson.fullName,
    phone: topPerson.phone,
    email: topPerson.email,
    stage: 'queue',
    status: 'new',
    bookedAt: null,
    bookingMethod: null,
    score: scoreProjectFile(topFile, { visits: 3 }),
    file: topFile,
    source: {
      cta: 'video-page',
      page: '/video/חלונות-אלומיניום-למה-לשים-לב/',
      attribution: 'שאלה ליועץ, ואז סרטון על חלונות אלומיניום · 12 דק׳ לפני הפנייה',
      routing: DEFAULT_ROUTE,
    },
    shortlist: [],
    notes: null,
  };

  function leadFile(lead: DemoLead): ProjectFile {
    const stage = stageForProfile(lead.stage.value)?.id ?? 'finishing';
    return sanitizeProjectFile({
      stage,
      regionSlug: lead.place.regionSlug,
      sizeM2: lead.sizeSqm,
      budgetRangeNis: BAND_RANGES[lead.budgetBand as keyof typeof BAND_RANGES],
      ...(lead.minutesAgo % 2 === 0 ? { targetMoveIn: monthsAhead(today, 12 + (lead.minutesAgo % 18)) } : {}),
      questions: lead.question ? [{ q: lead.question, at: ago(lead.minutesAgo + 240) }] : [],
    });
  }

  function view(lead: DemoLead, stage: ConsultStage, i: number): ConsultLeadView {
    const file = leadFile(lead);
    let score = scoreProjectFile(file, { visits: 1 + (i % 2) });
    // The demo's top lead stays on top: trim a fact if a generated file overtakes it.
    if (score.score >= (top.score?.score ?? 82)) {
      delete file.targetMoveIn;
      score = scoreProjectFile(file, { visits: 1 });
    }
    const booked = stage === 'booked';
    return {
      id: `demo-lead-${stage}-${i}`,
      ref: lead.ref,
      minutesAgo: lead.minutesAgo,
      name: lead.person.fullName,
      phone: lead.person.phone,
      email: lead.person.email,
      stage,
      status: stage === 'queue' ? 'new' : stage === 'won' ? 'won' : stage === 'lost' ? 'lost' : 'contacted',
      bookedAt: booked ? ago(Math.max(1, lead.minutesAgo - 30)) : null,
      bookingMethod: booked ? (i % 3 === 0 ? 'phone' : 'calendly') : null,
      score,
      file,
      source: { cta: CTA_SOURCES[i % CTA_SOURCES.length], page: null, attribution: lead.source.label, routing: DEFAULT_ROUTE },
      shortlist: [],
      notes: null,
    };
  }

  const stages: Array<[ConsultStage, number, number]> = [
    ['queue', 7, 2 * 24 * 60],
    ['booked', 4, 4 * 24 * 60],
    ['contacted', 5, 6 * 24 * 60],
    ['won', 3, 14 * 24 * 60],
    ['lost', 2, 14 * 24 * 60],
  ];
  const byStage = Object.fromEntries(
    stages.map(([stage, n, within]) => {
      const list = gen
        .fork(`queue-${stage}`)
        .leads(n, { withinMinutes: within })
        .map((l, i) => view(l, stage, i));
      if (stage === 'queue') list.unshift(top);
      list.sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1) || a.minutesAgo - b.minutesAgo);
      return [stage, list];
    }),
  ) as Record<Exclude<ConsultStage, 'spam'>, ConsultLeadView[]>;

  // -------------------------------------------------------------------------
  // 2. "חלונות הגליל": last month's partner report
  // -------------------------------------------------------------------------
  const month = previousMonth(today.slice(0, 7));
  const dealValues = [24_000, 18_500, 21_000, 16_000, 19_500, 22_000, 17_000, 20_500, 21_500].map((v) => v * 100); // 180,000 ₪
  const partnerReport = buildPartnerReport({
    month,
    partner: { id: 'demo-partner-galil-windows', name: 'חלונות הגליל', topicTitle: 'חלונות ואלומיניום', tierName: 'שגרירים', monthlyCostAgorot: 299_000 },
    metrics: {
      ...EMPTY_METRICS,
      daily: [],
      impressions: 3_940,
      reach: 2_611,
      clicks: 157,
      category_askers: 112,
      category_questions: 164,
      quote_requests: 37,
      leads: 44,
      assisted_leads: 7,
      deals: 9,
      deal_value_agorot: dealValues.reduce((a, b) => a + b, 0),
    },
    previous: { ...EMPTY_METRICS, daily: [], impressions: 3_405, leads: 36, deals: 6 },
    deals: dealValues.map((valueAgorot) => ({ valueAgorot })),
  });
  const partnerLeads: ReportLead[] = gen
    .fork('partner-leads')
    .leads(10, { withinMinutes: 28 * 24 * 60 })
    .map((l, i) => ({
      id: `demo-partner-lead-${i}`,
      ref: l.ref,
      createdAt: ago(l.minutesAgo),
      name: l.person.fullName,
      kindLabel: i % 4 === 3 ? 'הועבר אליכם' : i % 3 === 2 ? 'צפייה בטלפון' : 'בקשת הצעת מחיר',
      statusLabel: i < 5 ? 'נסגר בהצלחה' : i % 2 ? 'נוצר קשר' : 'חדש',
      deal: i < 5 ? { valueAgorot: dealValues[i] } : null,
    }));

  // -------------------------------------------------------------------------
  // 3. A shell contractor's portal
  // -------------------------------------------------------------------------
  const views = gen.fork('pro-views').timeSeries({ days: 30, base: 36, weeklyGrowth: 0.04, noise: 0.14 });
  const viewsTotal = seriesTotal(views);
  const proMetrics = {
    ...EMPTY_METRICS,
    daily: views.map((p) => ({ day: p.date, views: p.value, impressions: 0 })),
    profile_views: viewsTotal,
    unique_viewers: Math.round(viewsTotal * 0.72),
    phone_reveals: 94,
    shortlist_adds: 19,
    quote_requests: 9,
    category_askers: 341,
    category_questions: 498,
    regional_builders: 27,
    leads: 23,
    leads_new: 6,
    leads_contacted: 12,
    leads_won: 5,
  };
  const proPrev = { ...EMPTY_METRICS, daily: [], profile_views: Math.round(viewsTotal / 1.18), phone_reveals: 86, leads: 18, category_askers: 305 };
  const kinds: PortalLeadView['kind'][] = ['quote_request', 'phone_reveal', 'quote_request', 'contact_form', 'phone_reveal', 'routed', 'quote_request', 'phone_reveal'];
  const statuses: Array<[PortalLeadView['status'], string]> = [
    ['new', 'חדש'],
    ['new', 'חדש'],
    ['contacted', 'נוצר קשר'],
    ['contacted', 'נוצר קשר'],
    ['won', 'נסגר בהצלחה'],
    ['contacted', 'נוצר קשר'],
    ['lost', 'לא רלוונטי'],
    ['won', 'נסגר בהצלחה'],
  ];
  const proLeads: PortalLeadView[] = gen
    .fork('pro-leads')
    .leads(8, { withinMinutes: 25 * 24 * 60 })
    .map((l, i) => {
      const stageId = stageForProfile(l.stage.value)?.id ?? 'frame';
      const stage = BUILD_STAGES.find((s) => s.id === (i % 3 === 0 ? 'frame' : i % 3 === 1 ? 'permit' : stageId));
      return {
        id: `demo-pro-lead-${i}`,
        ref: l.ref,
        createdAt: ago(l.minutesAgo),
        name: l.person.fullName,
        phone: l.person.phone,
        email: l.person.email,
        kind: kinds[i],
        status: statuses[i][0],
        statusLabel: statuses[i][1],
        project: `${stage?.label ?? 'שלד'} · ${l.place.regionName} · ${l.sizeSqm} מ״ר`,
        message: kinds[i] === 'quote_request' ? `הצעת מחיר לשלד, ${l.sizeSqm} מ״ר, קומה וחצי. היתר צפוי בעוד חודשיים.` : null,
        deal: i === 4 ? { valueAgorot: 86_000_000 } : null,
      };
    });
  const proView: PortalView = {
    business: {
      id: 'demo-pro-shell',
      name: 'גבעון שלד ובנייה',
      slug: 'demo',
      status: 'published',
      specialty: 'קבלני שלד',
      badge: { tierSlug: 'members', tierName: 'חברים', badgeLabel: 'חבר בונים בית', rank: 1 },
    },
    days: 30,
    kpis: portalKpis(proMetrics, proPrev),
    metrics: proMetrics,
    views: views.map((p) => ({ date: p.date, value: p.value })),
    peer: { peers: 26, specialty: 'קבלני שלד', views: viewsTotal, leads: 23, view_rank: 3, lead_rank: 2, median_views: Math.round(viewsTotal * 0.48), median_leads: 9 },
    reviews: { count: 14, percent: 94 },
    completeness: profileCompleteness({
      logoUrl: 'demo',
      tagline: 'שלד בטון מזוין ובלוקים, מהיסודות ועד הגג',
      about: 'א'.repeat(420),
      galleryCount: 4,
      specialtyCount: 2,
      hasPrimarySpecialty: true,
      regionCount: 3,
      phone: '050-•••-0000',
      whatsapp: '050-•••-0000',
      leadEmail: null,
      website: null,
      reviewCount: 14,
    }),
    leads: proLeads,
    tiers: DEMO_TIERS,
    subscription: { tierSlug: 'members', tierName: 'חברים', status: 'active', priceAgorot: 49_000, periodEnd: ago(-18 * 24 * 60) },
    deals: { count: 1, valueAgorot: 86_000_000 },
  };

  return { now: now.toISOString(), queue: byStage, partner: { report: partnerReport, leads: partnerLeads }, pro: proView };
});

export type RevenueDemoData = ReturnType<typeof revenueDemo.build>;
