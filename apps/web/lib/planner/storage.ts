/**
 * Project-file snapshots in localStorage (docs/platform/PROGRAM.md §6):
 *   bb.planner.last   written here: the `plannerEstimate` of the project file
 *   bb.hub.draft      written by the hub onboarding; read here for prefill
 * Every access is wrapped: storage can be missing, full or blocked.
 */
import { parseHubDraft } from './prefill';
import type { HubDraft, PlannerEstimate, PlannerSnapshot } from './types';

export const PLANNER_LAST_KEY = 'bb.planner.last';
export const HUB_DRAFT_KEY = 'bb.hub.draft';

/** The §6 shape: { totalMin, totalMax, at, inputs }, whole shekels, ex-VAT. */
export function plannerSnapshot(estimate: PlannerEstimate, at: Date = new Date()): PlannerSnapshot {
  const { input } = estimate;
  return {
    totalMin: estimate.total.min,
    totalMax: estimate.total.max,
    at: at.toISOString(),
    inputs: {
      sizeM2: input.sizeM2,
      floors: input.floors,
      regionSlug: input.regionSlug,
      finishLevel: input.finishLevel,
      extras: [...input.extras],
      perM2Min: estimate.perM2.min,
      perM2Max: estimate.perM2.max,
      vat: 'excluded',
      priceBookAsOf: estimate.validAsOf,
      estimateId: estimate.estimateId,
    },
  };
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function writePlannerLast(snapshot: PlannerSnapshot): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(PLANNER_LAST_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function readPlannerLast(): PlannerSnapshot | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PLANNER_LAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PlannerSnapshot>;
    if (typeof v.totalMin !== 'number' || typeof v.totalMax !== 'number' || typeof v.at !== 'string') return null;
    return { totalMin: v.totalMin, totalMax: v.totalMax, at: v.at, inputs: (v.inputs ?? {}) as Record<string, unknown> };
  } catch {
    return null;
  }
}

export function readHubDraft(): HubDraft | null {
  const s = storage();
  if (!s) return null;
  try {
    return parseHubDraft(s.getItem(HUB_DRAFT_KEY));
  } catch {
    return null;
  }
}
