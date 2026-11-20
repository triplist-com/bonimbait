/**
 * Step timeline: ordered steps → flattened parts with derived visibility
 * (added at step i, removed at step j), per-step durations and running totals.
 * Built once per house (memoized).
 */
import type { HouseModel } from '../house/types';
import { buildSteps } from '../steps';
import { normalizeExit, partSpan } from './anim';
import type { Part, PhaseId, Step } from './types';

export interface TimelinePart {
  part: Part;
  /** Index into Timeline.parts. */
  index: number;
  /** Step that adds it. */
  addedAt: number;
  /** Step that removes it (Infinity = permanent). */
  removedAt: number;
}

export interface Timeline {
  steps: Step[];
  parts: TimelinePart[];
  byId: Map<string, TimelinePart>;
  /** Part indices added by each step. */
  added: number[][];
  /** Part indices removed by each step. */
  removed: number[][];
  /** Seconds the step's 3D animation lasts (entries + exits). */
  span: number[];
  /** Running totals INCLUDING the step. */
  cumCostILS: number[];
  cumDays: number[];
  phases: Array<{ phase: PhaseId; first: number; last: number }>;
  totals: { costILS: number; days: number; steps: number };
  /** Build time in ms (perf budget < 150 ms). */
  buildMs: number;
}

export function buildTimeline(steps: Step[]): Timeline {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const parts: TimelinePart[] = [];
  const byId = new Map<string, TimelinePart>();
  const added: number[][] = [];
  const removed: number[][] = [];
  const span: number[] = [];
  const byTag = new Map<string, TimelinePart[]>();

  steps.forEach((step, s) => {
    // Removals refer to parts of EARLIER steps.
    const rem: number[] = [];
    let exitSpan = 0;
    const removeOne = (tp: TimelinePart) => {
      if (tp.removedAt !== Infinity || tp.addedAt >= s) return;
      tp.removedAt = s;
      rem.push(tp.index);
      const e = normalizeExit(tp.part);
      exitSpan = Math.max(exitSpan, e.delay + e.duration);
    };
    for (const id of step.remove?.ids ?? []) {
      const tp = byId.get(id);
      if (!tp) {
        if (process.env.NODE_ENV !== 'production') console.warn(`[build3d] ${step.id}: remove unknown part "${id}"`);
        continue;
      }
      removeOne(tp);
    }
    for (const tag of step.remove?.tags ?? []) for (const tp of byTag.get(tag) ?? []) removeOne(tp);
    removed.push(rem);

    const add: number[] = [];
    let entrySpan = 0;
    for (const part of step.parts) {
      if (byId.has(part.id)) {
        if (process.env.NODE_ENV !== 'production') console.warn(`[build3d] duplicate part id "${part.id}" in ${step.id}`);
        continue;
      }
      const tp: TimelinePart = { part, index: parts.length, addedAt: s, removedAt: Infinity };
      parts.push(tp);
      byId.set(part.id, tp);
      for (const tag of part.tags ?? []) {
        const l = byTag.get(tag);
        if (l) l.push(tp);
        else byTag.set(tag, [tp]);
      }
      add.push(tp.index);
      entrySpan = Math.max(entrySpan, partSpan(part));
    }
    added.push(add);
    span.push(Math.max(entrySpan, exitSpan));
  });

  const cumCostILS: number[] = [];
  const cumDays: number[] = [];
  let c = 0;
  let d = 0;
  for (const st of steps) {
    c += st.costILS;
    d += st.durationDays;
    cumCostILS.push(c);
    cumDays.push(d);
  }

  const phases: Timeline['phases'] = [];
  steps.forEach((st, i) => {
    const last = phases[phases.length - 1];
    if (last && last.phase === st.phase) last.last = i;
    else phases.push({ phase: st.phase, first: i, last: i });
  });

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    steps,
    parts,
    byId,
    added,
    removed,
    span,
    cumCostILS,
    cumDays,
    phases,
    totals: { costILS: c, days: d, steps: steps.length },
    buildMs: t1 - t0,
  };
}

const cache = new WeakMap<HouseModel, Timeline>();

/** The memoized timeline for a house (steps are generated once). */
export function getTimeline(house: HouseModel): Timeline {
  let t = cache.get(house);
  if (!t) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const steps = buildSteps(house);
    t = buildTimeline(steps);
    // Total: step generation + flattening.
    t.buildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    cache.set(house, t);
  }
  return t;
}

/** Is the part present (settled) at step s? */
export const visibleAt = (tp: TimelinePart, s: number) => tp.addedAt <= s && s < tp.removedAt;
