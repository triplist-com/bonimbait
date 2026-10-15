// ============================================================
// Construction cost calculator: the STABLE legacy API.
//
// Kept for existing callers (the homepage example, the style guide, the hub
// squad's budget tab): calculateCost(answers) still returns
// { total_min, total_max, breakdown }. The numbers now come from the budget
// planner engine and the owner's 2026 price book (lib/planner/*):
//   - breakdown = the owner's stages with a share of planning + build
//     (תכנון, היתר/מכרז, שלד, תשתיות, גמרים), phase = the stage id;
//   - totals are ex-VAT, planning + build, ±15%.
// New code should use lib/planner/engine.ts (estimateBudget / estimateFromProfile).
// ============================================================

import { BUILD_STAGES } from '@/lib/stages';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { estimateBudget } from '@/lib/planner/engine';
import type { ExtraId, FinishLevelId, Floors, PlannerEstimate, PlannerInput, PriceBook } from '@/lib/planner/types';

export { estimateBudget, estimateFromProfile } from '@/lib/planner/engine';
export type { PlannerEstimate, PlannerInput, PriceBook } from '@/lib/planner/types';

export interface CalculatorAnswers {
  house_size: string;
  floors: string;
  construction_method: string;
  finishing_level: string;
  region: string;
  basement: string;
  special_features: string[];
  timeline: string;
}

export interface BreakdownItem {
  /** The stage id (lib/stages.ts), e.g. 'frame'. */
  phase: string;
  label: string;
  min: number;
  max: number;
  percentage: number;
}

export interface CalculatorResult {
  total_min: number;
  total_max: number;
  breakdown: BreakdownItem[];
}

// Size buckets (midpoint used for calculation)
const SIZE_MAP: Record<string, number> = {
  up_to_100: 90,
  '100_150': 125,
  '150_200': 175,
  '200_250': 225,
  '250_plus': 280,
};

const FLOORS_MAP: Record<string, Floors> = { '1': 1, '1.5': 2, '2': 2, '2_basement': 2, '3': 3 };

// The legacy "standard" and "standard_high" both mean the owner's standard-to-good anchor.
const FINISH_MAP: Record<string, FinishLevelId> = {
  basic: 'basic',
  standard: 'standard',
  standard_high: 'standard',
  high: 'high',
  luxury: 'luxury',
};

// Legacy coarse regions -> regions.slug (north had no single slug; lower Galilee stands in).
const REGION_MAP: Record<string, string> = {
  center: 'center',
  sharon: 'sharon',
  shfela: 'shfela',
  north: 'lower-galilee',
  south: 'south',
  jerusalem: 'jerusalem',
};

// Legacy special features with a sourced price in the price book (others are dropped).
const FEATURE_MAP: Record<string, ExtraId> = { pool: 'pool', basement: 'basement', vrf: 'vrf', smart_home: 'smart_home', slope: 'slope' };

/** Legacy wizard answers -> planner input (construction method and timeline are not priced). */
export function plannerInputFromAnswers(answers: Partial<CalculatorAnswers>): PlannerInput {
  const extras = new Set<ExtraId>();
  if (answers.basement === 'yes' || answers.floors === '2_basement') extras.add('basement');
  for (const f of answers.special_features ?? []) if (FEATURE_MAP[f]) extras.add(FEATURE_MAP[f]);
  return {
    sizeM2: getSqm(answers.house_size ?? ''),
    floors: FLOORS_MAP[answers.floors ?? ''] ?? 2,
    regionSlug: REGION_MAP[answers.region ?? ''] ?? answers.region ?? 'center',
    finishLevel: FINISH_MAP[answers.finishing_level ?? ''] ?? 'standard',
    extras: Array.from(extras),
  };
}

/** The legacy result shape from a planner estimate (stages with a share only). */
export function toCalculatorResult(estimate: PlannerEstimate): CalculatorResult {
  const label = (id: string) => BUILD_STAGES.find((s) => s.id === id)?.label ?? id;
  return {
    total_min: estimate.total.min,
    total_max: estimate.total.max,
    breakdown: estimate.stages
      .filter((s) => s.included && s.sharePct > 0)
      .map((s) => ({ phase: s.id, label: label(s.id), min: s.min, max: s.max, percentage: s.sharePct })),
  };
}

/**
 * Calculate a construction cost estimate from wizard answers.
 * Returns a result with total range and stage breakdown.
 */
export function calculateCost(answers: CalculatorAnswers, book: PriceBook = DEFAULT_PRICE_BOOK): CalculatorResult {
  return toCalculatorResult(estimateBudget(plannerInputFromAnswers(answers), book));
}

/** Format NIS amount with LTR mark for correct RTL rendering */
export function formatNIS(amount: number): string {
  return `${String.fromCharCode(0x200e)}${amount.toLocaleString('he-IL')} ₪`;
}

/** Get the sqm value for a size key */
export function getSqm(sizeKey: string): number {
  return SIZE_MAP[sizeKey] ?? 150;
}
