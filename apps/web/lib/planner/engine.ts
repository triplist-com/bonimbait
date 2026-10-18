/**
 * The budget planner's math: a pure function of the five answers and the price
 * book. Client-safe (the result screen recomputes instantly, no API call).
 *
 *   core      = m² × ₪/m²(finish level) × region factor          (planning + build, ex-VAT)
 *   stage     = core × stage share (the shell × the floors factor) + extras priced in that stage
 *   total     = Σ stages; shown as total ±rangePct (15%): a range, never one number
 *
 * Purchase (the plot) and moving-in sit outside planning + build, as in the
 * owner's "4 types of costs": moving-in is shown next to the total, not in it.
 */
import { BUILD_STAGES } from '@/lib/stages';
import { DEFAULT_PRICE_BOOK } from './defaults';
import { SIZE_BOUNDS, SIZE_LIMITS } from './content';
import {
  EXTRA_IDS,
  FINISH_LEVEL_IDS,
  FLOOR_OPTIONS,
  type ExtraId,
  type Floors,
  type MoneyRange,
  type MonthsRange,
  type PlannerEstimate,
  type PlannerInput,
  type PriceBook,
  type StageEstimate,
  type StageId,
} from './types';
import { MEMBER_REGIONS } from '@/lib/constants/community';

export const DEFAULT_REGION = 'center';

export const DEFAULT_INPUT: PlannerInput = {
  sizeM2: SIZE_LIMITS.default,
  floors: 2,
  regionSlug: DEFAULT_REGION,
  finishLevel: 'standard',
  extras: [],
};

export function isFinishLevel(value: unknown): value is PlannerInput['finishLevel'] {
  return typeof value === 'string' && (FINISH_LEVEL_IDS as readonly string[]).includes(value);
}

export function isExtraId(value: unknown): value is ExtraId {
  return typeof value === 'string' && (EXTRA_IDS as readonly string[]).includes(value);
}

export function isFloors(value: unknown): value is Floors {
  return typeof value === 'number' && (FLOOR_OPTIONS as readonly number[]).includes(value);
}

export function isPlannerRegion(value: unknown): value is string {
  return typeof value === 'string' && MEMBER_REGIONS.some((r) => r.slug === value);
}

/** Whole m², clamped to what the planner accepts. */
export function clampSize(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value.replace(/[,\s]/g, '')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(SIZE_BOUNDS.max, Math.max(SIZE_BOUNDS.min, Math.round(n)));
}

/** Fill gaps with defaults and drop anything the price book doesn't know. */
export function normalizeInput(raw: Partial<PlannerInput> = {}, book: PriceBook = DEFAULT_PRICE_BOOK): PlannerInput {
  const extras = Array.isArray(raw.extras) ? raw.extras : [];
  return {
    sizeM2: clampSize(raw.sizeM2) ?? DEFAULT_INPUT.sizeM2,
    floors: isFloors(raw.floors) ? raw.floors : DEFAULT_INPUT.floors,
    regionSlug: isPlannerRegion(raw.regionSlug) ? raw.regionSlug : DEFAULT_INPUT.regionSlug,
    finishLevel: isFinishLevel(raw.finishLevel) ? raw.finishLevel : DEFAULT_INPUT.finishLevel,
    // Known, enabled, unique, in a stable order.
    extras: EXTRA_IDS.filter((id) => extras.includes(id) && book.extras[id]?.enabled !== false),
  };
}

/** Nearest multiple of `step`, immune to float noise (13000 × 1.15 = 14949.999…). */
function roundTo(n: number, step: number): number {
  return Math.round(Math.round((n / step) * 1e6) / 1e6) * step;
}

/**
 * Round money for display: whole thousands below ₪20K, ₪5K below ₪100K, ₪10K
 * above. Estimates are ranges; more digits would be false precision.
 */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const abs = Math.abs(n);
  return roundTo(n, abs < 20_000 ? 1_000 : abs < 100_000 ? 5_000 : 10_000);
}

/** ₪/m² to the nearest ₪100. */
export function roundPerM2(n: number): number {
  return Number.isFinite(n) ? roundTo(n, 100) : 0;
}

/** mid ±pct, rounded. */
export function moneyRange(mid: number, rangePct: number, round: (n: number) => number = roundMoney): MoneyRange {
  const r = rangePct / 100;
  return { min: round(mid * (1 - r)), mid: round(mid), max: round(mid * (1 + r)) };
}

/**
 * Integer shares (largest remainder): the parts sum to exactly `total` whenever
 * any value is positive; zeros stay zero.
 */
export function largestRemainder(values: number[], total = 100): number[] {
  const sum = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0) return values.map(() => 0);
  const exact = values.map((v) => (Math.max(0, v) / sum) * total);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .filter(({ i }) => values[i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/** FNV-1a, base 36: a short, stable id for the same answers and price book date. */
export function estimateIdFor(input: PlannerInput, validAsOf: string): string {
  const key = [validAsOf, input.sizeM2, input.floors, input.regionSlug, input.finishLevel, input.extras.join(',')].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `EST-${h.toString(36).toUpperCase().padStart(7, '0').slice(-7)}`;
}

function sumMonths(ranges: MonthsRange[]): MonthsRange {
  return ranges.reduce<MonthsRange>((acc, [a, b]) => [acc[0] + a, acc[1] + b], [0, 0]);
}

/** The estimate for one set of answers. */
export function estimateBudget(raw: Partial<PlannerInput>, book: PriceBook = DEFAULT_PRICE_BOOK): PlannerEstimate {
  const input = normalizeInput(raw, book);
  const regionFactor = book.regionFactors[input.regionSlug] ?? 1;
  const perM2 = book.finishLevels[input.finishLevel].perM2Agorot / 100;
  const core = input.sizeM2 * perM2 * regionFactor;
  const floorFactor = book.floorShellFactors[String(input.floors) as '1' | '2' | '3'] ?? 1;

  const mids = new Map<StageId, number>();
  for (const s of BUILD_STAGES) {
    const share = (book.stageSplitPct[s.id] ?? 0) / 100;
    mids.set(s.id, core * share * (s.id === 'frame' ? floorFactor : 1));
  }

  const extras = input.extras.map((id) => {
    const def = book.extras[id];
    return { id, stage: def.stage, amount: (def.amountAgorot / 100) * regionFactor };
  });
  for (const e of extras) mids.set(e.stage, (mids.get(e.stage) ?? 0) + e.amount);

  const included = (id: StageId) => (book.stageSplitPct[id] ?? 0) > 0 || extras.some((e) => e.stage === id);
  const stageValues = BUILD_STAGES.map((s) => (included(s.id) ? mids.get(s.id) ?? 0 : 0));
  const shares = largestRemainder(stageValues);
  const totalMid = stageValues.reduce((a, b) => a + b, 0);

  const stages: StageEstimate[] = BUILD_STAGES.map((s, i) => ({
    id: s.id,
    included: included(s.id),
    ...moneyRange(stageValues[i], book.rangePct),
    sharePct: shares[i],
    extras: extras.filter((e) => e.stage === s.id).map((e) => e.id),
    months: book.timelineMonths[s.id] ?? [0, 0],
  }));

  const vat = 1 + book.vatRatePct / 100;
  const r = book.rangePct / 100;
  const size = input.sizeM2;
  const moveMin = (size * book.movingInPerM2Agorot.min) / 100;
  const moveMax = (size * book.movingInPerM2Agorot.max) / 100;
  const pct = (range: [number, number]): MoneyRange => ({
    min: roundMoney((totalMid * range[0]) / 100),
    mid: roundMoney((totalMid * (range[0] + range[1])) / 200),
    max: roundMoney((totalMid * range[1]) / 100),
  });

  return {
    input,
    validAsOf: book.validAsOf,
    rangePct: book.rangePct,
    vatRatePct: book.vatRatePct,
    total: moneyRange(totalMid, book.rangePct),
    totalWithVat: moneyRange(totalMid * vat, book.rangePct),
    perM2: {
      min: roundPerM2((totalMid * (1 - r)) / size),
      mid: roundPerM2(totalMid / size),
      max: roundPerM2((totalMid * (1 + r)) / size),
    },
    stages,
    extras: extras.map((e) => ({ id: e.id, amount: roundMoney(e.amount) })),
    movingIn: { min: roundMoney(moveMin), mid: roundMoney((moveMin + moveMax) / 2), max: roundMoney(moveMax) },
    contingency: { withBudget: pct(book.contingencyPct.withBudget), withoutBudget: pct(book.contingencyPct.withoutBudget) },
    totalMonths: sumMonths(stages.filter((s) => s.included).map((s) => s.months)),
    estimateId: estimateIdFor(input, book.validAsOf),
  };
}

/**
 * For callers that only know a project profile (the hub's budget tab): the
 * missing answers default to 2 floors, the "סטנדרטי-טוב" finish and no extras.
 */
export function estimateFromProfile(
  profile: { sizeM2?: number; regionSlug?: string; floors?: Floors; finishLevel?: PlannerInput['finishLevel']; extras?: ExtraId[] },
  book: PriceBook = DEFAULT_PRICE_BOOK,
): PlannerEstimate {
  return estimateBudget(profile, book);
}

/** ₪/m² range (rounded) a finish level implies, before region, floors and extras. */
export function finishLevelRange(book: PriceBook, id: PlannerInput['finishLevel']): MoneyRange {
  return moneyRange(book.finishLevels[id].perM2Agorot / 100, book.rangePct, roundPerM2);
}
