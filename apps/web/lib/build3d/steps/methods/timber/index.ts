/**
 * Method "timber" — phase builders in build order (docs/build3d/METHODS.md § timber).
 * Owned by the timber author. Until the method is built this re-uses the concrete phases,
 * so `?method=timber` already opens (as the concrete build).
 */
import type { PhaseBuilder } from '../../types';
import { CONCRETE_PHASES } from '../concrete';

export const TIMBER_PHASES: PhaseBuilder[] = [...CONCRETE_PHASES];
