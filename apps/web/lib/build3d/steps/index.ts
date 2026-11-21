/**
 * Step registry: per construction method, the phase builders in build order
 * (docs/build3d/STEPS.md for concrete, docs/build3d/METHODS.md for the others).
 * Each builder is a pure function (ctx) => StepDef[]; text is merged from
 * lib/build3d/content by step id. A method's list lives in steps/methods/<method>/index.ts.
 */
import type { HouseModel } from '../house/types';
import type { Step } from '../engine/types';
import { DEFAULT_METHOD, type MethodId } from '../methods';
import { getContext, type BuildContext } from './context';
import { withText } from './kit';
import type { PhaseBuilder } from './types';
import { CONCRETE_PHASES } from './methods/concrete';
import { ICF_PHASES } from './methods/icf';
import { STEEL_PHASES } from './methods/steel';
import { TIMBER_PHASES } from './methods/timber';
import { PRECAST_PHASES } from './methods/precast';

export type { PhaseBuilder };

export const METHOD_PHASES: Record<MethodId, PhaseBuilder[]> = {
  concrete: CONCRETE_PHASES,
  icf: ICF_PHASES,
  steel: STEEL_PHASES,
  timber: TIMBER_PHASES,
  precast: PRECAST_PHASES,
};

/** The concrete method's builders (kept for older imports). */
export const PHASE_BUILDERS: PhaseBuilder[] = CONCRETE_PHASES;

export function buildSteps(house: HouseModel, method: MethodId = DEFAULT_METHOD): Step[] {
  const ctx = getContext(house);
  const out: Step[] = [];
  for (const build of METHOD_PHASES[method] ?? CONCRETE_PHASES) {
    try {
      for (const def of build(ctx)) out.push(withText(def, method));
    } catch (err) {
      // One broken phase must not take the whole viewer down.
      console.error('[build3d] phase builder failed', method, build.name, err);
    }
  }
  return out;
}

export { getContext };
export type { BuildContext };
