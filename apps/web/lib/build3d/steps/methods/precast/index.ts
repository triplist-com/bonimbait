/**
 * Method "precast" — phase builders in build order (docs/build3d/METHODS.md § precast).
 * Owned by the precast author. Until the method is built this re-uses the concrete phases,
 * so `?method=precast` already opens (as the concrete build).
 */
import type { PhaseBuilder } from '../../types';
import { CONCRETE_PHASES } from '../concrete';

export const PRECAST_PHASES: PhaseBuilder[] = [...CONCRETE_PHASES];
