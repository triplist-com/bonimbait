/**
 * Method "timber" — timber frame (studs, OSB, I-joists) above the concrete podium
 * (docs/build3d/METHODS.md § timber). Phases 0–5, 9, 11–13 are the concrete builders; 6, 7, 8
 * and 10 come from the shared frame kit (steps/methods/frame/) with the timber spec.
 */
import type { PhaseBuilder } from '../../types';
import { framePhases } from '../frame/phases';
import { TIMBER } from '../frame/spec';

export const TIMBER_PHASES: PhaseBuilder[] = framePhases(TIMBER);
