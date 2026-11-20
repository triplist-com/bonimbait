/**
 * Step registry: phase builders in build order (docs/build3d/STEPS.md).
 * Each builder is a pure function (ctx) => StepDef[]; text is merged from
 * lib/build3d/content by step id. To add a phase: write `pNN-name.ts` exporting
 * `phaseX(ctx)` and append it to PHASE_BUILDERS below.
 */
import type { HouseModel } from '../house/types';
import type { Step, StepDef } from '../engine/types';
import { getContext, type BuildContext } from './context';
import { withText } from './kit';
import { phasePlan } from './p00-plan';
import { phaseSite } from './p01-site';
import { phaseEarthworks } from './p02-earthworks';
import { phaseFoundations } from './p03-foundations';
import { phaseLowerStructure } from './p04-lower-structure';
import { phaseMasonry } from './p07-masonry';
import { phaseRoof } from './p08-roof';
import { phaseSystems } from './p09-systems';
import { phasePlaster } from './p10-plaster';
import { phaseFinishes } from './p11-finishes';
import { phaseLandscape } from './p12-landscape';
import { phaseHandover } from './p13-handover';
import { phasePreviewStub } from './zz-preview-stub';

export type PhaseBuilder = (ctx: BuildContext) => StepDef[];

export const PHASE_BUILDERS: PhaseBuilder[] = [phasePlan, phaseSite, phaseEarthworks, phaseFoundations, phaseLowerStructure, phaseMasonry, phaseRoof, phaseSystems, phasePlaster, phasePreviewStub, phaseFinishes, phaseLandscape, phaseHandover];

export function buildSteps(house: HouseModel): Step[] {
  const ctx = getContext(house);
  const out: Step[] = [];
  for (const build of PHASE_BUILDERS) {
    try {
      for (const def of build(ctx)) out.push(withText(def));
    } catch (err) {
      // One broken phase must not take the whole viewer down.
      console.error('[build3d] phase builder failed', build.name, err);
    }
  }
  return out;
}

export { getContext };
export type { BuildContext };
