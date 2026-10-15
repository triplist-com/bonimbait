import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProjectFile, lastTouchCode } from '@/lib/project-file/server';
import { loadMemberProjectSnapshot } from '@/lib/project-file/hub-adapter';
import { buildProjectSnapshot } from '@/lib/hub/snapshot';
import { isBuilderLead, prepareRevenueLead } from '@/lib/revenue/lead-pipeline';
import { invalidateRoutingRules } from '@/lib/revenue/routing-server';
import type { DbClient } from '@/lib/db/client';
import type { LeadAttribution } from '@/lib/analytics/attribution';
import { fakeDb } from './fake-db';

const MEMBER = '00000000-0000-4000-8000-00000000aaaa';
const BIZ = '00000000-0000-4000-8000-0000000000b1';

const attribution: LeadAttribution = {
  model: 'last_touch_4h',
  touch: 'partner_click',
  at: '2026-10-14T09:00:00.000Z',
  minutes_before: 12,
  medium: 'partner',
  source: 'partner-42',
  campaign: 'fall',
  path: '/search/',
};

// The hub's member snapshot (lib/hub/server.ts needs a database; its pure builder is used below).
const hub = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('@/lib/hub/server', () => ({ getMemberProjectSnapshot: hub.snapshot }));

afterEach(() => {
  hub.snapshot.mockReset();
  vi.useRealTimers();
  invalidateRoutingRules();
});

describe('the hub snapshot', () => {
  it('takes the hub snapshot as is: the hub builds exactly the §6 shape', async () => {
    const snapshot = buildProjectSnapshot({
      project: { stage: 'frame', size_m2: 180, budget_min_agorot: 180_000_000, budget_max_agorot: 220_000_000, target_move_in: '2027-09-01' },
      regionSlug: 'center',
      currentVersion: {
        basis: 'planner',
        total_min_agorot: 190_000_000,
        total_max_agorot: 230_000_000,
        inputs: { planner_at: '2026-10-10T08:00:00.000Z', planner_inputs: { floors: 2 } },
        created_at: '2026-10-10T08:00:00.000Z',
      },
      saved: [
        { kind: 'video', ref: 'abc' },
        { kind: 'business', ref: BIZ },
      ],
    });
    hub.snapshot.mockResolvedValueOnce(snapshot);
    const file = await loadMemberProjectSnapshot(MEMBER);
    expect(hub.snapshot).toHaveBeenCalledWith(MEMBER);
    expect(file).toEqual(snapshot);
    expect(file).toMatchObject({ stage: 'frame', regionSlug: 'center', sizeM2: 180, budgetRangeNis: [1_800_000, 2_200_000], savedCount: 1, shortlistBusinessIds: [BIZ] });
  });

  it('gives null for no project, an empty file, a failure or a slow hub', async () => {
    hub.snapshot.mockResolvedValueOnce(null);
    expect(await loadMemberProjectSnapshot(MEMBER)).toBeNull();
    hub.snapshot.mockResolvedValueOnce({ version: 1, savedCount: 0, shortlistBusinessIds: [] });
    expect(await loadMemberProjectSnapshot(MEMBER)).toBeNull();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hub.snapshot.mockRejectedValueOnce(new Error('hub down'));
    expect(await loadMemberProjectSnapshot(MEMBER)).toBeNull();
    vi.useFakeTimers();
    hub.snapshot.mockReturnValueOnce(new Promise(() => undefined));
    const slow = loadMemberProjectSnapshot(MEMBER);
    await vi.advanceTimersByTimeAsync(1600);
    expect(await slow).toBeNull();
    quiet.mockRestore();
    expect(await loadMemberProjectSnapshot('')).toBeNull();
  });
});

describe('buildProjectFile', () => {
  it('merges browser < member < form, adds the last touch and scores it', async () => {
    hub.snapshot.mockResolvedValueOnce({ version: 1, stage: 'planning', sizeM2: 240, budgetRangeNis: [2_000_000, 2_400_000] });
    const { file, score } = await buildProjectFile({
      clientFile: {
        stage: 'purchase',
        regionSlug: 'sharon',
        sizeM2: 200,
        questions: [{ q: 'כמה עולה קבלן שלד?', at: '2026-10-12T08:00:00.000Z' }],
        source: { landing: '/forged/', lastTouch: 'forged', utm: { utm_source: 'newsletter' } },
      },
      memberId: MEMBER,
      formFacts: { stage: 'tender', regionSlug: '' },
      visitor: { anonId: null, sessionId: null },
      attribution,
    });
    expect(file).toEqual({
      version: 1,
      stage: 'permit', // the form ('tender') beats the member's 'planning'
      regionSlug: 'sharon',
      sizeM2: 240, // the member beats the browser
      budgetRangeNis: [2_000_000, 2_400_000],
      questions: [{ q: 'כמה עולה קבלן שלד?', at: '2026-10-12T08:00:00.000Z' }],
      // The browser's landing and last touch are ignored; its UTMs fill in when analytics has none.
      source: { utm: { utm_source: 'newsletter' }, lastTouch: 'partner:partner-42' },
    });
    expect(score.score).toBeGreaterThan(50);
    expect(score.reasons.map((r) => r.code)).toContain('pro_questions');
  });

  it('works for anonymous visitors with nothing stored', async () => {
    const { file, score } = await buildProjectFile({});
    expect(file).toEqual({ version: 1 });
    expect(score.score).toBe(0);
  });

  it('codes the last touch compactly', () => {
    expect(lastTouchCode(attribution)).toBe('partner:partner-42');
    expect(lastTouchCode({ ...attribution, medium: 'referral', source: null })).toBe('referral:-');
    expect(lastTouchCode(null)).toBeUndefined();
  });
});

describe('prepareRevenueLead', () => {
  const visitor = { anonId: null, sessionId: null };

  it('enriches builder leads: file, score and routing in the payload', async () => {
    const db = fakeDb({
      lead_routing_rules: [],
      business_specialties: [{ business_id: BIZ, specialties: { slug: 'קבלני-אלומיניום' } }],
    }) as unknown as DbClient;
    const res = await prepareRevenueLead({
      db,
      type: 'business_contact',
      parsed: { regionSlug: 'sharon', constructionStage: 'frame' },
      clientFile: { sizeM2: 220 },
      memberId: null,
      businessId: BIZ,
      payload: { kind: 'quote_request' },
      attribution: null,
      visitor,
    });
    expect(res.envelope?.file).toMatchObject({ stage: 'frame', regionSlug: 'sharon', sizeM2: 220 });
    expect(res.payload.project_file).toEqual(res.envelope?.file);
    expect(res.payload.project_score).toEqual(res.envelope?.score);
    expect(res.payload.routing).toMatchObject({ rule_id: null, target: 'business_default' });
    expect(res.route).toBeNull();
  });

  it('routes B2B leads without a project file', async () => {
    const db = fakeDb({
      lead_routing_rules: [
        {
          id: '00000000-0000-4000-8000-000000000777',
          name: 'שותפים אסטרטגיים לבעלים',
          is_active: true,
          priority: 1,
          lead_types: ['partner'],
          specialty_slugs: [],
          region_slugs: [],
          stages: [],
          min_score: null,
          max_score: null,
          target: 'owner_inbox',
          target_business_id: null,
          target_campaign_id: null,
        },
      ],
    }) as unknown as DbClient;
    expect(isBuilderLead('partner')).toBe(false);
    const res = await prepareRevenueLead({
      db,
      type: 'partner',
      parsed: { regionSlug: null, constructionStage: null },
      memberId: null,
      businessId: null,
      payload: {},
      attribution: null,
      visitor,
    });
    expect(res.envelope).toBeNull();
    expect(res.payload).toEqual({ routing: expect.objectContaining({ target: 'owner_inbox', rule_name: 'שותפים אסטרטגיים לבעלים' }) });
    expect(res.route).toEqual({ kind: 'site' });
  });

  it('never throws: a broken database still stores the lead, default-routed', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = {
      from: () => {
        throw new Error('db down');
      },
    } as unknown as DbClient;
    const res = await prepareRevenueLead({
      db: broken,
      type: 'consultation',
      parsed: { regionSlug: null, constructionStage: null },
      memberId: null,
      businessId: BIZ,
      payload: {},
      attribution: null,
      visitor,
    });
    expect(res.decision.target).toBe('business_default');
    expect(res.payload.routing).toMatchObject({ target: 'business_default' });
    quiet.mockRestore();
  });
});
