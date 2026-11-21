import { describe, expect, it } from 'vitest';
import { divergenceStep, equivalentStep } from '@/components/build3d/viewer/methodSwitch';
import { phaseNameHe, PHASES, setPhaseMethod } from '@/lib/build3d/engine/phases';
import { METHODS_INFO } from '@/lib/build3d/content/methods';
import type { PhaseId } from '@/lib/build3d/engine/types';

/** Minimal timeline: steps as [id, phase] pairs, phases derived like buildTimeline does. */
function tl(list: Array<[string, PhaseId]>) {
  const steps = list.map(([id, phase]) => ({ id, phase }));
  const phases: Array<{ phase: PhaseId; first: number; last: number }> = [];
  steps.forEach((s, i) => {
    const last = phases[phases.length - 1];
    if (last && last.phase === s.phase) last.last = i;
    else phases.push({ phase: s.phase, first: i, last: i });
  });
  return { steps, phases } as unknown as Parameters<typeof equivalentStep>[0];
}

const concrete = tl([
  ['p0', 0], ['p3-piles', 3], ['p4-retaining', 4], ['p4-slab', 4], ['p6-strip-all', 6], ['p7-blocks', 7], ['p7-frames', 7], ['p9-pipes', 9], ['p13-done', 13],
]);
const icf = tl([
  ['p0', 0], ['p3-piles', 3], ['p4i-courses', 4], ['p4-slab', 4], ['p6-strip-all', 6], ['p7i-parapets', 7], ['p7-frames', 7], ['p9-pipes', 9], ['p13-done', 13],
]);
const noSeven = tl([['p0', 0], ['p3-piles', 3], ['p4-x', 4], ['p6-y', 6], ['p6-z', 6], ['p9-pipes', 9], ['p13-done', 13]]);

describe('equivalentStep', () => {
  it('keeps the same step id when the other method has it', () => {
    expect(equivalentStep(concrete, 3, icf)).toBe(3); // p4-slab
    expect(equivalentStep(concrete, 8, icf)).toBe(8); // p13-done
  });
  it('falls back to the first step of the same phase', () => {
    expect(equivalentStep(concrete, 2, icf)).toBe(2); // p4-retaining → p4i-courses
    expect(equivalentStep(concrete, 5, icf)).toBe(5); // p7-blocks → p7i-parapets
  });
  it('else the last step of the nearest earlier phase', () => {
    expect(equivalentStep(concrete, 5, noSeven)).toBe(4); // phase 7 missing → p6-z
  });
});

describe('divergenceStep', () => {
  it('starts at the phase where the builds part', () => {
    expect(divergenceStep(concrete, icf)).toBe(2); // phase 4 start
    expect(divergenceStep(icf, concrete)).toBe(2);
  });
  it('identical lists → from the start', () => {
    expect(divergenceStep(concrete, concrete)).toBe(0);
  });
});

describe('phase names per method', () => {
  it('uses the method override, else the default', () => {
    const [id, name] = Object.entries(METHODS_INFO.icf.phaseNamesHe)[0] ?? [];
    if (id !== undefined) expect(phaseNameHe(Number(id) as PhaseId, 'icf')).toBe(name);
    expect(phaseNameHe(0, 'icf')).toBe(phaseNameHe(0, 'concrete'));
    setPhaseMethod('icf');
    if (id !== undefined) expect(PHASES[Number(id)].nameHe).toBe(name);
    setPhaseMethod('concrete');
    expect(PHASES[4].nameHe).toBe(phaseNameHe(4, 'concrete'));
  });
});
