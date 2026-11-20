/** TEMPORARY verification stub (author C): a crude shell so finishes render over a house. Not shipped. */
import { wallPieces, pieceBox } from '../house/geometry';
import type { StepDef } from '../engine/types';
import type { BuildContext } from './context';
import { STOREY_ROLES } from './finish-kit';

export function phasePreviewStub(ctx: BuildContext): StepDef[] {
  const { house } = ctx;
  const items = [] as Array<{ at: [number, number, number]; size: [number, number, number]; rotY: number }>;
  for (const w of house.walls) {
    if (!STOREY_ROLES.has(w.role) && w.role !== 'parapet') continue;
    const fy = w.level === 'lower' ? ctx.lower.floorY : w.level === 'entrance' ? 0 : 3.3;
    for (const p of wallPieces(w, house.openings, fy)) items.push(pieceBox(w, p));
  }
  return [
    {
      id: 'p7-stub',
      phase: 7,
      titleHe: 'שלד זמני',
      materials: [],
      costILS: 0,
      remove: { tags: ['terrain', 'site-temp', 'machine', 'formwork', 'props'] },
      parts: [
        {
          id: 'stub-terrain',
          shape: { kind: 'terrain', grid: ctx.terrain.finished, baseY: ctx.terrain.baseY },
          material: 'soil',
          tags: ['ground', 'terrain'],
          anim: 'none',
        },
        ...(items.length > 100000 ? [{ id: 'stub-walls', shape: { kind: 'boxes' as const, items }, material: 'block' as const, tags: ['blocks'], anim: 'none' as const }] : []),
        ...house.slabs.map((s) => ({
          id: `stub-slab-${s.id}`,
          shape: { kind: 'extrude' as const, outline: s.outline, holes: s.holes, y0: s.topY - s.thickness, y1: s.topY },
          material: 'concrete' as const,
          tags: ['slab'],
          anim: 'none' as const,
        })),
      ],
    },
  ];
}
