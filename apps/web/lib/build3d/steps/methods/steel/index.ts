/**
 * Method "steel" — phase builders in build order (docs/build3d/METHODS.md § steel).
 * Owned by the steel author. Until the method is built this re-uses the concrete phases,
 * so `?method=steel` already opens (as the concrete build).
 */
import type { PhaseBuilder } from '../../types';
import { CONCRETE_PHASES } from '../concrete';

export const STEEL_PHASES: PhaseBuilder[] = [...CONCRETE_PHASES];
