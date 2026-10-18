import { describe, expect, it } from 'vitest';
import {
  buildLocalSnapshot,
  buildProjectSnapshot,
  plannerEstimateOf,
  plannerVersionInputs,
  projectFileCompleteness,
} from '@/lib/hub/snapshot';
import type { PlannerEstimate, ProjectFileSnapshot } from '@/lib/hub/types';

const PROJECT = {
  stage: 'permit' as const,
  size_m2: 220,
  budget_min_agorot: 240_000_000,
  budget_max_agorot: 280_000_000,
  target_move_in: '2027-09-01',
};

const SAVED = [
  { kind: 'video' as const, ref: 'gUrvdx_xZjM' },
  { kind: 'post' as const, ref: 'bill-of-quantities' },
  { kind: 'business' as const, ref: '11111111-1111-4111-8111-111111111111' },
  { kind: 'business' as const, ref: '22222222-2222-4222-8222-222222222222' },
  { kind: 'answer' as const, ref: 'כמה עולה שלד?' },
];

const PLANNER: PlannerEstimate = {
  totalMin: 2_550_000,
  totalMax: 3_050_000,
  at: '2026-10-10T08:00:00.000Z',
  inputs: { size: 220, finish: 'standard_high' },
};

describe('buildProjectSnapshot (getMemberProjectSnapshot)', () => {
  it('returns the PROGRAM.md §6 ProjectFile fields in their units', () => {
    const file = buildProjectSnapshot({ project: PROJECT, regionSlug: 'sharon', saved: SAVED });
    expect(file).toEqual({
      version: 1,
      stage: 'permit',
      regionSlug: 'sharon',
      sizeM2: 220,
      budgetRangeNis: [2_400_000, 2_800_000],
      targetMoveIn: '2027-09',
      savedCount: 3,
      shortlistBusinessIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    });
  });

  it('carries the planner estimate from a planner-based budget version', () => {
    const file = buildProjectSnapshot({
      project: PROJECT,
      regionSlug: 'sharon',
      saved: [],
      currentVersion: {
        basis: 'planner',
        total_min_agorot: 255_000_000,
        total_max_agorot: 305_000_000,
        inputs: plannerVersionInputs(PLANNER),
        created_at: '2026-10-11T00:00:00.000Z',
      },
    });
    expect(file.plannerEstimate).toEqual(PLANNER);
  });

  it('has no planner estimate for a calculator-based version', () => {
    expect(
      plannerEstimateOf({ basis: 'calculator', total_min_agorot: 1, total_max_agorot: 2, inputs: {}, created_at: '2026-10-11T00:00:00Z' }),
    ).toBeUndefined();
  });

  it('leaves out what the builder has not answered', () => {
    const file = buildProjectSnapshot({
      project: { stage: 'frame', size_m2: null, budget_min_agorot: null, budget_max_agorot: null, target_move_in: null },
      regionSlug: null,
      saved: [],
    });
    expect(file).toEqual({ version: 1, stage: 'frame', savedCount: 0, shortlistBusinessIds: [] });
    expect(JSON.stringify(file)).not.toContain('undefined');
  });

  it('works for a project shell (saved items before onboarding)', () => {
    expect(buildProjectSnapshot({ project: null, regionSlug: null, saved: SAVED.slice(0, 1) })).toEqual({
      version: 1,
      savedCount: 1,
      shortlistBusinessIds: [],
    });
  });
});

describe('buildLocalSnapshot (anonymous visitor)', () => {
  it('merges bb.shortlist with saved pros, without duplicates', () => {
    const file = buildLocalSnapshot(
      { stage: 'permit', regionSlug: 'sharon' },
      SAVED,
      ['11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'],
      PLANNER,
    );
    expect(file.shortlistBusinessIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(file.savedCount).toBe(3);
    expect(file.plannerEstimate).toEqual(PLANNER);
  });
});

describe('projectFileCompleteness', () => {
  it('scores what the consult team will see', () => {
    const file: ProjectFileSnapshot = buildProjectSnapshot({ project: PROJECT, regionSlug: 'sharon', saved: SAVED });
    const full = projectFileCompleteness(file, { hasEstimate: true, questions: 2 });
    expect(full).toMatchObject({ percent: 100, done: 9, total: 9 });

    const partial = projectFileCompleteness({ version: 1, stage: 'planning' });
    expect(partial.done).toBe(1);
    expect(partial.percent).toBe(11);
    expect(partial.items.filter((i) => !i.done).every((i) => i.hint.length > 0)).toBe(true);
  });
});
