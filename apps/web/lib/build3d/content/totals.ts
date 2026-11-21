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
  icf: {
    steps: 82,
    days: 326,
    costILS: 2_301_100,
    concreteM3: 216,
    rebarT: 10.8,
    blocks: 2211,
    extra: [
      { labelHe: 'תבניות ICF מקלקר', qty: 654, unitHe: 'יח׳' },
      { labelHe: 'קלקר בקירות ובמעקות', qty: 39, unitHe: 'מ״ק' },
      { labelHe: 'קירות ICF', qty: 234, unitHe: 'מ״ר' },
    ],
  },
  steel: {
    steps: 86,
    days: 332,
    costILS: 2_399_000,
    concreteM3: 142,
    rebarT: 8.33,
    blocks: 0,
    extra: [
      { labelHe: 'פלדה קלה מגולוונת', qty: 5.0, unitHe: 'טון' },
      { labelHe: 'לוחות צמנט (קירות וגג)', qty: 402, unitHe: 'מ״ר' },
      { labelHe: 'לוחות גבס', qty: 660, unitHe: 'מ״ר' },
      { labelHe: 'צמר סלעים', qty: 272, unitHe: 'מ״ר' },
    ],
  },
  timber: {
    steps: 86,
    days: 331,
    costILS: 2_401_000,
    concreteM3: 142,
    rebarT: 8.33,
    blocks: 0,
    extra: [
      { labelHe: 'עץ מסגרת וקורות', qty: 19.5, unitHe: 'מ״ק' },
      { labelHe: 'לוחות OSB (קירות וגג)', qty: 347, unitHe: 'מ״ר' },
      { labelHe: 'לוחות גבס', qty: 660, unitHe: 'מ״ר' },
      { labelHe: 'צמר מינרלי', qty: 242, unitHe: 'מ״ר' },
    ],
  },
  precast: {
    steps: 75,
    days: 292,
    costILS: 2_391_300,
    concreteM3: 206,
    rebarT: 10.7,
    blocks: 2211,
    extra: [
      { labelHe: 'פאנלי קיר טרומיים', qty: 29, unitHe: 'יח׳' },
      { labelHe: 'לוחות תקרה חלולים', qty: 227, unitHe: 'מ״ר' },
      { labelHe: 'ימי מנוף', qty: 13, unitHe: 'ימים' },
    ],
  },
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
