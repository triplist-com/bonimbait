/**
 * Step mapping when the user switches construction method (0-based step indices).
 * Pure: takes the two timelines (getTimeline(house, from) / getTimeline(house, to)).
 */
import type { Timeline } from '@/lib/build3d/engine/timeline';

type T = Pick<Timeline, 'steps' | 'phases'>;

/**
 * The phase-equivalent step in `to` for step `i` of `from`:
 *  1. the same step id, when the new method has it (shared steps: site, foundations, systems, finishes…);
 *  2. else the first step of the same phase;
 *  3. else the last step of the nearest earlier phase (closest progress before where the user was);
 *  4. else the first step.
 */
export function equivalentStep(from: T, i: number, to: T): number {
  const cur = from.steps[Math.max(0, Math.min(from.steps.length - 1, i))];
  if (!cur || !to.steps.length) return 0;
  const same = to.steps.findIndex((s) => s.id === cur.id);
  if (same >= 0) return same;
  const ph = to.phases.find((p) => p.phase === cur.phase);
  if (ph) return ph.first;
  let best = -1;
  for (const p of to.phases) if (p.phase < cur.phase) best = Math.max(best, p.last);
  return best >= 0 ? best : 0;
}

/**
 * Where watching `to` becomes interesting after `from`: the first step of the phase holding the
 * first step `from` does not have (e.g. ICF after concrete → the start of phase 4). Identical
 * step lists → 0 (watch from the start).
 */
export function divergenceStep(from: T, to: T): number {
  const ids = new Set(from.steps.map((s) => s.id));
  const k = to.steps.findIndex((s) => !ids.has(s.id));
  if (k < 0) return 0;
  const ph = to.phases.find((p) => k >= p.first && k <= p.last);
  return ph ? ph.first : k;
}
