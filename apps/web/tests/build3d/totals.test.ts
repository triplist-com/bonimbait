import { expect, it } from 'vitest';
import { METHOD_TOTALS, sumBuildTotals } from '@/lib/build3d/content/totals';
import { getTimeline } from '@/lib/build3d/engine/timeline';
import { house } from '@/lib/build3d/house';
import { METHOD_IDS } from '@/lib/build3d/methods';

it.each(METHOD_IDS)('hardcoded totals for %s match its built timeline', (method) => {
  const want = METHOD_TOTALS[method];
  const t = sumBuildTotals(getTimeline(house, method));
  console.log(`computed totals ${method}`, JSON.stringify(t));
  expect(t.steps).toBe(want.steps);
  for (const k of ['days', 'costILS', 'concreteM3', 'rebarT'] as const) {
    expect(Math.abs(t[k] - want[k]) / want[k], `${method} ${k}`).toBeLessThan(0.06);
  }
  // Blocks can legitimately be ~0 for framed methods: compare absolutely there.
  expect(Math.abs(t.blocks - want.blocks), `${method} blocks`).toBeLessThanOrEqual(Math.max(50, want.blocks * 0.06));
});
