import { afterEach, describe, expect, it, vi } from 'vitest';
import { house } from '@/lib/build3d/house';
import { buildSteps } from '@/lib/build3d/steps';
import { getTimeline } from '@/lib/build3d/engine/timeline';
import { METHOD_IDS } from '@/lib/build3d/methods';
import { METHOD_CONTENT, STEP_CONTENT } from '@/lib/build3d/content';

/** Guard rails every construction method must pass (docs/build3d/METHODS.md). */
describe.each(METHOD_IDS)('method %s', (method) => {
  afterEach(() => vi.restoreAllMocks());

  it('builds every phase without errors or dangling removals', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const steps = buildSteps(house, method);
    expect(errors.mock.calls.map((c) => String(c[2] ?? c[0])), 'phase builder errors').toEqual([]);
    expect(
      warns.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('remove unknown part')),
      'removals of parts that do not exist',
    ).toEqual([]);
    expect(steps.length).toBeGreaterThan(40);
  });

  it('starts on the plan, ends with the finished house, ids unique', () => {
    const tl = getTimeline(house, method);
    const ids = tl.steps.map((s) => s.id);
    expect(ids[0]).toBe('p0-plan');
    expect(ids[ids.length - 1]).toBe('p13-done');
    expect(new Set(ids).size).toBe(ids.length);
    const partIds = tl.parts.map((p) => p.part.id);
    expect(new Set(partIds).size).toBe(partIds.length);
  });

  it('phases never go backwards', () => {
    const phases = getTimeline(house, method).steps.map((s) => s.phase);
    for (let i = 1; i < phases.length; i++) expect(phases[i], `step ${i + 1}`).toBeGreaterThanOrEqual(phases[i - 1]);
  });

  it('has Hebrew text for every step', () => {
    for (const s of getTimeline(house, method).steps) {
      const c = METHOD_CONTENT[method][s.id] ?? STEP_CONTENT[s.id];
      expect(c, `content for ${s.id}`).toBeTruthy();
      expect(c.titleHe.length, s.id).toBeGreaterThan(2);
      expect(c.descHe.length, s.id).toBeGreaterThan(20);
    }
  });
});
