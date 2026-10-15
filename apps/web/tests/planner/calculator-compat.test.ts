/**
 * lib/calculator.ts is a stable API for the homepage example, the style guide,
 * the 20 scenario pages' history and the hub squad: same shape, new numbers.
 */
import { describe, expect, it } from 'vitest';
import { calculateCost, formatNIS, getSqm, plannerInputFromAnswers, toCalculatorResult, type CalculatorAnswers } from '@/lib/calculator';
import { estimateBudget } from '@/lib/planner/engine';
import { SCENARIOS, getRelatedScenarios } from '@/lib/calculator-scenarios';
import { BUDGET_TEASER } from '@/lib/home/content';

const answers: CalculatorAnswers = {
  house_size: '200_250',
  floors: '2',
  construction_method: 'blocks',
  finishing_level: 'standard',
  region: 'center',
  basement: 'no',
  special_features: [],
  timeline: 'normal',
};

describe('calculateCost (legacy API)', () => {
  it('keeps { total_min, total_max, breakdown[{ phase, label, min, max, percentage }] }', () => {
    const r = calculateCost(answers);
    expect(Object.keys(r).sort()).toEqual(['breakdown', 'total_max', 'total_min']);
    for (const b of r.breakdown) expect(Object.keys(b).sort()).toEqual(['label', 'max', 'min', 'percentage', 'phase']);
    expect(r.breakdown.map((b) => b.phase)).toEqual(['planning', 'permit', 'frame', 'infrastructure', 'finishing']);
    expect(r.breakdown.reduce((a, b) => a + b.percentage, 0)).toBe(100);
    expect(r.total_min).toBeLessThan(r.total_max);
  });

  it('runs on the owner\'s 2026 numbers (225 m² x ₪13,000)', () => {
    const r = calculateCost(answers);
    expect(r).toEqual(toCalculatorResult(estimateBudget({ sizeM2: 225, floors: 2, regionSlug: 'center', finishLevel: 'standard', extras: [] })));
    expect(r.total_min).toBe(2_490_000);
    expect(r.total_max).toBe(3_360_000);
  });

  it('maps the legacy answers', () => {
    expect(plannerInputFromAnswers({ ...answers, floors: '2_basement', region: 'north', finishing_level: 'standard_high', special_features: ['pool', 'elevator'] })).toEqual({
      sizeM2: 225,
      floors: 2,
      regionSlug: 'lower-galilee',
      finishLevel: 'standard',
      extras: ['basement', 'pool'],
    });
    expect(plannerInputFromAnswers({ region: 'hadera' }).regionSlug).toBe('hadera');
    expect(getSqm('nope')).toBe(150);
    expect(formatNIS(1000)).toContain('1,000');
  });

  it('prices the homepage example above a million', () => {
    const r = calculateCost({ ...BUDGET_TEASER.example.answers, special_features: [] });
    expect(r.total_min).toBeGreaterThan(1_000_000);
  });
});

describe('the 20 scenario pages', () => {
  it('keep their slugs and link to existing scenarios', () => {
    expect(SCENARIOS).toHaveLength(20);
    expect(new Set(SCENARIOS.map((s) => s.slug)).size).toBe(20);
    for (const s of SCENARIOS) {
      expect(getRelatedScenarios(s)).toHaveLength(s.relatedSlugs.length);
      const e = estimateBudget(s.input);
      expect(e.input).toEqual(s.input); // every scenario answer is valid as is
      expect(s.description).not.toMatch(/900\+? סרטונ/); // no stale "900 videos" claim
    }
  });

  it('the 200 m² standard scenario is the owner\'s example: ₪2.6M ±15%', () => {
    const s = SCENARIOS.find((x) => x.slug === 'beit-200-meter-standard')!;
    expect(estimateBudget(s.input).total).toEqual({ min: 2_210_000, mid: 2_600_000, max: 2_990_000 });
  });
});
