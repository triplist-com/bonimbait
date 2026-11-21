/**
 * Method "icf" — phase builders in build order (docs/build3d/METHODS.md § icf).
 * Owned by the icf author. Phases 0–3 and 8–13 are the concrete method's; 4–7 build the ICF shell
 * (structure.ts, geometry in icf-kit.ts) around the shared slab, ממ״ד and roof steps.
 */
import type { PhaseBuilder } from '../../types';
import { phase } from '../compose';
import { CONCRETE_PHASES } from '../concrete';
import { phaseLowerStructure } from '../../p04-lower-structure';
import { phaseLowerCeiling } from '../../p05-lower-ceiling';
import { phaseEntranceStructure } from '../../p06-entrance-structure';
import { phaseMasonry } from '../../p07-masonry';
import { phaseIcfCeiling, phaseIcfEntrance, phaseIcfLower, phaseIcfMasonry } from './structure';

const SWAP = new Map<PhaseBuilder, PhaseBuilder>([
  [phaseLowerStructure, phase('phaseIcfLower', phaseIcfLower)],
  [phaseLowerCeiling, phase('phaseIcfCeiling', phaseIcfCeiling)],
  [phaseEntranceStructure, phase('phaseIcfEntrance', phaseIcfEntrance)],
  [phaseMasonry, phase('phaseIcfMasonry', phaseIcfMasonry)],
]);

export const ICF_PHASES: PhaseBuilder[] = CONCRETE_PHASES.map((b) => SWAP.get(b) ?? b);
