import { describe, expect, it } from 'vitest';
import { CONFIDENCE, computeConfidence, levelFor } from '@/lib/advisor/confidence';

describe('computeConfidence', () => {
  it('a strongly matching library is high confidence', () => {
    const c = computeConfidence({ cosines: [0.66, 0.6, 0.58, 0.4] });
    expect(c.level).toBe('high');
    expect(c.refuse).toBe(false);
    expect(c.topSimilarity).toBe(0.66);
    expect(c.score).toBeGreaterThan(0.9);
  });

  it('middling matches are medium; weak ones low', () => {
    expect(computeConfidence({ cosines: [0.45, 0.4, 0.38] }).level).toBe('medium');
    expect(computeConfidence({ cosines: [0.33, 0.31] }).level).toBe('low');
  });

  it('refuses when nothing in the library is close', () => {
    const c = computeConfidence({ cosines: [CONFIDENCE.refuseBelow - 0.01, 0.2] });
    expect(c.refuse).toBe(true);
    expect(c.level).toBe('low');
  });

  it('no sources: zero and refuse', () => {
    expect(computeConfidence({ cosines: [] })).toEqual({ score: 0, level: 'low', topSimilarity: 0, refuse: true });
  });

  it('order does not matter, and term coverage moves the score', () => {
    const a = computeConfidence({ cosines: [0.4, 0.5, 0.45] });
    const b = computeConfidence({ cosines: [0.5, 0.45, 0.4] });
    expect(a).toEqual(b);
    const covered = computeConfidence({ cosines: [0.5, 0.45, 0.4], termCoverage: 1 });
    const uncovered = computeConfidence({ cosines: [0.5, 0.45, 0.4], termCoverage: 0 });
    expect(covered.score).toBeGreaterThan(uncovered.score);
  });

  it('ignores non-finite values and clamps to 0..1', () => {
    const c = computeConfidence({ cosines: [Number.NaN, 0.95, Infinity] });
    expect(c.score).toBeLessThanOrEqual(1);
    expect(c.topSimilarity).toBe(0.95);
  });

  it('levelFor uses the thresholds', () => {
    expect(levelFor(CONFIDENCE.high)).toBe('high');
    expect(levelFor(CONFIDENCE.medium)).toBe('medium');
    expect(levelFor(CONFIDENCE.medium - 0.001)).toBe('low');
  });
});
