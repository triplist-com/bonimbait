import { describe, expect, it } from 'vitest';
import { addDays, israelDay, israelMidnight, parsePeriod, periodDelta, periodWindow } from '@/lib/command/period';
import {
  defaultExpectedValues,
  expectedValueAgorot,
  expectedValueRow,
  expectedValueTable,
  mergeExpectedValues,
  pipelineSummary,
  typicalPlanPrice,
} from '@/lib/command/pipeline';
import { leadSource, readLeadScore, readProjectFile, toLeadFact, type RawLeadRow } from '@/lib/command/leads';
import { partnerHealth, partnersSummary } from '@/lib/command/partners';
import { buildCommandCenter, dailyTotals } from '@/lib/command/build';
import { buildLeadsAnalytics, percentile, speedToLead } from '@/lib/command/analytics';
import { formatBudgetRange, formatCount, formatDurationHe, formatNis, formatUsd } from '@/lib/command/format';
import { stageKey, stageLabel } from '@/lib/command/dimensions';
import type { CommandInputs, LeadFact, PartnerFact, PlanFact } from '@/lib/command/types';

const PLANS: PlanFact[] = [
  { slug: 'bonim-bait-plus', name: 'בונים בית פלוס', priceAgorot: 2_900_000, sortOrder: 2 },
  { slug: 'bonim-budget', name: 'בונים תקציב', priceAgorot: 690_000, sortOrder: 1 },
  { slug: 'bonim-bait-turnkey', name: 'בונים בית עד מפתח', priceAgorot: 14_100_000, sortOrder: 3 },
];

let seq = 0;
function lead(over: Partial<LeadFact> & Pick<LeadFact, 'createdAt'>): LeadFact {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    ref: `BB-26-${String(seq).padStart(6, '0')}`,
    type: 'consultation',
    status: 'new',
    firstResponseAt: null,
    stage: null,
    regionSlug: null,
    sizeM2: null,
    budgetLabel: null,
    score: null,
    scoreReasons: [],
    planSlug: null,
    source: { medium: 'direct', source: null, campaign: null, label: 'ישיר' },
    sourcePath: null,
    ...over,
  };
}

describe('periods', () => {
  it('parses the period selector, defaulting to 30 days', () => {
    expect(parsePeriod('7')).toBe(7);
    expect(parsePeriod(90)).toBe(90);
    expect(parsePeriod(['30'])).toBe(30);
    expect(parsePeriod('14')).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
  });

  it('buckets days in Israel time and finds Israel midnight across DST', () => {
    expect(israelDay('2026-10-14T22:30:00Z')).toBe('2026-10-15');
    expect(new Date(israelMidnight('2026-10-15')).toISOString()).toBe('2026-10-14T21:00:00.000Z');
    // DST ends at 02:00 on 2026-10-25: that midnight is still summer time.
    expect(new Date(israelMidnight('2026-10-25')).toISOString()).toBe('2026-10-24T21:00:00.000Z');
    expect(new Date(israelMidnight('2026-10-26')).toISOString()).toBe('2026-10-25T22:00:00.000Z');
    expect(new Date(israelMidnight('2026-03-27')).toISOString()).toBe('2026-03-26T22:00:00.000Z');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('covers N calendar days and compares the same elapsed time before', () => {
    const w = periodWindow('2026-10-14T07:00:00Z', 7); // 10:00 in Israel
    expect(w.dayList).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(w.prevDayList[0]).toBe('2026-10-01');
    expect(w.from).toBe('2026-10-07T21:00:00.000Z');
    expect(w.prevFrom).toBe('2026-09-30T21:00:00.000Z');
    // 6 days and 10 hours into both periods.
    expect(w.prevTo).toBe('2026-10-07T07:00:00.000Z');
    expect(Date.parse(w.to) - Date.parse(w.from)).toBe(Date.parse(w.prevTo) - Date.parse(w.prevFrom));
  });

  it('computes deltas, with no percentage when there is no baseline', () => {
    expect(periodDelta(120, 100)).toEqual({ current: 120, previous: 100, pct: 20, direction: 'up' });
    expect(periodDelta(80, 100)).toEqual({ current: 80, previous: 100, pct: -20, direction: 'down' });
    expect(periodDelta(5, 0)).toEqual({ current: 5, previous: 0, pct: null, direction: 'up' });
    expect(periodDelta(0, 0)).toEqual({ current: 0, previous: 0, pct: null, direction: 'flat' });
    expect(periodDelta(Number.NaN, 3).current).toBe(0);
  });

  it('prorates the previous period’s last day for daily data', () => {
    const w = { dayList: ['d3', 'd4'], prevDayList: ['d1', 'd2'] };
    const byDay = new Map([['d1', 10], ['d2', 10], ['d3', 4], ['d4', 2]]);
    expect(dailyTotals(w, byDay, 0.5)).toEqual({
      current: 6,
      previous: 15,
      series: [{ date: 'd3', value: 4 }, { date: 'd4', value: 2 }],
    });
  });
});

describe('pipeline value', () => {
  const defaults = defaultExpectedValues(PLANS);

  it('lists plans by their order, then every lead type', () => {
    expect(defaults.slice(0, 3).map((d) => d.key)).toEqual(['plan:bonim-budget', 'plan:bonim-bait-plus', 'plan:bonim-bait-turnkey']);
    expect(defaults.filter((d) => d.group === 'type')).toHaveLength(10);
    const budget = defaults.find((d) => d.key === 'plan:bonim-budget')!;
    expect(expectedValueAgorot(budget)).toBe(276_000); // ₪6,900 x 40%
    const consult = defaults.find((d) => d.key === 'type:consultation')!;
    expect(expectedValueAgorot(consult)).toBe(241_500); // ₪6,900 x 35%
  });

  it('applies admin overrides key by key and clamps bad values', () => {
    const merged = mergeExpectedValues(defaults, [
      { key: 'type:consultation', deal_value_agorot: 1_200_000, close_rate: 0.5 },
      { key: 'type:partner', deal_value_agorot: -5, close_rate: 3 },
      { key: 'plan:unknown', deal_value_agorot: 1, close_rate: 1 },
    ]);
    const consult = merged.find((d) => d.key === 'type:consultation')!;
    expect(consult.isDefault).toBe(false);
    expect(expectedValueAgorot(consult)).toBe(600_000);
    const partner = merged.find((d) => d.key === 'type:partner')!;
    expect([partner.dealValueAgorot, partner.closeRate]).toEqual([0, 1]);
    expect(merged).toHaveLength(defaults.length);
  });

  it('prices a lead by its plan, falling back to its type', () => {
    const table = expectedValueTable(defaults);
    expect(expectedValueRow({ type: 'service_plan', planSlug: 'bonim-bait-turnkey' }, table)?.key).toBe('plan:bonim-bait-turnkey');
    expect(expectedValueRow({ type: 'service_plan', planSlug: 'gone' }, table)?.key).toBe('type:service_plan');
    expect(expectedValueRow({ type: 'business_contact', planSlug: null }, table)?.key).toBe('type:business_contact');
  });

  it('sums open leads, and compares created value between periods', () => {
    const table = expectedValueTable(defaults);
    const window = periodWindow('2026-10-14T07:00:00Z', 7);
    const leads = [
      lead({ createdAt: '2026-10-13T08:00:00Z', type: 'consultation', status: 'new' }), // open 2,415
      lead({ createdAt: '2026-10-12T08:00:00Z', type: 'service_plan', planSlug: 'bonim-budget', status: 'contacted' }), // open 2,760
      lead({ createdAt: '2026-10-12T09:00:00Z', type: 'consultation', status: 'spam' }), // ignored
      lead({ createdAt: '2026-10-11T09:00:00Z', type: 'partner', status: 'won' }), // created 2,682; won deal 8,940
      lead({ createdAt: '2026-10-10T09:00:00Z', type: 'advertise', status: 'lost' }), // created 1,176
      lead({ createdAt: '2026-10-03T09:00:00Z', type: 'consultation', status: 'new' }), // previous period 2,415
      lead({ createdAt: '2026-10-07T12:00:00Z', type: 'consultation', status: 'new' }), // after prevTo: neither period
    ];
    const p = pipelineSummary(leads, table, window);
    expect(p.openCount).toBe(2);
    expect(p.openAgorot).toBe(241_500 + 276_000);
    expect(p.createdAgorot).toBe(241_500 + 276_000 + 268_200 + 117_600);
    expect(p.createdDelta.previous).toBe(241_500);
    expect(p.createdDelta.pct).toBe(Math.round(((903_300 - 241_500) / 241_500) * 100));
    expect(p.wonAgorot).toBe(894_000);
    expect(p.byGroup.map((g) => g.key)).toEqual(['plan:bonim-budget', 'type:consultation']);
  });

  it('takes the middle of a plan’s price tiers, ex-VAT', () => {
    expect(typicalPlanPrice([{ price_agorot: 13_300_000, vat_included: false }, { price_agorot: 14_900_000, vat_included: false }])).toBe(14_100_000);
    expect(typicalPlanPrice([{ price_agorot: 1_180_000, vat_included: true }])).toBe(1_000_000);
    expect(typicalPlanPrice([])).toBeNull();
  });
});

describe('lead readers (defensive against the revenue squad’s future fields)', () => {
  it('reads the score from the project file, or the payload, clamped to 0-100', () => {
    expect(readLeadScore({ project_file: { score: 82 } })).toEqual({ score: 82, reasons: [] });
    expect(readLeadScore({ project_file: { score: { value: 77.6, reasons: ['שלד', 3, 'אזור מרכז'] } } })).toEqual({
      score: 78,
      reasons: ['שלד', 'אזור מרכז'],
    });
    expect(readLeadScore({ project_file: { score: 55, score_reasons: ['תקציב ברור'] } }).reasons).toEqual(['תקציב ברור']);
    expect(readLeadScore({ score: '64' }).score).toBe(64);
    expect(readLeadScore({ project_file: { score: 140 } }).score).toBe(100);
    expect(readLeadScore({})).toEqual({ score: null, reasons: [] });
    expect(readLeadScore(null)).toEqual({ score: null, reasons: [] });
    expect(readLeadScore({ project_file: 'oops' }).score).toBeNull();
  });

  it('reads the project file fields it knows', () => {
    expect(readProjectFile({})).toBeNull();
    expect(readProjectFile({ project_file: { stage: 'frame', sizeM2: '180', budgetRangeNis: [1_500_000, 2_000_000], questions: [{}, {}] } })).toEqual({
      stage: 'frame',
      regionSlug: null,
      sizeM2: 180,
      budgetRangeNis: [1_500_000, 2_000_000],
      targetMoveIn: null,
      questionCount: 2,
    });
  });

  it('labels the source: stored attribution, else UTMs, else direct', () => {
    expect(leadSource({ attribution: { medium: 'partner', source: 'partner-42', campaign: 'spring' } })).toEqual({
      medium: 'partner',
      source: 'partner-42',
      campaign: 'spring',
      label: 'שותף: partner-42 (spring)',
    });
    expect(leadSource({ attribution: { medium: 'ai_source', source: 'video:abc' } }).label).toBe('סרטון בתשובה');
    expect(leadSource({ attribution: null, utm: { utm_source: 'facebook' } }).label).toBe('קמפיין: facebook');
    expect(leadSource({ attribution: { medium: 'weird' }, utm: {} }).medium).toBe('direct');
  });

  it('maps stages onto the owner’s 7 (lib/stages.ts)', () => {
    expect(stageKey('permit')).toBe('permit');
    expect(stageKey('tender')).toBe('permit'); // profile value -> its stage
    expect(stageKey('land')).toBe('purchase');
    expect(stageKey('moving_in')).toBe('moving-in');
    expect(stageKey('renovation')).toBe('other');
    expect(stageKey('design')).toBe('other');
    expect(stageKey('')).toBeNull();
    expect(stageKey('nonsense')).toBeNull();
    expect(stageLabel('permit')).toBe('היתר/מכרז');
  });

  it('builds a lead fact without contact details', () => {
    const row: RawLeadRow = {
      id: 'l1',
      ref: 'BB-26-000123',
      type: 'service_plan',
      status: 'new',
      created_at: '2026-10-14T06:00:00Z',
      construction_stage: 'planning',
      region_id: 'r-sharon',
      payload: { project_file: { stage: 'permit', budgetRangeNis: [2_000_000, 2_500_000], score: 71 }, region: 'center' },
      utm: {},
      attribution: null,
      source_url: 'https://bonimbait.com/%D7%9E%D7%A1%D7%9C%D7%95%D7%9C%D7%99%D7%9D/?x=1',
      service_plan_id: 'p-plus',
    };
    const fact = toLeadFact(row, {
      regionSlugById: new Map([['r-sharon', 'sharon']]),
      planSlugById: new Map([['p-plus', 'bonim-bait-plus']]),
      firstResponseAt: new Map([['l1', '2026-10-14T06:30:00Z']]),
    });
    expect(fact).toMatchObject({
      stage: 'permit', // the project file's stage wins over construction_stage
      regionSlug: 'sharon', // region_id wins over payload.region
      budgetLabel: '₪2M–2.5M',
      score: 71,
      planSlug: 'bonim-bait-plus',
      firstResponseAt: '2026-10-14T06:30:00Z',
      sourcePath: '/מסלולים/',
    });
    expect(JSON.stringify(fact)).not.toMatch(/full_name|email|phone/);
  });
});

describe('partner health', () => {
  const base: PartnerFact = { id: 'p1', name: 'חלונות הגליל', tier: 'partners', impressions: 0, clicks: 0, leads: 0, prevImpressions: 0, prevClicks: 0, prevLeads: 0 };

  it('paces impressions against the tier target for the period', () => {
    expect(partnerHealth({ ...base, impressions: 4_600, clicks: 92, leads: 10 }, 30)).toMatchObject({
      impressionsTarget: 5_000,
      status: 'on_track',
      ctr: 0.02,
      costPerLeadNis: 149,
      tierLabel: 'שותפים',
    });
    expect(partnerHealth({ ...base, impressions: 3_500 }, 30).status).toBe('behind');
    expect(partnerHealth({ ...base, impressions: 1_000 }, 30).status).toBe('at_risk');
    expect(partnerHealth({ ...base, impressions: 1_100 }, 7)).toMatchObject({ impressionsTarget: 1_167, status: 'on_track' });
    expect(partnerHealth({ ...base, tier: null, impressions: 50 }, 30)).toMatchObject({ status: 'no_tier', pace: null, costPerLeadNis: null });
  });

  it('puts partners at risk first and sums exposure', () => {
    const s = partnersSummary(
      [
        { ...base, id: 'a', name: 'א', impressions: 5_000, prevImpressions: 4_000, leads: 3, prevLeads: 1 },
        { ...base, id: 'b', name: 'ב', impressions: 500 },
        { ...base, id: 'c', name: 'ג', tier: null },
      ],
      30,
    );
    expect(s.rows.map((r) => r.id)).toEqual(['b', 'a']);
    expect([s.active, s.onTrack, s.atRisk]).toEqual([2, 1, 1]);
    expect(s.impressions).toMatchObject({ current: 5_500, previous: 4_000, pct: 38 });
    expect(s.leads.pct).toBe(200);
  });
});

describe('buildCommandCenter', () => {
  const now = '2026-10-14T09:00:00Z'; // 12:00 in Israel: half of today has passed
  const inputs = (over: Partial<CommandInputs> = {}): CommandInputs => ({
    now,
    periodDays: 7,
    leads: [],
    plans: PLANS,
    orders: [],
    events: [],
    aiUsage: [],
    aiBudgetUsd: 3,
    aiSpentTodayUsd: 0.6,
    partners: [],
    expectedValues: defaultExpectedValues(PLANS),
    insights: null,
    topQuestions: [],
    regionNames: {},
    pending: null,
    ...over,
  });

  it('counts bookings once per visitor per day against the prorated previous period', () => {
    const data = buildCommandCenter(
      inputs({
        events: [
          { day: '2026-10-13', name: 'consult_booked', events: 5, visitors: 4 },
          { day: '2026-10-14', name: 'consult_booked', events: 2, visitors: 2 },
          { day: '2026-10-06', name: 'consult_booked', events: 3, visitors: 3 },
          { day: '2026-10-07', name: 'consult_booked', events: 2, visitors: 2 }, // previous last day, half counts
        ],
        leads: [lead({ createdAt: '2026-10-13T10:00:00Z' }), lead({ createdAt: '2026-10-05T10:00:00Z' }), lead({ createdAt: '2026-10-04T10:00:00Z' })],
      }),
    );
    expect(data.consults.booked).toMatchObject({ current: 6, previous: 4, pct: 50 });
    expect(data.consults.requests).toMatchObject({ current: 1, previous: 2, pct: -50 });
    expect(data.consults.daily).toHaveLength(7);
  });

  it('ranks hot leads by score, then recency, and flags the cap status', () => {
    const data = buildCommandCenter(
      inputs({
        leads: [
          lead({ createdAt: '2026-10-14T08:00:00Z', score: 64 }),
          lead({ createdAt: '2026-10-13T08:00:00Z', score: 91 }),
          lead({ createdAt: '2026-10-12T08:00:00Z', score: null }),
          lead({ createdAt: '2026-10-14T07:00:00Z', score: 91 }),
          lead({ createdAt: '2026-10-14T06:00:00Z', score: 99, status: 'won' }), // closed: not a hot lead
        ],
        aiSpentTodayUsd: 2.7,
      }),
    );
    expect(data.hotLeads.map((h) => h.score)).toEqual([91, 91, 64, null]);
    expect(data.hotLeads[0].minutesAgo).toBe(120);
    expect(data.hotLeads[0].href).toMatch(/^\/admin\/leads\/.+\/$/);
    expect(data.topLeads).toMatchObject({ usesScores: true, avgScore: 86 });
    expect(data.topLeads.hotCount.current).toBe(3);
    expect(data.ai.capStatus).toBe('near');
    expect(buildCommandCenter(inputs({ aiBudgetUsd: 0 })).ai.capStatus).toBe('off');
  });

  it('lists content gaps before partial coverage, and is sparse without activity', () => {
    const topic = (id: string, level: 'gap' | 'partial' | 'covered', asks: number) => ({
      id,
      rank: 1,
      label: id,
      suggestedTitle: null,
      asks,
      visitors: asks,
      questionCount: 1,
      asksThisWeek: 0,
      asksPrevWeek: 0,
      trendPct: null,
      coverage: 0.2,
      topSimilarity: 0.45,
      level,
      levelSource: 'similarity' as const,
      levelReason: null,
      avgConfidence: null,
      examples: [{ q: `${id}?`, asks }],
      nearest: [],
    });
    const data = buildCommandCenter(
      inputs({
        insights: {
          run: { id: 'r', status: 'done', startedAt: now, finishedAt: now, questionCount: 9, askCount: 60, topicCount: 3, costUsd: 0.002, message: null },
          topics: [topic('partial-big', 'partial', 30), topic('gap-small', 'gap', 9), topic('covered', 'covered', 50)],
        },
      }),
    );
    expect(data.unanswered.items.map((i) => i.id)).toEqual(['gap-small', 'partial-big']);
    expect(data.unanswered.totalAsks).toBe(39);
    expect(data.sparse).toBe(true);
  });

  it('is demo-safe: no lead links when leadHref returns null', () => {
    const data = buildCommandCenter(inputs({ leads: [lead({ createdAt: '2026-10-14T08:00:00Z' })] }), { isDemo: true, leadHref: () => null });
    expect(data.isDemo).toBe(true);
    expect(data.hotLeads[0].href).toBeNull();
  });
});

describe('leads analytics', () => {
  it('measures speed-to-lead from the first status change', () => {
    const at = (iso: string, mins: number) => new Date(Date.parse(iso) + mins * 60_000).toISOString();
    const t = '2026-10-10T08:00:00Z';
    const s = speedToLead(
      [
        lead({ createdAt: t, firstResponseAt: at(t, 30), status: 'contacted' }),
        lead({ createdAt: t, firstResponseAt: at(t, 90), status: 'won' }),
        lead({ createdAt: t, firstResponseAt: at(t, 180), status: 'lost', type: 'partner' }),
        lead({ createdAt: t, status: 'new' }),
        lead({ createdAt: '2026-10-14T08:00:00Z', status: 'new' }),
      ],
      Date.parse('2026-10-14T09:00:00Z'),
    );
    expect(s).toMatchObject({ measured: 3, untouched: 2, overdue: 1, medianMinutes: 90, p90Minutes: 180 });
    expect(s.within1h).toBeCloseTo(1 / 3);
    expect(s.byType.find((r) => r.type === 'partner')).toMatchObject({ measured: 1, medianMinutes: 180 });
    expect(percentile([], 0.5)).toBeNull();
  });

  it('breaks leads down by stage, region and score band in fixed order', () => {
    const a = buildLeadsAnalytics({
      now: '2026-10-14T09:00:00Z',
      periodDays: 30,
      expectedValues: defaultExpectedValues(PLANS),
      regionNames: {},
      leads: [
        lead({ createdAt: '2026-10-13T08:00:00Z', stage: 'frame', regionSlug: 'sharon', score: 85 }),
        lead({ createdAt: '2026-10-12T08:00:00Z', stage: 'frame', regionSlug: 'south', score: 45 }),
        lead({ createdAt: '2026-10-11T08:00:00Z', source: { medium: 'campaign', source: 'facebook', campaign: 'spring', label: '' } }),
      ],
    });
    expect(a.total.current).toBe(3);
    expect(a.byStage.find((r) => r.key === 'frame')?.count).toBe(2);
    // The owner's 7 stages in order, then "אחר" and "לא צוין".
    expect(a.byStage.map((r) => r.key)).toEqual(['purchase', 'planning', 'permit', 'frame', 'infrastructure', 'finishing', 'moving-in', 'other', 'unknown']);
    expect(a.byRegion).toHaveLength(15); // 14 regions + "not given"
    expect(a.byScoreBand.map((r) => [r.key, r.count])).toEqual([['hot', 1], ['warm', 0], ['mild', 1], ['cold', 0], ['none', 1]]);
    expect(a.byUtm).toEqual([expect.objectContaining({ label: 'facebook / spring', count: 1 })]);
  });
});

describe('formatting', () => {
  it('keeps numbers short and LTR-friendly', () => {
    expect(formatNis(140_000_000, { compact: true })).toBe('₪1.4M');
    expect(formatNis(1_450_000, { compact: true })).toBe('₪14.5K');
    expect(formatNis(690_000)).toBe('₪6,900');
    expect(formatCount(1284)).toBe('1,284');
    expect(formatUsd(0.0031)).toBe('$0.0031');
    expect(formatUsd(0.7)).toBe('$0.70');
    expect(formatUsd(3)).toBe('$3');
    expect(formatDurationHe(45)).toBe('45 דק׳');
    expect(formatDurationHe(150)).toBe('2.5 שע׳');
    expect(formatDurationHe(60 * 72)).toBe('3 ימים');
    expect(formatBudgetRange([1_500_000, 2_000_000])).toBe('₪1.5M–2M');
  });
});
