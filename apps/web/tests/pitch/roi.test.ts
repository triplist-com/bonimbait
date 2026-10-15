import { describe, expect, it } from 'vitest';
import {
  BASE_CASE,
  PUBLIC_PLAN_PRICES,
  ROI_FIELDS,
  computeRoi,
  formatCount,
  formatFieldValue,
  formatNisRounded,
  normaliseMix,
  type RoiInputs,
} from '@/lib/pitch/roi';

const prices = PUBLIC_PLAN_PRICES;
const close = (actual: number, expected: number, tolerance = 0.01) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThan(tolerance);

describe('computeRoi: the strategy base case', () => {
  const r = computeRoi(BASE_CASE, prices);

  it('identifies, qualifies and books like the base case (2,280 → 456 → 91 a year)', () => {
    expect(r.identifiedPerYear).toBeCloseTo(2_280, 6);
    expect(r.qualifiedPerYear).toBeCloseTo(456, 6);
    expect(r.consultsPerYear).toBeCloseTo(91.2, 6);
    expect(r.consultsPerWeek).toBeCloseTo(91.2 / 52, 6);
  });

  it('sells about 23 budget plans, 4 Plus and 1.4 turnkey', () => {
    close(r.plans.budget, 22.8);
    expect(r.plans.plus).toBeCloseTo(3.6, 1);
    expect(r.plans.turnkey).toBeCloseTo(1.4, 1);
    expect(r.plans.total).toBeCloseTo(91.2 * 0.305, 6);
  });

  it('lands within 1% of the strategy plan revenue (₪456K) and adds ₪72K from partners', () => {
    close(r.planRevenue.total, 456_000);
    expect(r.partnerRevenue).toBe(72_000);
    expect(r.totalRevenue).toBeCloseTo(r.planRevenue.total + 72_000, 6);
  });

  it('prices turnkey at the average of the two size tiers', () => {
    expect(prices.turnkey).toBe(141_000);
    expect(r.planRevenue.turnkey).toBeCloseTo(r.plans.turnkey * 141_000, 6);
  });
});

describe('computeRoi: edge cases', () => {
  it('is all zeros with no traffic, no owned channels and no partners', () => {
    const r = computeRoi({ ...BASE_CASE, monthlySessions: 0, ownedChannelBuilders: 0, partnerMrrUplift: 0 }, prices);
    expect(r.consultsPerYear).toBe(0);
    expect(r.plans.total).toBe(0);
    expect(r.totalRevenue).toBe(0);
  });

  it('clamps negative, non-finite and over-100% inputs', () => {
    const r = computeRoi(
      { ...BASE_CASE, monthlySessions: -5, identifiedPct: Number.NaN, qualifiedPct: 250, partnerMrrUplift: -100 },
      prices,
    );
    expect(r.identifiedPerYear).toBe(12 * BASE_CASE.ownedChannelBuilders);
    expect(r.qualifiedPerYear).toBe(r.identifiedPerYear);
    expect(r.partnerRevenue).toBe(0);
  });

  it('grows with every funnel input', () => {
    const base = computeRoi(BASE_CASE, prices).totalRevenue;
    const bumps: Array<Partial<RoiInputs>> = [
      { monthlySessions: 30_000 },
      { identifiedPct: 1.2 },
      { ownedChannelBuilders: 60 },
      { qualifiedPct: 30 },
      { bookingPct: 30 },
      { conversionPct: 40 },
      { mixTurnkeyPct: 10 },
      { partnerMrrUplift: 10_000 },
    ];
    for (const bump of bumps) expect(computeRoi({ ...BASE_CASE, ...bump }, prices).totalRevenue).toBeGreaterThan(base);
  });
});

describe('normaliseMix', () => {
  it('gives the budget plan the rest', () => {
    const m = normaliseMix(13, 5);
    expect(m.budget).toBeCloseTo(0.82, 10);
    expect(m.plus).toBeCloseTo(0.13, 10);
    expect(m.turnkey).toBeCloseTo(0.05, 10);
  });

  it('scales Plus and turnkey down when they exceed 100% together', () => {
    const m = normaliseMix(80, 40);
    expect(m.budget).toBe(0);
    expect(m.plus + m.turnkey).toBeCloseTo(1, 10);
    expect(m.plus / m.turnkey).toBeCloseTo(2, 10);
  });
});

describe('ROI_FIELDS', () => {
  it('covers every input once', () => {
    expect(ROI_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(BASE_CASE).sort());
  });

  it('puts every default inside its range and on a step', () => {
    for (const f of ROI_FIELDS) {
      const value = BASE_CASE[f.key];
      expect(value, f.key).toBeGreaterThanOrEqual(f.min);
      expect(value, f.key).toBeLessThanOrEqual(f.max);
      const steps = (value - f.min) / f.step;
      expect(Math.abs(steps - Math.round(steps)), f.key).toBeLessThan(1e-9);
    }
  });
});

describe('formatting', () => {
  it('rounds shekels to thousands and keeps numbers readable', () => {
    expect(formatNisRounded(458_347)).toContain('458,000');
    expect(formatNisRounded(458_347)).toContain('₪');
    expect(formatCount(1.39)).toBe('1.4');
    expect(formatCount(91.2)).toBe('91');
    expect(formatCount(2_280)).toBe('2,280');
    expect(formatFieldValue({ unit: 'pct' }, 0.8)).toBe('0.8%');
    expect(formatFieldValue({ unit: 'count' }, 20_000)).toBe('20,000');
  });
});
