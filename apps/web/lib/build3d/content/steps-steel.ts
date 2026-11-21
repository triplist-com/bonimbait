/**
 * Hebrew step content for the "steel" method (docs/build3d/METHODS.md § steel). Owned by the steel author.
 *
 * Keys are step ids. Two kinds of entries:
 *  - the method's own steps (ids that exist only in this method), and
 *  - re-wordings of shared steps (same id as a concrete step) where this method does it differently.
 * Both win over the shared content in steps-a.ts / steps-b.ts for this method only.
 */
import type { StepContentMap } from './types';

export const STEPS_STEEL: StepContentMap = {};
