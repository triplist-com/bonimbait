import { describe, expect, it } from 'vitest';
import { calculateCost } from '@/lib/calculator';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import {
  CALCULATOR_REGION,
  calculatorSizeKey,
  estimateFromCalculator,
  initialEstimate,
  parsePlannerEstimate,
} from '@/lib/hub/estimate';

describe('calculator adapter', () => {
  it('maps every member region to a calculator region', () => {
    for (const r of MEMBER_REGIONS) {
      expect(['north', 'sharon', 'center', 'shfela', 'jerusalem', 'south']).toContain(CALCULATOR_REGION[r.slug]);
    }
  });

  it('picks the calculator size bucket', () => {
    expect(calculatorSizeKey(90)).toBe('up_to_100');
    expect(calculatorSizeKey(150)).toBe('100_150');
    expect(calculatorSizeKey(220)).toBe('200_250');
    expect(calculatorSizeKey(400)).toBe('250_plus');
  });

  it('calls the calculator and scales to the exact size', () => {
    const estimate = estimateFromCalculator({ sizeM2: 220, regionSlug: 'sharon' })!;
    expect(estimate.basis).toBe('calculator');
    expect(estimate.totalMin).toBeGreaterThan(0);
    expect(estimate.totalMax).toBeGreaterThan(estimate.totalMin);
    expect(estimate.inputs).toMatchObject({ house_size: '200_250', region: 'sharon', size_m2: 220 });

    // Same answers straight through the calculator, scaled 220 / 225 m².
    const raw = calculateCost({
      house_size: '200_250',
      floors: '2',
      construction_method: 'blocks',
      finishing_level: 'standard_high',
      region: 'sharon',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    });
    expect(Math.abs(estimate.totalMax - (raw.total_max * 220) / 225)).toBeLessThanOrEqual(10_000);

    const bigger = estimateFromCalculator({ sizeM2: 300, regionSlug: 'sharon' })!;
    expect(bigger.totalMin).toBeGreaterThan(estimate.totalMin);
  });

  it('says nothing without a size', () => {
    expect(estimateFromCalculator({ regionSlug: 'sharon' })).toBeNull();
  });
});

describe('budget planner snapshot (bb.planner.last)', () => {
  const planner = { totalMin: 2_550_000, totalMax: 3_050_000, at: '2026-10-10T08:00:00.000Z', inputs: { size: 220 } };

  it('accepts growth\'s plannerEstimate shape', () => {
    expect(parsePlannerEstimate(planner)).toEqual(planner);
  });

  it('ignores anything malformed', () => {
    expect(parsePlannerEstimate(null)).toBeNull();
    expect(parsePlannerEstimate({ ...planner, totalMin: 'x' })).toBeNull();
    expect(parsePlannerEstimate({ ...planner, totalMax: 1 })).toBeNull();
    expect(parsePlannerEstimate({ ...planner, at: 'not a date' })).toBeNull();
    expect(parsePlannerEstimate({ ...planner, inputs: [1, 2] })).toEqual({ ...planner, inputs: {} });
  });

  it('prefers the planner over the calculator', () => {
    expect(initialEstimate({ sizeM2: 220, regionSlug: 'sharon' }, parsePlannerEstimate(planner))).toMatchObject({
      basis: 'planner',
      totalMin: 2_550_000,
      at: planner.at,
    });
    expect(initialEstimate({ sizeM2: 220, regionSlug: 'sharon' }, null)?.basis).toBe('calculator');
  });
});
