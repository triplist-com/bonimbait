/**
 * Hebrew step content for the "icf" method (docs/build3d/METHODS.md § icf). Owned by the icf author.
 *
 * Keys are step ids. Two kinds of entries:
 *  - the method's own steps (ids that exist only in this method), and
 *  - re-wordings of shared steps (same id as a concrete step) where this method does it differently.
 * Both win over the shared content in steps-a.ts / steps-b.ts for this method only.
 */
import type { StepContentMap } from './types';

export const STEPS_ICF: StepContentMap = {};
