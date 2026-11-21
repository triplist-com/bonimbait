/**
 * Method "concrete": reinforced-concrete frame + block infill (the original 86 steps, docs/build3d/STEPS.md).
 * Other methods reuse these builders for the phases they share (site, earthworks, foundations,
 * systems, finishes, landscape, handover) and swap the structure/envelope phases.
 */
import type { PhaseBuilder } from '../types';
import { phasePlan } from '../p00-plan';
import { phaseSite } from '../p01-site';
import { phaseEarthworks } from '../p02-earthworks';
import { phaseFoundations } from '../p03-foundations';
import { phaseLowerStructure } from '../p04-lower-structure';
import { phaseLowerCeiling } from '../p05-lower-ceiling';
import { phaseEntranceStructure } from '../p06-entrance-structure';
import { phaseMasonry } from '../p07-masonry';
import { phaseRoof } from '../p08-roof';
import { phaseSystems } from '../p09-systems';
import { phasePlaster } from '../p10-plaster';
import { phaseFinishes } from '../p11-finishes';
import { phaseLandscape } from '../p12-landscape';
import { phaseHandover } from '../p13-handover';

export const CONCRETE_PHASES: PhaseBuilder[] = [
  phasePlan,
  phaseSite,
  phaseEarthworks,
  phaseFoundations,
  phaseLowerStructure,
  phaseLowerCeiling,
  phaseEntranceStructure,
  phaseMasonry,
  phaseRoof,
  phaseSystems,
  phasePlaster,
  phaseFinishes,
  phaseLandscape,
  phaseHandover,
];
