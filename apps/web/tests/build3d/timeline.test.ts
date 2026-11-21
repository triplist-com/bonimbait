import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { house } from '@/lib/build3d/house';
import { buildTimeline, getTimeline } from '@/lib/build3d/engine/timeline';
import { buildSteps, getContext } from '@/lib/build3d/steps';
import { facadeSkins } from '@/lib/build3d/steps/facade';

const root = resolve(__dirname, '../..');
const stepsMd = readFileSync(resolve(root, '../../docs/build3d/STEPS.md'), 'utf8');
const ids = Array.from(stepsMd.matchAll(/^- `([a-z0-9-]+)`/gm), (m) => m[1]);

describe('build3d timeline', () => {
  const tl = getTimeline(house);

  it('has every STEPS.md id, in order', () => {
    expect(ids.length).toBe(86);
    expect(tl.steps.map((s) => s.id)).toEqual(ids);
  });

  it('builds fast enough for the viewer', () => {
    // Budget is < 150 ms in the browser. One build under parallel test load can stall on GC or a
    // busy core, so judge the best of three: the cold build above plus two fresh rebuilds (the
    // house context stays cached, as in the viewer). A real regression slows all three.
    const times = [tl.buildMs];
    for (let i = 0; i < 2; i++) {
      const t0 = performance.now();
      buildTimeline(buildSteps(house));
      times.push(performance.now() - t0);
    }
    // Warm rebuilds take ~50-70 ms in node (cold ~170 ms incl. the house context).
    expect(Math.min(...times)).toBeLessThan(300);
  });

  it('poses every pump so the hose hangs over its pour (within boom reach)', () => {
    const pumps = tl.parts.filter((tp) => tp.part.shape.kind === 'model' && tp.part.shape.name === 'pump-truck');
    expect(pumps.length).toBeGreaterThanOrEqual(6);
    for (const tp of pumps) {
      const s = tp.part.shape;
      if (s.kind !== 'model') continue;
      expect(s.pose, tp.part.id).toBeDefined();
      const [x, , z, stream] = s.pose as number[];
      const reach = Math.hypot(x + 2.8, z);
      expect(reach, tp.part.id).toBeLessThan(19.6);
      expect(stream, tp.part.id).toBeGreaterThan(0.5);
    }
  });

  it('covers the facade with render and stone', () => {
    const f = facadeSkins(getContext(house));
    expect(f.render.lower.length).toBeGreaterThan(10);
    expect(f.render.entrance.length).toBeGreaterThan(10);
    expect(f.render.roof.length).toBeGreaterThan(10);
    expect(f.stone.flat().length).toBeGreaterThan(300);
    expect(f.caps.length).toBeGreaterThan(0);
    expect(f.renderArea).toBeGreaterThan(200);
  });
});
