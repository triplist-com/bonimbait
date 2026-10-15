import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_BANDS,
  SIZE_OPTIONS,
  addMonths,
  budgetBandId,
  daysUntilMonth,
  defaultProjectTitle,
  draftToProjectFields,
  firstOpenStep,
  isDraftComplete,
  monthsBetween,
  normalizeDraft,
  onboardingEventProps,
  profileStageFor,
  projectToDraft,
  remainingMonths,
  sizeBandId,
  stageFromProfile,
  suggestMoveIn,
} from '@/lib/hub/onboarding';
import { STAGE_IDS, type HubDraft } from '@/lib/hub/types';

const AGGREGATES_SQL = readFileSync(
  fileURLToPath(new URL('../../../../supabase/migrations/20261014121200_hub_aggregates.sql', import.meta.url)),
  'utf8',
);

const LEVI: HubDraft = {
  stage: 'permit',
  regionSlug: 'sharon',
  sizeM2: 220,
  budgetRangeNis: [2_400_000, 2_800_000],
  targetMoveIn: '2027-09',
};

describe('onboarding draft (bb.hub.draft)', () => {
  it('keeps exactly the five PROGRAM.md §6 fields', () => {
    const draft = normalizeDraft({ ...LEVI, extra: 'x', name: 'משפחת לוי' });
    expect(draft).toEqual(LEVI);
    expect(Object.keys(draft).sort()).toEqual(['budgetRangeNis', 'regionSlug', 'sizeM2', 'stage', 'targetMoveIn']);
  });

  it('drops invalid answers instead of throwing', () => {
    expect(normalizeDraft(null)).toEqual({});
    expect(normalizeDraft('{"stage":"permit"}')).toEqual({});
    expect(
      normalizeDraft({
        stage: 'tender', // a profile value, not a hub stage id
        regionSlug: 'nationwide', // pros only
        sizeM2: 5,
        budgetRangeNis: [3_000_000, 2_000_000],
        targetMoveIn: '2027-13',
      }),
    ).toEqual({});
  });

  it('accepts numeric strings and rounds sizes', () => {
    expect(normalizeDraft({ sizeM2: '219.6', budgetRangeNis: ['0', '1500000'] })).toEqual({
      sizeM2: 220,
      budgetRangeNis: [0, 1_500_000],
    });
  });

  it('is complete with stage, region and size; budget and move-in are optional', () => {
    expect(isDraftComplete({ stage: 'frame', regionSlug: 'south', sizeM2: 180 })).toBe(true);
    expect(isDraftComplete({ stage: 'frame', regionSlug: 'south' })).toBe(false);
    expect(firstOpenStep({})).toBe('stage');
    expect(firstOpenStep({ stage: 'frame' })).toBe('region');
    expect(firstOpenStep({ stage: 'frame', regionSlug: 'south' })).toBe('size');
    expect(firstOpenStep({ stage: 'frame', regionSlug: 'south', sizeM2: 180 })).toBeNull();
  });
});

describe('onboarding -> project mapping', () => {
  it('stores money in agorot and the move-in month as its first day', () => {
    expect(draftToProjectFields(LEVI, 'region-uuid')).toEqual({
      stage: 'permit',
      region_id: 'region-uuid',
      size_m2: 220,
      budget_min_agorot: 240_000_000,
      budget_max_agorot: 280_000_000,
      target_move_in: '2027-09-01',
    });
    expect(draftToProjectFields({ stage: 'planning' }, null)).toEqual({
      stage: 'planning',
      region_id: null,
      size_m2: null,
      budget_min_agorot: null,
      budget_max_agorot: null,
      target_move_in: null,
    });
  });

  it('round-trips a project row back to the same draft', () => {
    const fields = draftToProjectFields(LEVI, 'r');
    expect(projectToDraft(fields, 'sharon')).toEqual(LEVI);
  });

  it('maps every hub stage to a profile stage (infrastructure counts as frame)', () => {
    expect(STAGE_IDS.map(profileStageFor)).toEqual(['land', 'planning', 'tender', 'frame', 'frame', 'finishing', 'moving_in']);
    expect(stageFromProfile('tender')).toBe('permit');
    expect(stageFromProfile('design')).toBe('finishing');
    expect(stageFromProfile('renovation')).toBeUndefined();
    expect(stageFromProfile(null)).toBeUndefined();
  });

  it('builds analytics props without personal data', () => {
    expect(onboardingEventProps(LEVI, '2026-10-15')).toEqual({
      stage: 'permit',
      region: 'sharon',
      size_sqm: 220,
      budget_band: '2.5-3m',
      timeline_months: 11,
    });
  });

  it('titles the project from the member name', () => {
    expect(defaultProjectTitle('דנה לוי')).toBe('הבית של משפחת לוי');
    expect(defaultProjectTitle('מיכל בן דוד')).toBe('הבית של משפחת בן דוד');
    expect(defaultProjectTitle('אנה')).toBe('הבית של אנה');
    expect(defaultProjectTitle('  ')).toBe('הבית שלכם');
    expect(defaultProjectTitle(null)).toBe('הבית שלכם');
  });
});

describe('bands match the SQL aggregates', () => {
  it('buckets budgets by midpoint like hub_staff_aggregates()', () => {
    expect(BUDGET_BANDS.map((b) => budgetBandId(b.range))).toEqual(BUDGET_BANDS.map((b) => b.id));
    expect(budgetBandId(null)).toBe('unknown');
    for (const b of BUDGET_BANDS) expect(AGGREGATES_SQL).toContain(`'${b.id}'`);
  });

  it('buckets sizes like hub_staff_aggregates()', () => {
    expect(SIZE_OPTIONS.map((o) => sizeBandId(o.value))).toEqual(SIZE_OPTIONS.map((o) => o.id));
    expect(sizeBandId(undefined)).toBe('unknown');
    for (const o of SIZE_OPTIONS) expect(AGGREGATES_SQL).toContain(`'${o.id}'`);
  });
});

describe('timeline helpers', () => {
  it('does month arithmetic across years', () => {
    expect(addMonths('2026-10', 3)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2026-10', '2027-09')).toBe(11);
    expect(monthsBetween('2027-09', '2026-10')).toBe(-11);
  });

  it('counts days to the first of the target month', () => {
    expect(daysUntilMonth('2026-11', '2026-10-15')).toBe(17);
    expect(daysUntilMonth('2026-10', '2026-10-15')).toBe(-14);
  });

  it('sums typical remaining durations from the current stage', () => {
    // moving-in alone is 1-3 months; halfway through it leaves ~0.5-1.5.
    expect(remainingMonths('moving-in', 0)).toEqual({ min: 1, max: 3 });
    const fromStart = remainingMonths('purchase', 0);
    expect(fromStart.min).toBeGreaterThanOrEqual(18);
    expect(fromStart.max).toBeLessThanOrEqual(50);
    expect(remainingMonths('frame').min).toBeLessThan(remainingMonths('permit').min);
  });

  it('suggests a realistic move-in month for the stage', () => {
    const permit = suggestMoveIn('permit', '2026-10-15');
    const finishing = suggestMoveIn('finishing', '2026-10-15');
    expect(permit > finishing).toBe(true);
    expect(monthsBetween('2026-10', permit)).toBeGreaterThan(18);
    expect(monthsBetween('2026-10', suggestMoveIn('moving-in', '2026-10-15'))).toBeGreaterThanOrEqual(1);
  });
});
