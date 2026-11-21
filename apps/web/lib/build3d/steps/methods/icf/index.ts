/**
 * Method "icf" — phase builders in build order (docs/build3d/METHODS.md § icf).
 * Owned by the icf author. Until the method is built this re-uses the concrete phases,
 * so `?method=icf` already opens (as the concrete build).
 */
import type { PhaseBuilder } from '../../types';
import { CONCRETE_PHASES } from '../concrete';

export const ICF_PHASES: PhaseBuilder[] = [...CONCRETE_PHASES];
