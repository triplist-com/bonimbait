import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INPUT,
  estimateBudget,
  estimateFromProfile,
  estimateIdFor,
  finishLevelRange,
  largestRemainder,
  moneyRange,
  normalizeInput,
  roundMoney,
  roundPerM2,
} from '@/lib/planner/engine';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { EXTRA_IDS, FINISH_LEVEL_IDS, FLOOR_OPTIONS, type PlannerInput, type PriceBook } from '@/lib/planner/types';
import { MEMBER_REGIONS } from '@/lib/constants/community';

const base: PlannerInput = { sizeM2: 200, floors: 2, regionSlug: 'center', finishLevel: 'standard', extras: [] };

describe('price-book math (the owner\'s 2026 anchor)', () => {
  it('200 m², 2 floors, standard: ₪13,000/m² -> ₪2.6M ±15%, ex-VAT', () => {
    const e = estimateBudget(base);
    expect(e.total).toEqual({ min: 2_210_000, mid: 2_600_000, max: 2_990_000 });
    expect(e.perM2).toEqual({ min: 11_100, mid: 13_000, max: 15_000 });
    expect(e.rangePct).toBe(15);
    expect(e.validAsOf).toBe('2026-07-16');
  });

  it('puts the shell at about ₪800K for 200 m² (podcast ep. 109, 28:34)', () => {
    const frame = estimateBudget(base).stages.find((s) => s.id === 'frame')!;
    expect(frame.mid).toBe(810_000); // 806K rounded to ₪10K
    expect(frame.min).toBe(690_000);
    expect(frame.max).toBe(930_000);
  });

  it('keeps planning + permit around ₪250K (about 10%) for 200 m²', () => {
    const e = estimateBudget(base);
    const planning = e.stages.filter((s) => s.id === 'planning' || s.id === 'permit').reduce((a, s) => a + s.mid, 0);
    expect(planning).toBeGreaterThanOrEqual(250_000);
    expect(planning).toBeLessThanOrEqual(270_000);
  });

  it('applies the floors factor to the shell only (1 floor 1.2, 3 floors 0.93)', () => {
    const two = estimateBudget(base);
    const one = estimateBudget({ ...base, floors: 1 });
    const three = estimateBudget({ ...base, floors: 3 });
    const frame = (e: typeof two) => e.stages.find((s) => s.id === 'frame')!.mid;
    expect(frame(one)).toBe(roundMoney(806_000 * 1.2));
    expect(frame(three)).toBe(roundMoney(806_000 * 0.93));
    // Non-shell stages are untouched.
    for (const id of ['planning', 'permit', 'infrastructure', 'finishing'] as const) {
      expect(one.stages.find((s) => s.id === id)!.mid).toBe(two.stages.find((s) => s.id === id)!.mid);
    }
    expect(one.total.mid).toBe(roundMoney(2_600_000 + 806_000 * 0.2));
  });

  it('applies the region factor to the whole estimate (south +5%)', () => {
    expect(estimateBudget({ ...base, regionSlug: 'south' }).total.mid).toBe(2_730_000);
    expect(estimateBudget({ ...base, regionSlug: 'sharon' }).total.mid).toBe(2_600_000);
  });

  it('scales by finish level', () => {
    const mids = FINISH_LEVEL_IDS.map((f) => estimateBudget({ ...base, finishLevel: f }).total.mid);
    expect(mids).toEqual([2_200_000, 2_600_000, 3_100_000, 3_600_000]);
  });

  it('adds extras to their stage, region-adjusted', () => {
    const e = estimateBudget({ ...base, extras: ['basement', 'pool'] });
    expect(e.total.mid).toBe(2_600_000 + 750_000 + 200_000);
    expect(e.stages.find((s) => s.id === 'frame')!.extras).toEqual(['basement']);
    expect(e.stages.find((s) => s.id === 'finishing')!.extras).toEqual(['pool']);
    expect(e.extras).toEqual([
      { id: 'basement', amount: 750_000 },
      { id: 'pool', amount: 200_000 },
    ]);
    const south = estimateBudget({ ...base, regionSlug: 'south', extras: ['basement'] });
    expect(south.extras[0].amount).toBe(roundMoney(750_000 * 1.05));
  });

  it('ignores disabled extras', () => {
    const book: PriceBook = { ...DEFAULT_PRICE_BOOK, extras: { ...DEFAULT_PRICE_BOOK.extras, pool: { ...DEFAULT_PRICE_BOOK.extras.pool, enabled: false } } };
    expect(estimateBudget({ ...base, extras: ['pool'] }, book).total.mid).toBe(2_600_000);
  });

  it('shows VAT, moving-in and contingency outside the total', () => {
    const e = estimateBudget(base);
    expect(e.totalWithVat).toEqual({ min: 2_610_000, mid: 3_070_000, max: 3_530_000 });
    expect(e.movingIn).toEqual({ min: 100_000, mid: 200_000, max: 300_000 });
    expect(e.contingency.withBudget).toEqual({ min: 130_000, mid: 160_000, max: 180_000 });
    expect(e.contingency.withoutBudget).toEqual({ min: 390_000, mid: 460_000, max: 520_000 });
  });

  it('sums the timeline of the included stages (planning to keys)', () => {
    expect(estimateBudget(base).totalMonths).toEqual([21, 30]);
  });

  it('gives the ₪/m² range of each finish level', () => {
    expect(finishLevelRange(DEFAULT_PRICE_BOOK, 'standard')).toEqual({ min: 11_100, mid: 13_000, max: 15_000 });
  });
});

describe('rounding and ranges', () => {
  it('rounds to ₪1K / ₪5K / ₪10K steps by size', () => {
    expect(roundMoney(12_345)).toBe(12_000);
    expect(roundMoney(67_400)).toBe(65_000);
    expect(roundMoney(685_100)).toBe(690_000);
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundPerM2(11_050)).toBe(11_100);
  });

  it('every range is ordered and every stage is within half a step of the exact value', () => {
    for (const sizeM2 of [60, 137, 200, 333, 600]) {
      for (const floors of FLOOR_OPTIONS) {
        for (const finishLevel of FINISH_LEVEL_IDS) {
          for (const regionSlug of ['center', 'south']) {
            const e = estimateBudget({ sizeM2, floors, finishLevel, regionSlug, extras: [...EXTRA_IDS] });
            for (const r of [e.total, e.totalWithVat, e.perM2, e.movingIn, ...e.stages]) {
              expect(r.min).toBeLessThanOrEqual(r.mid);
              expect(r.mid).toBeLessThanOrEqual(r.max);
            }
            // Stage mids add up to the total within the rounding of 7 stages and the total.
            const sum = e.stages.reduce((a, s) => a + s.mid, 0);
            expect(Math.abs(sum - e.total.mid)).toBeLessThanOrEqual(8 * 5_000);
            expect(e.total.min).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('the total range is exactly ±rangePct around the mid before rounding', () => {
    const r = moneyRange(1_000_000, 15);
    expect(r).toEqual({ min: 850_000, mid: 1_000_000, max: 1_150_000 });
  });
});

describe('the stage split', () => {
  it('covers the owner\'s 7 stages, in order, with integer shares summing to 100', () => {
    const e = estimateBudget(base);
    expect(e.stages.map((s) => s.id)).toEqual(['purchase', 'planning', 'permit', 'frame', 'infrastructure', 'finishing', 'moving-in']);
    expect(e.stages.map((s) => s.sharePct)).toEqual([0, 6, 4, 31, 15, 44, 0]);
    for (const input of [{ ...base, floors: 1 as const }, { ...base, extras: ['basement' as const, 'vrf' as const] }]) {
      expect(estimateBudget(input).stages.reduce((a, s) => a + s.sharePct, 0)).toBe(100);
    }
  });

  it('marks purchase and moving-in as outside planning + build', () => {
    const e = estimateBudget(base);
    expect(e.stages.filter((s) => !s.included).map((s) => s.id)).toEqual(['purchase', 'moving-in']);
    expect(e.stages[0]).toMatchObject({ min: 0, mid: 0, max: 0, sharePct: 0 });
  });

  it('the seeded split sums to 100', () => {
    expect(Object.values(DEFAULT_PRICE_BOOK.stageSplitPct).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('largest remainder keeps zeros and sums exactly', () => {
    expect(largestRemainder([1, 1, 1])).toEqual([34, 33, 33]);
    expect(largestRemainder([0, 2, 0, 1])).toEqual([0, 67, 0, 33]);
    expect(largestRemainder([0, 0])).toEqual([0, 0]);
  });
});

describe('input normalization', () => {
  it('fills defaults and drops unknown values', () => {
    expect(normalizeInput({})).toEqual(DEFAULT_INPUT);
    expect(
      normalizeInput({ sizeM2: 99999, floors: 7 as never, regionSlug: 'mars', finishLevel: 'gold' as never, extras: ['pool', 'pool', 'jacuzzi' as never, 'basement'] }),
    ).toEqual({ sizeM2: 2000, floors: 2, regionSlug: 'center', finishLevel: 'standard', extras: ['basement', 'pool'] });
    expect(normalizeInput({ sizeM2: 12 }).sizeM2).toBe(40);
  });

  it('accepts every member region', () => {
    for (const r of MEMBER_REGIONS) expect(normalizeInput({ regionSlug: r.slug }).regionSlug).toBe(r.slug);
    expect(normalizeInput({ regionSlug: 'nationwide' }).regionSlug).toBe('center');
  });

  it('estimate ids are stable per answers and price book date', () => {
    const id = estimateBudget(base).estimateId;
    expect(id).toMatch(/^EST-[0-9A-Z]{7}$/);
    expect(estimateBudget({ ...base }).estimateId).toBe(id);
    expect(estimateBudget({ ...base, sizeM2: 201 }).estimateId).not.toBe(id);
    expect(estimateIdFor(normalizeInput(base), '2027-01-01')).not.toBe(id);
  });

  it('estimateFromProfile defaults the unknown answers', () => {
    expect(estimateFromProfile({ sizeM2: 220, regionSlug: 'sharon' }).input).toEqual({
      sizeM2: 220,
      floors: 2,
      regionSlug: 'sharon',
      finishLevel: 'standard',
      extras: [],
    });
  });
});
