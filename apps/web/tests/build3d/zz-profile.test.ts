import { it } from 'vitest';
import { house } from '@/lib/build3d/house';
import { PHASE_BUILDERS, getContext } from '@/lib/build3d/steps';
import { buildTimeline } from '@/lib/build3d/engine/timeline';
import { withText } from '@/lib/build3d/steps/kit';

it('profile', () => {
  for (let run = 0; run < 2; run++) {
    let t = performance.now();
    const ctx = getContext(house);
    const out: string[] = [`run ${run} ctx ${(performance.now() - t).toFixed(1)}`];
    const steps = [];
    for (const b of PHASE_BUILDERS) {
      t = performance.now();
      const defs = b(ctx);
      for (const d of defs) steps.push(withText(d));
      out.push(`${b.name} ${(performance.now() - t).toFixed(1)}`);
    }
    t = performance.now();
    buildTimeline(steps);
    out.push(`timeline ${(performance.now() - t).toFixed(1)}`);
    console.log(out.join('\n'));
  }
});
