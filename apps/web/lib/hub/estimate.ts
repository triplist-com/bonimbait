/**
 * The hub's first budget estimate. Two sources, in order:
 *   1. growth's budget planner result (`bb.planner.last`, PROGRAM.md §6), when
 *      the builder ran it;
 *   2. lib/calculator.ts, called through its exported functions only (the
 *      growth squad owns and recalibrates it; this adapter is the one place
 *      that knows its input shape).
 * Client-safe (the calculator is pure).
 */
import { calculateCost, getSqm, type CalculatorAnswers } from '@/lib/calculator';
import type { HubDraft, HubEstimate, PlannerEstimate } from './types';

/** The calculator's region multipliers know 6 areas; map the 13 member regions onto them. */
export const CALCULATOR_REGION: Record<string, string> = {
  golan: 'north',
  'upper-galilee': 'north',
  'akko-nahariya': 'north',
  'lower-galilee': 'north',
  'haifa-krayot': 'north',
  'zichron-valleys': 'north',
  hadera: 'sharon',
  sharon: 'sharon',
  center: 'center',
  shfela: 'shfela',
  jerusalem: 'jerusalem',
  'judea-samaria': 'shfela',
  south: 'south',
};

/** The calculator's size bucket for an exact m². */
export function calculatorSizeKey(sizeM2: number): string {
  if (sizeM2 <= 100) return 'up_to_100';
  if (sizeM2 <= 150) return '100_150';
  if (sizeM2 <= 200) return '150_200';
  if (sizeM2 <= 250) return '200_250';
  return '250_plus';
}

/**
 * Calculator estimate for the project: a typical two-storey block house with a
 * standard-plus finish, scaled from the size bucket's m² to the exact size.
 * Null without a size (nothing honest to say yet).
 */
export function estimateFromCalculator(draft: Pick<HubDraft, 'sizeM2' | 'regionSlug'>): HubEstimate | null {
  if (!draft.sizeM2) return null;
  const answers: CalculatorAnswers = {
    house_size: calculatorSizeKey(draft.sizeM2),
    floors: '2',
    construction_method: 'blocks',
    finishing_level: 'standard_high',
    region: CALCULATOR_REGION[draft.regionSlug ?? ''] ?? 'shfela',
    basement: 'no',
    special_features: [],
    timeline: 'normal',
  };
  const result = calculateCost(answers);
  const bucketM2 = getSqm(answers.house_size);
  const scale = bucketM2 > 0 ? draft.sizeM2 / bucketM2 : 1;
  const round = (n: number) => Math.round((n * scale) / 10_000) * 10_000;
  return {
    totalMin: round(result.total_min),
    totalMax: round(result.total_max),
    basis: 'calculator',
    inputs: { ...answers, size_m2: draft.sizeM2 },
  };
}

/** Validate growth's `bb.planner.last` (anything malformed is ignored). */
export function parsePlannerEstimate(value: unknown): PlannerEstimate | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const min = typeof v.totalMin === 'number' ? v.totalMin : NaN;
  const max = typeof v.totalMax === 'number' ? v.totalMax : NaN;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min || max > 1_000_000_000) return null;
  const at = typeof v.at === 'string' && !Number.isNaN(Date.parse(v.at)) ? v.at : null;
  if (!at) return null;
  const inputs = v.inputs && typeof v.inputs === 'object' && !Array.isArray(v.inputs) ? (v.inputs as Record<string, unknown>) : {};
  return { totalMin: Math.round(min), totalMax: Math.round(max), at, inputs };
}

export function estimateFromPlanner(planner: PlannerEstimate): HubEstimate {
  return {
    totalMin: planner.totalMin,
    totalMax: planner.totalMax,
    basis: 'planner',
    at: planner.at,
    inputs: planner.inputs,
  };
}

/** The planner's result when there is one, else the calculator's. */
export function initialEstimate(
  draft: Pick<HubDraft, 'sizeM2' | 'regionSlug'>,
  planner: PlannerEstimate | null | undefined,
): HubEstimate | null {
  return planner ? estimateFromPlanner(planner) : estimateFromCalculator(draft);
}
