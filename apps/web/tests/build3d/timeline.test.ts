import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { house } from '@/lib/build3d/house';
import { getTimeline } from '@/lib/build3d/engine/timeline';

const root = resolve(__dirname, '../..');
const stepsMd = readFileSync(resolve(root, '../../docs/build3d/STEPS.md'), 'utf8');
const ids = Array.from(stepsMd.matchAll(/^- `([a-z0-9-]+)`/gm), (m) => m[1]);

describe('build3d timeline', () => {
  const t0 = performance.now();
  const tl = getTimeline(house);
  const ms = performance.now() - t0;

  it('has every STEPS.md id, in order', () => {
    console.log('steps', tl.steps.length, 'parts', tl.parts.length, 'build ms', ms.toFixed(1));
    expect(tl.steps.map((s) => s.id)).toEqual(ids);
  });
});
