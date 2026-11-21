/**
 * Method "steel" — light-gauge steel framing (LSF) above the concrete podium
 * (docs/build3d/METHODS.md § steel). Phases 0–5, 9, 11–13 are the concrete builders; 6, 7, 8
 * and 10 come from the shared frame kit (steps/methods/frame/) with the steel spec.
 */
import type { PhaseBuilder } from '../../types';
import { framePhases } from '../frame/phases';
import { STEEL } from '../frame/spec';

export const STEEL_PHASES: PhaseBuilder[] = framePhases(STEEL);
