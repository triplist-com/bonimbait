import { describe, expect, it } from 'vitest';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { estimateFromCalculator, initialEstimate, parsePlannerEstimate } from '@/lib/hub/estimate';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { estimateFromProfile } from '@/lib/planner/engine';
import type { PriceBook } from '@/lib/planner/types';

// Integration (growth -> hub): the hub's estimate is growth's estimateFromProfile()
// on the owner's current price book, not the legacy calculator buckets.
describe('the site estimate (estimateFromProfile on the price book)', () => {
  it('is exactly the planner engine on the project profile: exact m², the member region', () => {
    const estimate = estimateFromCalculator({ sizeM2: 220, regionSlug: 'sharon' })!;
    const engine = estimateFromProfile({ sizeM2: 220, regionSlug: 'sharon' });
    expect(estimate).toMatchObject({ basis: 'calculator', totalMin: engine.total.min, totalMax: engine.total.max });
    expect(estimate.inputs).toMatchObject({ sizeM2: 220, regionSlug: 'sharon', floors: 2, finishLevel: 'standard', size_m2: 220, vat: 'excluded' });
    expect(estimate.inputs.priceBookAsOf).toBe(DEFAULT_PRICE_BOOK.validAsOf);
    expect(estimate.totalMax).toBeGreaterThan(estimate.totalMin);
    // Every member region is priced by its own factor (no coarse calculator areas).
    for (const r of MEMBER_REGIONS) {
      expect(estimateFromCalculator({ sizeM2: 200, regionSlug: r.slug })!.inputs.regionSlug).toBe(r.slug);
    }
    expect(estimateFromCalculator({ sizeM2: 300, regionSlug: 'sharon' })!.totalMin).toBeGreaterThan(estimate.totalMin);
  });

  it('follows the price book it is given (the admin price book)', () => {
    const pricier: PriceBook = {
      ...DEFAULT_PRICE_BOOK,
      finishLevels: {
        ...DEFAULT_PRICE_BOOK.finishLevels,
        standard: { ...DEFAULT_PRICE_BOOK.finishLevels.standard, perM2Agorot: DEFAULT_PRICE_BOOK.finishLevels.standard.perM2Agorot * 2 },
      },
    };
    const base = estimateFromCalculator({ sizeM2: 200, regionSlug: 'center' })!;
    const doubled = estimateFromCalculator({ sizeM2: 200, regionSlug: 'center' }, pricier)!;
    expect(doubled.totalMin).toBeGreaterThan(base.totalMin * 1.8);
    expect(initialEstimate({ sizeM2: 200, regionSlug: 'center' }, null, pricier)?.totalMin).toBe(doubled.totalMin);
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
