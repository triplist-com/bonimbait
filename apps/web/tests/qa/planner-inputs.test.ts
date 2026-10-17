/**
 * The planner's inputs (bb.planner.last, sent by the browser) are stored on a
 * hub budget version; lib/hub/estimate.ts cuts them down to flat, bounded
 * values before they reach the database (which caps them at 4 KB).
 */
import { describe, expect, it } from 'vitest';
import { parsePlannerEstimate, sanitizePlannerInputs } from '@/lib/hub/estimate';

const REAL_INPUTS = {
  sizeM2: 220,
  floors: 2,
  regionSlug: 'sharon',
  finishLevel: 'standard',
  extras: ['basement', 'pool'],
  perM2Min: 11_900,
  perM2Max: 13_600,
  vat: 'excluded',
  priceBookAsOf: '2026-10-01',
  estimateId: 'pe-1a2b3c',
};

describe('sanitizePlannerInputs', () => {
  it('keeps the planner\'s real inputs as they are', () => {
    expect(sanitizePlannerInputs(REAL_INPUTS)).toEqual(REAL_INPUTS);
  });

  it('drops nested objects, odd keys, long lists and non-finite numbers', () => {
    const out = sanitizePlannerInputs({
      sizeM2: 200,
      nested: { deep: { deeper: 'x' } },
      'bad key': 'x',
      __proto__x: 1,
      list: Array.from({ length: 11 }, (_, i) => `x${i}`),
      mixed: ['a', 1],
      huge: Number.POSITIVE_INFINITY,
      nan: Number.NaN,
      ok: true,
    });
    expect(out).toEqual({ sizeM2: 200, ok: true });
  });

  it('trims strings and list items', () => {
    const out = sanitizePlannerInputs({ note: 'א'.repeat(500), extras: ['ב'.repeat(100)] });
    expect((out.note as string).length).toBe(100);
    expect((out.extras as string[])[0].length).toBe(40);
  });

  it('stays within its 2 KB budget however much is sent', () => {
    const flood = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, 'ש'.repeat(100)]));
    const out = sanitizePlannerInputs(flood);
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThanOrEqual(2048);
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });

  it('returns {} for anything that isn\'t a plain object', () => {
    for (const v of [null, undefined, 'x', 3, ['a'], true]) expect(sanitizePlannerInputs(v)).toEqual({});
  });
});

describe('parsePlannerEstimate', () => {
  it('sanitizes the inputs of a valid estimate', () => {
    const parsed = parsePlannerEstimate({
      totalMin: 2_300_000,
      totalMax: 2_700_000,
      at: '2026-10-15T09:00:00.000Z',
      inputs: { ...REAL_INPUTS, nested: { a: 1 } },
    });
    expect(parsed?.inputs).toEqual(REAL_INPUTS);
  });
});
