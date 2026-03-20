// ============================================================
// Construction cost calculator — mirrors the backend wizard logic
// Used for SSG pre-calculated scenario pages
// ============================================================

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

// Base cost per sqm in NIS
const BASE_COST_PER_SQM = 7000;

// Size ranges in sqm (midpoint used for calculation)
const SIZE_MAP: Record<string, number> = {
  up_to_100: 90,
  '100_150': 125,
  '150_200': 175,
  '200_250': 225,
  '250_plus': 280,
};

// Floor multipliers
const FLOOR_MULTIPLIER: Record<string, number> = {
  '1': 1.0,
  '1.5': 1.08,
  '2': 1.12,
  '2_basement': 1.2,
};

// Construction method multipliers
const CONSTRUCTION_MULTIPLIER: Record<string, number> = {
  blocks: 1.0,
  concrete: 1.15,
  precast: 1.1,
  steel: 1.08,
};

// Finishing level multipliers
const FINISHING_MULTIPLIER: Record<string, number> = {
  standard: 1.0,
  standard_high: 1.15,
  high: 1.35,
  luxury: 1.7,
};

// Region multipliers
const REGION_MULTIPLIER: Record<string, number> = {
  center: 1.1,
  sharon: 1.08,
  shfela: 1.0,
  north: 0.92,
  south: 0.88,
  jerusalem: 1.15,
};

// Timeline multipliers
const TIMELINE_MULTIPLIER: Record<string, number> = {
  urgent: 1.15,
  normal: 1.0,
  flexible: 0.95,
};

// Add-on costs in NIS
const ADDON_COSTS: Record<string, number> = {
  pool: 150_000,
  elevator: 200_000,
  underground_parking: 180_000,
  large_balcony: 50_000,
  solar: 60_000,
};

// Basement cost (flat)
const BASEMENT_COST = 250_000;

// Phase breakdown percentages
const PHASES: { phase: string; label: string; percentage: number }[] = [
  { phase: 'foundation_structure', label: 'יסודות ושלד', percentage: 35 },
  { phase: 'interior_finishing', label: 'גמר פנים', percentage: 25 },
  { phase: 'electrical_plumbing', label: 'חשמל ואינסטלציה', percentage: 12 },
  { phase: 'roofing', label: 'גג', percentage: 8 },
  { phase: 'tiling', label: 'ריצוף', percentage: 8 },
  { phase: 'windows_doors', label: 'חלונות ודלתות', percentage: 7 },
  { phase: 'exterior', label: 'פיתוח חוץ', percentage: 5 },
];

/**
 * Calculate construction cost estimate from wizard answers.
 * Returns a result with total range and phase breakdown.
 */
export function calculateCost(answers: CalculatorAnswers): CalculatorResult {
  const sqm = SIZE_MAP[answers.house_size] ?? 150;
  const baseCost = sqm * BASE_COST_PER_SQM;

  // Apply multipliers
  const multiplied =
    baseCost *
    (FLOOR_MULTIPLIER[answers.floors] ?? 1.0) *
    (CONSTRUCTION_MULTIPLIER[answers.construction_method] ?? 1.0) *
    (FINISHING_MULTIPLIER[answers.finishing_level] ?? 1.0) *
    (REGION_MULTIPLIER[answers.region] ?? 1.0) *
    (TIMELINE_MULTIPLIER[answers.timeline] ?? 1.0);

  // Add-ons
  let addons = 0;
  if (answers.basement === 'yes') {
    addons += BASEMENT_COST;
  }
  if (answers.special_features && answers.special_features.length > 0) {
    for (const feature of answers.special_features) {
      addons += ADDON_COSTS[feature] ?? 0;
    }
  }

  const total = multiplied + addons;

  // Ranges: +/- 15%
  const total_min = Math.round(total * 0.85);
  const total_max = Math.round(total * 1.15);

  // Phase breakdown
  const breakdown: BreakdownItem[] = PHASES.map((p) => ({
    phase: p.phase,
    label: p.label,
    percentage: p.percentage,
    min: Math.round((total_min * p.percentage) / 100),
    max: Math.round((total_max * p.percentage) / 100),
  }));

  return { total_min, total_max, breakdown };
}

/** Format NIS amount with LTR mark for correct RTL rendering */
export function formatNIS(amount: number): string {
  return `\u200E${amount.toLocaleString('he-IL')} \u20AA`;
}

/** Get the sqm value for a size key */
export function getSqm(sizeKey: string): number {
  return SIZE_MAP[sizeKey] ?? 150;
}
