/**
 * The hub's first budget estimate. Two sources, in order:
 *   1. growth's budget planner result (`bb.planner.last`, PROGRAM.md §6), when
 *      the builder ran it;
 *   2. the planner engine on the project profile: growth's estimateFromProfile()
 *      (lib/planner/engine.ts) with the owner's current price book (the admin
 *      "מחירון מתכנן התקציב"): exact m², the 13 member regions, 2 floors, the
 *      "סטנדרטי-טוב" finish, no extras, ±15%, ex-VAT. Server callers pass
 *      loadPriceBook()'s book; the seeded book is the fallback.
 * The basis stays 'calculator' (hub_budget_versions.basis): "the site's
 * estimate", as opposed to the builder's own planner run. Client-safe.
 */
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { estimateFromProfile } from '@/lib/planner/engine';
import type { PriceBook } from '@/lib/planner/types';
import type { HubDraft, HubEstimate, PlannerEstimate } from './types';

/**
 * The site's estimate for the project (planning + build, ex-VAT, a ±15%
 * range). Null without a size (nothing honest to say yet).
 */
export function estimateFromCalculator(
  draft: Pick<HubDraft, 'sizeM2' | 'regionSlug'>,
  book: PriceBook = DEFAULT_PRICE_BOOK,
): HubEstimate | null {
  if (!draft.sizeM2) return null;
  const estimate = estimateFromProfile({ sizeM2: draft.sizeM2, regionSlug: draft.regionSlug }, book);
  return {
    totalMin: estimate.total.min,
    totalMax: estimate.total.max,
    basis: 'calculator',
    inputs: {
      ...estimate.input,
      extras: [...estimate.input.extras],
      size_m2: draft.sizeM2,
      perM2Min: estimate.perM2.min,
      perM2Max: estimate.perM2.max,
      vat: 'excluded',
      priceBookAsOf: estimate.validAsOf,
      estimateId: estimate.estimateId,
    },
  };
}

/** Validate growth's `bb.planner.last` (anything malformed is ignored). */
export function parsePlannerEstimate(value: unknown): PlannerEstimate | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const min = typeof v.totalMin === 'number' ? v.totalMin : NaN;
  const max = typeof v.totalMax === 'number' ? v.totalMax : NaN;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min || max > 1_000_000_000) return null;
  const at = typeof v.at === 'string' && !Number.isNaN(Date.parse(v.at)) ? v.at : null;
  if (!at) return null;
  const inputs = v.inputs && typeof v.inputs === 'object' && !Array.isArray(v.inputs) ? (v.inputs as Record<string, unknown>) : {};
  return { totalMin: Math.round(min), totalMax: Math.round(max), at, inputs };
}

export function estimateFromPlanner(planner: PlannerEstimate): HubEstimate {
  return {
    totalMin: planner.totalMin,
    totalMax: planner.totalMax,
    basis: 'planner',
    at: planner.at,
    inputs: planner.inputs,
  };
}

/** The planner's result when there is one, else the site's estimate on `book`. */
export function initialEstimate(
  draft: Pick<HubDraft, 'sizeM2' | 'regionSlug'>,
  planner: PlannerEstimate | null | undefined,
  book: PriceBook = DEFAULT_PRICE_BOOK,
): HubEstimate | null {
  return planner ? estimateFromPlanner(planner) : estimateFromCalculator(draft, book);
}
