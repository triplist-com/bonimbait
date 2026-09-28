import { describe, expect, it } from 'vitest';
import { computeOrderTotals, formatAgorot, parseVatRate, vatOn, withVat } from '@/lib/commerce/pricing';

describe('parseVatRate', () => {
  it('defaults to 18%', () => {
    expect(parseVatRate(undefined)).toBe(0.18);
    expect(parseVatRate('')).toBe(0.18);
  });
  it('accepts a valid override and rejects nonsense', () => {
    expect(parseVatRate('0.17')).toBe(0.17);
    expect(parseVatRate('abc')).toBe(0.18);
    expect(parseVatRate('-0.1')).toBe(0.18);
    expect(parseVatRate('18')).toBe(0.18); // a percentage, not a rate
  });
});

describe('vatOn / withVat', () => {
  it('computes VAT on the live service-plan prices (ex-VAT)', () => {
    expect(vatOn(690_000, 0.18)).toBe(124_200); // ₪6,900 -> ₪1,242 VAT
    expect(withVat(690_000, 0.18)).toBe(814_200); // ₪8,142
    expect(withVat(2_900_000, 0.18)).toBe(3_422_000); // ₪29,000 -> ₪34,220
    expect(withVat(13_300_000, 0.18)).toBe(15_694_000); // ₪133,000 -> ₪156,940
    expect(withVat(14_900_000, 0.18)).toBe(17_582_000); // ₪149,000 -> ₪175,820
  });
  it('rounds half up to whole agorot without float drift', () => {
    expect(vatOn(1, 0.18)).toBe(0); // 0.18
    expect(vatOn(3, 0.18)).toBe(1); // 0.54
    expect(vatOn(25, 0.18)).toBe(5); // 4.5 -> 5
    expect(vatOn(12_345, 0.17)).toBe(2_099); // 2098.65
  });
  it('rejects non-integer money', () => {
    expect(() => vatOn(10.5, 0.18)).toThrow(RangeError);
    expect(() => vatOn(-1, 0.18)).toThrow(RangeError);
  });
});

describe('computeOrderTotals', () => {
  it('adds VAT only to ex-VAT lines', () => {
    const totals = computeOrderTotals(
      [
        { quantity: 2, unitPriceAgorot: 360_000, vatIncluded: true }, // RINNAI heater, VAT-inclusive
        { quantity: 1, unitPriceAgorot: 690_000, vatIncluded: false }, // בונים תקציב, ex-VAT
      ],
      0.18,
    );
    expect(totals).toEqual({ subtotalAgorot: 1_410_000, vatAgorot: 124_200, totalAgorot: 1_534_200 });
  });

  it('has zero VAT for a products-only cart', () => {
    expect(computeOrderTotals([{ quantity: 3, unitPriceAgorot: 360_000, vatIncluded: true }], 0.18)).toEqual({
      subtotalAgorot: 1_080_000,
      vatAgorot: 0,
      totalAgorot: 1_080_000,
    });
  });

  it('computes VAT once on the taxable base, not per line', () => {
    // Per-line rounding would give 1 + 1 = 2 agorot; on the base (6 agorot) it is 1.08 -> 1.
    const totals = computeOrderTotals(
      [
        { quantity: 1, unitPriceAgorot: 3, vatIncluded: false },
        { quantity: 1, unitPriceAgorot: 3, vatIncluded: false },
      ],
      0.18,
    );
    expect(totals.vatAgorot).toBe(1);
    expect(totals.totalAgorot).toBe(7);
  });

  it('handles an empty cart', () => {
    expect(computeOrderTotals([], 0.18)).toEqual({ subtotalAgorot: 0, vatAgorot: 0, totalAgorot: 0 });
  });

  it('rejects invalid quantities and prices', () => {
    expect(() => computeOrderTotals([{ quantity: 0, unitPriceAgorot: 100, vatIncluded: true }], 0.18)).toThrow();
    expect(() => computeOrderTotals([{ quantity: 1.5, unitPriceAgorot: 100, vatIncluded: true }], 0.18)).toThrow();
    expect(() => computeOrderTotals([{ quantity: 1, unitPriceAgorot: -5, vatIncluded: true }], 0.18)).toThrow();
  });
});

describe('formatAgorot', () => {
  it('formats whole and fractional shekels', () => {
    expect(formatAgorot(690_000)).toMatch(/6,900/);
    expect(formatAgorot(690_000)).toContain('₪');
    expect(formatAgorot(12_345)).toMatch(/123\.45/);
  });
});
