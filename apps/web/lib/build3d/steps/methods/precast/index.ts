/**
 * Method "precast" — phase builders in build order (docs/build3d/METHODS.md § precast).
 * The mobile crane sets factory-made wall panels and hollow-core planks; the ממ״ד is an approved precast module.
 * Phases 0-3, 8, 9 and 11-13 are the shared concrete builders.
 */
import type { PhaseBuilder } from '../../types';
import { phasePlan } from '../../p00-plan';
import { phaseSite } from '../../p01-site';
import { phaseEarthworks } from '../../p02-earthworks';
import { phaseFoundations } from '../../p03-foundations';
import { phaseRoof } from '../../p08-roof';
import { phaseSystems } from '../../p09-systems';
import { phaseFinishes } from '../../p11-finishes';
import { phaseLandscape } from '../../p12-landscape';
import { phaseHandover } from '../../p13-handover';
import { phase } from '../compose';
import { phasePrecastMasonry, phasePrecastPlaster } from './envelope';
import { phasePrecastCeiling, phasePrecastEntrance, phasePrecastLower } from './structure';

export const PRECAST_PHASES: PhaseBuilder[] = [
  phasePlan,
  phaseSite,
  phaseEarthworks,
  phaseFoundations,
  phase('phasePrecastLower', phasePrecastLower),
  phase('phasePrecastCeiling', phasePrecastCeiling),
  phase('phasePrecastEntrance', phasePrecastEntrance),
  phase('phasePrecastMasonry', phasePrecastMasonry),
  phaseRoof,
  phaseSystems,
  phase('phasePrecastPlaster', phasePrecastPlaster),
  phaseFinishes,
  phaseLandscape,
  phaseHandover,
];
