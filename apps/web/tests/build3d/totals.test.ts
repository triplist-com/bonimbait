import { expect, it } from 'vitest';
import { BUILD_TOTALS, sumBuildTotals } from '@/lib/build3d/content/totals';
import { getTimeline } from '@/lib/build3d/engine/timeline';
import { house } from '@/lib/build3d/house';

it('hardcoded landing/finale totals match the built timeline', () => {
  const t = sumBuildTotals(getTimeline(house));
  console.log('computed totals', JSON.stringify(t));
  expect(t.steps).toBe(BUILD_TOTALS.steps);
  for (const k of ['days', 'costILS', 'concreteM3', 'rebarT', 'blocks'] as const) {
    expect(Math.abs(t[k] - BUILD_TOTALS[k]) / BUILD_TOTALS[k], k).toBeLessThan(0.06);
  }
});
