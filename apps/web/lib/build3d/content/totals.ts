/**
 * Whole-house totals shown on the landing's analysis animation and on the viewer's finale screen.
 *
 * These are hardcoded on purpose (the landing must not import the step engine) and were computed
 * from the built timeline, i.e. the sum of the per-step bills of materials:
 *   - concrete: every "בטון ב-30 …" pour line in m³ (piles, grade beams, retaining walls, slabs, columns,
 *     mamad, lintels). Excludes the roof-slope screed and the p6-strip-all "125 m³" recap line.
 *   - rebar: every line measured in tons, plus the lintel rebar (110 kg).
 *   - blocks: every block line in units (exterior 20 cm, partitions 10 cm, parapets).
 *
 * `tests/build3d/totals.test.ts` recomputes them with `sumBuildTotals` and fails when the
 * steps drift more than a few percent, so update the constants there if the model changes.
 */
import type { Timeline } from '../engine/timeline';
import type { MethodId } from '../methods';

export interface BuildTotals {
  steps: number;
  days: number;
  costILS: number;
  concreteM3: number;
  rebarT: number;
  blocks: number;
  /** Method signature quantities for the picker / summary (e.g. light steel 14 t, ICF blocks 2,100). */
  extra?: Array<{ labelHe: string; qty: number; unitHe: string }>;
}

export const BUILD_TOTALS: BuildTotals = {
  steps: 86,
  days: 362,
  costILS: 2_251_900,
  concreteM3: 184,
  rebarT: 10.4,
  blocks: 5060,
};

/**
 * Totals per construction method (docs/build3d/METHODS.md). Each method author replaces their
 * placeholder (a copy of concrete) with the numbers `sumBuildTotals(getTimeline(house, method))`
 * prints; tests/build3d/totals.test.ts checks every method against its built timeline.
 */
export const METHOD_TOTALS: Record<MethodId, BuildTotals> = {
  concrete: BUILD_TOTALS,
  icf: { ...BUILD_TOTALS },
  steel: { ...BUILD_TOTALS },
  timber: { ...BUILD_TOTALS },
  precast: { ...BUILD_TOTALS },
};

/** Recompute the totals from a built timeline (used by the test; the UI uses BUILD_TOTALS). */
export function sumBuildTotals(t: Pick<Timeline, 'steps' | 'totals'>): BuildTotals {
  let concreteM3 = 0;
  let rebarT = 0;
  let blocks = 0;
  for (const s of t.steps) {
    for (const m of s.materials) {
      if (m.unitHe === 'מ״ק' && m.nameHe.startsWith('בטון ב-30')) concreteM3 += m.qty;
      if (m.unitHe === 'טון') rebarT += m.qty;
      if (m.unitHe === 'ק״ג' && m.nameHe === 'ברזל זיון') rebarT += m.qty / 1000;
      if (m.unitHe === 'יח׳' && m.nameHe.includes('בלוק')) blocks += m.qty;
    }
  }
  return { steps: t.steps.length, days: t.totals.days, costILS: t.totals.costILS, concreteM3, rebarT, blocks };
}
