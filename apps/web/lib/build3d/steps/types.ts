import type { StepDef } from '../engine/types';
import type { BuildContext } from './context';

/** A phase builder: pure (ctx) => the phase's steps in build order. */
export type PhaseBuilder = (ctx: BuildContext) => StepDef[];
