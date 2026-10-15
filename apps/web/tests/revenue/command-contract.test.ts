/**
 * The revenue <-> command center contracts (orchestrator, 2026-10-15):
 *   1. lead score: leads.score / payload.project_score as the dashboard reads them
 *   2. partner tiers: live subscription terms drive partner health
 *   3. partner ids: the partner key is the business id (see partner-tiers.ts)
 *   4. booked consults: leads.booked_at drives the consults tile
 */
import { describe, expect, it } from 'vitest';
import { buildCommandCenter } from '@/lib/command/build';
import { HOT_SCORE } from '@/lib/command/dimensions';
import { readLeadScore, toLeadFact, LEAD_FACT_COLUMNS, type RawLeadRow } from '@/lib/command/leads';
import { partnerHealth } from '@/lib/command/partners';
import { defaultExpectedValues } from '@/lib/command/pipeline';
import type { CommandInputs, LeadFact, PartnerFact } from '@/lib/command/types';
import { sanitizeProjectFile } from '@/lib/project-file/sanitize';
import { BAND_THRESHOLDS, scoreProjectFile } from '@/lib/project-file/score';
import { commandTierId } from '@/lib/revenue/partner-tiers';

const FILE = sanitizeProjectFile({
  stage: 'permit',
  regionSlug: 'sharon',
  sizeM2: 220,
  budgetRangeNis: [2_400_000, 2_800_000],
  targetMoveIn: '2028-03',
  questions: [
    { q: 'איזה פרופיל אלומיניום מתאים לבית ליד הים?', at: '2026-10-09T09:00:00.000Z' },
    { q: 'כמה עולים חלונות אלומיניום לבית של 220 מ״ר?', at: '2026-10-10T09:00:00.000Z' },
  ],
});

const row = (over: Partial<RawLeadRow> = {}): RawLeadRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  ref: 'BB-26-000001',
  type: 'consultation',
  status: 'new',
  created_at: '2026-10-13T08:00:00Z',
  construction_stage: 'tender',
  region_id: null,
  payload: {},
  utm: {},
  attribution: null,
  source_url: null,
  service_plan_id: null,
  ...over,
});

const ctx = { regionSlugById: new Map<string, string>(), planSlugById: new Map<string, string>(), firstResponseAt: new Map<string, string>() };

describe('1. the lead score the dashboard reads', () => {
  it('reads what the revenue pipeline stores (payload.project_score), reasons as labels', () => {
    const stored = scoreProjectFile(FILE, { visits: 3 });
    const read = readLeadScore({ project_file: FILE, project_score: stored });
    expect(read.score).toBe(stored.score);
    expect(read.reasons).toEqual(stored.reasons.map((r) => r.label).slice(0, 6));
    expect(read.reasons[0]).toBe('שלב היתר/מכרז: בוחרים עכשיו קבלנים וספקים');
  });

  it('prefers the leads.score column, and selects it with booked_at', () => {
    expect(LEAD_FACT_COLUMNS).toContain('score');
    expect(LEAD_FACT_COLUMNS).toContain('booked_at');
    const stored = scoreProjectFile(FILE);
    const fact = toLeadFact(row({ score: 91, payload: { project_score: stored }, booked_at: '2026-10-13T09:30:00Z' }), ctx);
    expect(fact.score).toBe(91);
    expect(fact.scoreReasons.length).toBeGreaterThan(0);
    expect(fact.bookedAt).toBe('2026-10-13T09:30:00Z');
    // No column (older row or fixture): the payload still works; nothing at all: null.
    expect(toLeadFact(row({ payload: { project_score: stored } }), ctx).score).toBe(stored.score);
    expect(toLeadFact(row(), ctx)).toMatchObject({ score: null, scoreReasons: [], bookedAt: null });
  });

  it('agrees with the scorer on what "hot" means', () => {
    expect(HOT_SCORE).toBe(BAND_THRESHOLDS.hot);
  });
});

describe('2-3. partner tiers in partner health', () => {
  const base: PartnerFact = {
    id: '11111111-1111-4111-8111-111111111111', // the partner key is the business id
    name: 'עמיאל',
    tier: 'partners',
    impressions: 2_000,
    clicks: 40,
    leads: 4,
    prevImpressions: 0,
    prevClicks: 0,
    prevLeads: 0,
  };

  it('uses the live subscription\'s price and target over the defaults', () => {
    const live = partnerHealth({ ...base, tierInfo: { label: 'שותפים', monthlyPriceNis: 1_290, monthlyImpressionTarget: 2_000 } }, 30);
    expect(live).toMatchObject({ impressionsTarget: 2_000, status: 'on_track', monthlyPriceNis: 1_290, costPerLeadNis: 323 });
    const fallback = partnerHealth(base, 30);
    expect(fallback).toMatchObject({ impressionsTarget: 5_000, monthlyPriceNis: 1_490, status: 'at_risk' });
  });

  it('maps tiers to the command center ids by slug, else by rank', () => {
    expect(commandTierId({ tierSlug: 'ambassadors', rank: 3 })).toBe('ambassadors');
    expect(commandTierId({ tierSlug: 'gold', rank: 3 })).toBe('ambassadors');
    expect(commandTierId({ tierSlug: 'silver', rank: 2 })).toBe('partners');
    expect(commandTierId({ tierSlug: 'basic', rank: 1 })).toBe('members');
  });
});

describe('4. booked consults on the consults tile', () => {
  const now = '2026-10-14T09:00:00Z';
  const lead = (over: Partial<LeadFact>): LeadFact => ({
    id: Math.random().toString(36).slice(2),
    ref: 'BB-26-000002',
    type: 'consultation',
    status: 'new',
    createdAt: '2026-10-13T08:00:00Z',
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
  });
  const inputs = (over: Partial<CommandInputs>): CommandInputs => ({
    now,
    periodDays: 7,
    leads: [],
    plans: [],
    orders: [],
    events: [],
    aiUsage: [],
    aiBudgetUsd: 3,
    aiSpentTodayUsd: 0,
    partners: [],
    expectedValues: defaultExpectedValues([]),
    insights: null,
    topQuestions: [],
    regionNames: {},
    pending: null,
    ...over,
  });

  it('counts consultation leads booked in the period (requests vs booked)', () => {
    const data = buildCommandCenter(
      inputs({
        leads: [
          lead({ bookedAt: '2026-10-13T09:00:00Z' }),
          lead({ bookedAt: '2026-10-14T07:00:00Z' }),
          lead({}), // requested, not booked
          lead({ bookedAt: '2026-10-13T10:00:00Z', status: 'spam' }), // never counts
          lead({ type: 'contact', bookedAt: '2026-10-13T10:00:00Z' }), // not a consultation
        ],
        // Calendly events are ignored once bookings come from the leads themselves.
        events: [{ day: '2026-10-13', name: 'consult_booked', events: 9, visitors: 9 }],
      }),
    );
    expect(data.consults.booked.current).toBe(2);
    expect(data.consults.requests.current).toBe(3); // spam and other types never count
    expect(data.consults.daily.reduce((a, p) => a + p.value, 0)).toBe(2);
  });

  it('falls back to Calendly events when no lead carries a booking time', () => {
    const data = buildCommandCenter(inputs({ events: [{ day: '2026-10-13', name: 'consult_booked', events: 3, visitors: 3 }] }));
    expect(data.consults.booked.current).toBe(3);
  });
});
