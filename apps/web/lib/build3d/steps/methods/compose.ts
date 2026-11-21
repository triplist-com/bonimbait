/**
 * Helpers for building a method's phase list out of the concrete phases + the method's own steps.
 *
 *   const p6 = phaseEntranceStructure(ctx);
 *   return [...pick(p6, ['p6-ground-slab-prep', 'p6-ground-slab-pour']), ...myWalls(ctx), ...pick(p6, ['p6-strip-all'])];
 *
 * `pick` keeps the given order and throws on unknown ids, so a renamed concrete step fails loudly
 * in tests instead of silently disappearing from a method.
 */
import type { StepDef } from '../../engine/types';
import type { BuildContext } from '../context';
import type { PhaseBuilder } from '../types';

/** The steps with these ids, in the order given. Throws if an id is missing. */
export function pick(defs: StepDef[], ids: string[]): StepDef[] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  return ids.map((id) => {
    const d = byId.get(id);
    if (!d) throw new Error(`[build3d] pick: no step "${id}" (have: ${defs.map((x) => x.id).join(', ')})`);
    return d;
  });
}

/** All steps except these ids (order kept). Throws if an id is missing. */
export function drop(defs: StepDef[], ids: string[]): StepDef[] {
  const have = new Set(defs.map((d) => d.id));
  for (const id of ids) if (!have.has(id)) throw new Error(`[build3d] drop: no step "${id}"`);
  const out = new Set(ids);
  return defs.filter((d) => !out.has(d.id));
}

/** Name a composed phase builder (shows up in error logs and stack traces). */
export function phase(name: string, build: (ctx: BuildContext) => StepDef[]): PhaseBuilder {
  Object.defineProperty(build, 'name', { value: name });
  return build;
}
