import { describe, expect, it } from 'vitest';
import { readProjectSnapshots, collectProjectFile, type StorageLike } from '@/lib/project-file/collect';
import {
  isEmptyProjectFile,
  mergeProjectFiles,
  parseProjectFileField,
  sanitizeProjectFile,
  serializeProjectFile,
  toBudgetRange,
  toIsoMonth,
  toQuestions,
  toStageId,
} from '@/lib/project-file/sanitize';
import { formatBudgetRange, formatNisShort, projectFacts, projectHeadline } from '@/lib/project-file/format';
import { PROJECT_FILE_STORAGE_KEYS as K, type ProjectFile } from '@/lib/project-file/types';
import { DRAFT_KEY, PLANNER_KEY, SAVED_KEY, SHORTLIST_KEY } from '@/lib/hub/local-saved';
import { normalizeDraft } from '@/lib/hub/onboarding';
import { buildLocalSnapshot } from '@/lib/hub/snapshot';
import type { ProjectFileSnapshot } from '@/lib/hub/types';

const BIZ_A = '11111111-1111-4111-8111-111111111111';
const BIZ_B = '22222222-2222-4222-8222-222222222222';

function fakeStorage(entries: Record<string, unknown>): StorageLike {
  return {
    getItem: (key) => {
      if (!(key in entries)) return null;
      const v = entries[key];
      return typeof v === 'string' ? v : JSON.stringify(v);
    },
  };
}

describe('sanitizeProjectFile (the contract, defensively)', () => {
  it('keeps a valid contract file as-is', () => {
    const file = {
      version: 1,
      stage: 'permit',
      regionSlug: 'sharon',
      sizeM2: 220,
      budgetRangeNis: [2_400_000, 2_800_000],
      targetMoveIn: '2028-03',
      questions: [{ q: 'כמה עולים חלונות אלומיניום?', at: '2026-10-10T08:00:00.000Z' }],
      plannerEstimate: { totalMin: 2_300_000, totalMax: 2_700_000, at: '2026-10-11T08:00:00.000Z', inputs: { size: 220 } },
      savedCount: 4,
      shortlistBusinessIds: [BIZ_A],
      source: { utm: { utm_source: 'facebook' }, landing: '/', lastTouch: 'campaign:facebook' },
    };
    expect(sanitizeProjectFile(file)).toEqual(file);
  });

  it('drops invalid values instead of throwing', () => {
    expect(
      sanitizeProjectFile({
        stage: 'nope',
        regionSlug: 'atlantis',
        sizeM2: 3,
        budgetRangeNis: ['x', null],
        targetMoveIn: '2027-13',
        questions: 'not-a-list',
        shortlistBusinessIds: ['not-a-uuid', 42],
        savedCount: -2,
      }),
    ).toEqual({ version: 1 });
    expect(sanitizeProjectFile(null)).toEqual({ version: 1 });
    expect(sanitizeProjectFile('{"stage":"permit"}')).toEqual({ version: 1 });
  });

  it('reads snake_case and other producer variants', () => {
    expect(
      sanitizeProjectFile({
        construction_stage: 'tender',
        region_slug: 'center',
        size_m2: '180',
        budget_min: 1_500_000,
        budget_max: 1_200_000,
        target_move_in: '2027-09-01',
        planner_estimate: { total: 1_400_000 },
        shortlist: [{ id: BIZ_A }, { business_id: BIZ_B }, { id: BIZ_A }],
      }),
    ).toMatchObject({
      stage: 'permit',
      regionSlug: 'center',
      sizeM2: 180,
      budgetRangeNis: [1_200_000, 1_500_000],
      targetMoveIn: '2027-09',
      plannerEstimate: { totalMin: 1_400_000, totalMax: 1_400_000 },
      shortlistBusinessIds: [BIZ_A, BIZ_B],
    });
  });

  it('maps profile stages and Hebrew labels to the 7 stage ids', () => {
    expect(toStageId('land')).toBe('purchase');
    expect(toStageId('moving_in')).toBe('moving-in');
    expect(toStageId('שלד')).toBe('frame');
    expect(toStageId('renovation')).toBeUndefined();
  });

  it('only trusts whole-shekel budgets', () => {
    expect(toBudgetRange(2.6)).toBeUndefined(); // "2.6 million" typed as 2.6
    expect(toBudgetRange({ min: 900_000, max: '1,100,000' })).toEqual([900_000, 1_100_000]);
    expect(toBudgetRange(2_000_000)).toEqual([2_000_000, 2_000_000]);
  });

  it('normalizes months', () => {
    expect(toIsoMonth('2027-9')).toBeUndefined();
    expect(toIsoMonth('2027-09-30T00:00:00Z')).toBe('2027-09');
    expect(toIsoMonth(new Date(Date.UTC(2028, 2, 5)))).toBe('2028-03');
  });

  it('keeps the last 10 questions, deduped, oldest first, with contact details redacted', () => {
    const list = Array.from({ length: 14 }, (_, i) => ({
      q: `שאלה ${i}`,
      at: new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString(),
    }));
    list.push({ q: 'שאלה 3', at: new Date(Date.UTC(2026, 9, 2)).toISOString() }); // asked again later
    list.push({ q: 'תתקשרו אליי 050-123-4567 או a@b.co', at: new Date(Date.UTC(2026, 9, 3)).toISOString() });
    const out = toQuestions(list)!;
    expect(out).toHaveLength(10);
    expect(out[out.length - 1].q).toBe('תתקשרו אליי [phone] או [email]');
    expect(out[out.length - 2].q).toBe('שאלה 3');
    expect(out.map((x) => x.q)).not.toContain('שאלה 0');
    expect(toQuestions(['כמה עולה שלד?', { question: 'מה עם היתר?' }])?.map((x) => x.q)).toEqual(['כמה עולה שלד?', 'מה עם היתר?']);
  });

  it('round-trips through the hidden form field and rejects junk', () => {
    const file = sanitizeProjectFile({ stage: 'frame', regionSlug: 'south', sizeM2: 200 });
    expect(parseProjectFileField(serializeProjectFile(file))).toEqual(file);
    expect(parseProjectFileField('{oops')).toEqual({ version: 1 });
    expect(parseProjectFileField('x'.repeat(20_000))).toEqual({ version: 1 });
    expect(parseProjectFileField(undefined)).toEqual({ version: 1 });
  });

  it('knows an empty file', () => {
    expect(isEmptyProjectFile({ version: 1, source: { landing: '/' } })).toBe(true);
    expect(isEmptyProjectFile({ version: 1, savedCount: 1 })).toBe(false);
  });
});

describe('mergeProjectFiles', () => {
  it('lets later files win single facts and unions the lists', () => {
    const anon = sanitizeProjectFile({
      stage: 'planning',
      regionSlug: 'sharon',
      questions: [{ q: 'מה זה היתר?', at: '2026-10-01T00:00:00.000Z' }],
      shortlistBusinessIds: [BIZ_A],
      savedCount: 2,
      source: { utm: { utm_source: 'google' } },
    });
    const member = sanitizeProjectFile({
      stage: 'permit',
      questions: [{ q: 'כמה עולה שלד?', at: '2026-10-02T00:00:00.000Z' }],
      shortlistBusinessIds: [BIZ_B, BIZ_A],
      savedCount: 1,
      source: { landing: '/blog/', utm: { utm_campaign: 'spring' } },
    });
    expect(mergeProjectFiles(anon, null, member)).toEqual({
      version: 1,
      stage: 'permit',
      regionSlug: 'sharon',
      questions: [
        { q: 'מה זה היתר?', at: '2026-10-01T00:00:00.000Z' },
        { q: 'כמה עולה שלד?', at: '2026-10-02T00:00:00.000Z' },
      ],
      shortlistBusinessIds: [BIZ_A, BIZ_B],
      savedCount: 2,
      source: { utm: { utm_source: 'google', utm_campaign: 'spring' }, landing: '/blog/' },
    });
  });

  it('keeps the newest planner estimate', () => {
    const old = { totalMin: 1, totalMax: 2, at: '2026-09-01T00:00:00.000Z', inputs: {} };
    const fresh = { totalMin: 3, totalMax: 4, at: '2026-10-01T00:00:00.000Z', inputs: {} };
    expect(mergeProjectFiles({ version: 1, plannerEstimate: fresh }, { version: 1, plannerEstimate: old }).plannerEstimate).toEqual(fresh);
  });
});

describe('readProjectSnapshots (client collection)', () => {
  it('merges the four snapshots and the session UTMs', () => {
    const local = fakeStorage({
      [K.hubDraft]: { stage: 'permit', regionSlug: 'sharon', sizeM2: 220, budgetRangeNis: [2_400_000, 2_800_000], targetMoveIn: '2028-03' },
      [K.plannerLast]: { totalMin: 2_300_000, totalMax: 2_700_000, at: '2026-10-11T08:00:00.000Z', inputs: { finish: 'standard' } },
      [K.advisorRecent]: [{ q: 'כמה עולים חלונות אלומיניום?', at: '2026-10-10T08:00:00.000Z' }],
      [K.shortlist]: [BIZ_A],
    });
    const session = fakeStorage({ bb_utm: { utm_source: 'facebook', utm_campaign: 'fall' } });
    expect(readProjectSnapshots(local, session)).toEqual({
      version: 1,
      stage: 'permit',
      regionSlug: 'sharon',
      sizeM2: 220,
      budgetRangeNis: [2_400_000, 2_800_000],
      targetMoveIn: '2028-03',
      questions: [{ q: 'כמה עולים חלונות אלומיניום?', at: '2026-10-10T08:00:00.000Z' }],
      plannerEstimate: { totalMin: 2_300_000, totalMax: 2_700_000, at: '2026-10-11T08:00:00.000Z', inputs: { finish: 'standard' } },
      shortlistBusinessIds: [BIZ_A],
      source: { utm: { utm_source: 'facebook', utm_campaign: 'fall' } },
    });
  });

  it('tolerates missing keys, malformed JSON, wrapped drafts and storage that throws', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readProjectSnapshots(throwing, throwing)).toEqual({ version: 1 });
    expect(readProjectSnapshots(fakeStorage({ [K.hubDraft]: '{bad json', [K.shortlist]: 'x' }), null)).toEqual({ version: 1 });
    expect(readProjectSnapshots(fakeStorage({ [K.hubDraft]: { answers: { stage: 'frame' } } }))).toEqual({ version: 1, stage: 'frame' });
    // A draft can't smuggle questions in: they only come from the advisor's key.
    expect(readProjectSnapshots(fakeStorage({ [K.hubDraft]: { questions: [{ q: 'x?', at: '2026-10-01T00:00:00Z' }] } }))).toEqual({ version: 1 });
  });

  it('returns an empty file outside the browser', () => {
    expect(collectProjectFile()).toEqual({ version: 1 });
  });
});

describe('the hub contract (bb.hub.draft, bb.shortlist, saved items)', () => {
  it('reads the keys the hub writes', () => {
    expect([K.hubDraft, K.shortlist, K.plannerLast]).toEqual([DRAFT_KEY, SHORTLIST_KEY, PLANNER_KEY]);
  });

  it('builds, from what the hub stores, the same file the hub itself would build', () => {
    const draft = normalizeDraft({ stage: 'frame', regionSlug: 'sharon', sizeM2: 230, budgetRangeNis: [2_000_000, 2_500_000], targetMoveIn: '2027-11' });
    const saved = [
      { kind: 'video', ref: 'abc123', title: 'שלד', at: '2026-10-10T08:00:00.000Z' },
      { kind: 'post', ref: 'permit-guide', title: 'היתר', at: '2026-10-11T08:00:00.000Z' },
      { kind: 'business', ref: BIZ_A, title: 'קבלן', at: '2026-10-12T08:00:00.000Z' },
    ] as const;
    const planner = { totalMin: 2_100_000, totalMax: 2_600_000, at: '2026-10-12T09:00:00.000Z', inputs: { finish: 'standard' } };
    const local = fakeStorage({
      [DRAFT_KEY]: draft,
      [SAVED_KEY]: { v: 1, items: saved },
      [SHORTLIST_KEY]: [BIZ_B, BIZ_A],
      [PLANNER_KEY]: planner,
    });
    const hubFile: ProjectFileSnapshot = buildLocalSnapshot(draft, saved, [BIZ_B, BIZ_A], planner);
    const asProjectFile: ProjectFile = hubFile; // one type: the hub's snapshot is a ProjectFile
    expect(readProjectSnapshots(local)).toEqual(asProjectFile);
    expect(asProjectFile).toMatchObject({ savedCount: 2, shortlistBusinessIds: [BIZ_B, BIZ_A], stage: 'frame' });
  });
});

describe('Hebrew formatting', () => {
  it('formats amounts and ranges', () => {
    expect(formatNisShort(2_600_000)).toBe('2.6 מיליון ₪');
    expect(formatNisShort(850_000)).toBe('850 אלף ₪');
    expect(formatNisShort(12_000_000)).toBe('12 מיליון ₪');
    // LRM marks keep a same-unit range in reading order inside Hebrew text.
    expect(formatBudgetRange([2_400_000, 2_800_000])).toBe('2.4‎–‎2.8 מיליון ₪');
    expect(formatBudgetRange([900_000, 1_200_000])).toBe('900 אלף – 1.2 מיליון ₪');
    expect(formatBudgetRange([2_000_000, 2_000_000])).toBe('2 מיליון ₪');
  });

  it('builds the fact rows and the headline', () => {
    const file = sanitizeProjectFile({ stage: 'permit', regionSlug: 'sharon', sizeM2: 220, budgetRangeNis: [2_600_000, 2_600_000] });
    expect(projectHeadline(file)).toBe('היתר/מכרז · אזור השרון · 220 מ״ר · 2.6 מיליון ₪');
    expect(projectFacts(file).find((f) => f.key === 'moveIn')?.value).toBeNull();
  });
});
