/**
 * Phase 7 · בנייה — block walls course by course (20 cm exterior, 10 cm partitions,
 * real 40×20 faces with a hairline mortar gap, running bond), concrete lintels over
 * openings, parapets and blind frames. Everything is laid from `house.walls` +
 * `house.openings`; openings stay open (wallPieces) and the zone over each opening is
 * left for its lintel, so nothing pokes through.
 */
import { bbox2, wallFrame, wallPoint } from '../house/geometry';
import type { Opening, Wall } from '../house/types';
import type { CameraHint, Part, StepDef } from '../engine/types';
import type { BuildContext } from './context';
import { PRICES, line, rebarKg, roundCost } from './kit';
import {
  BLOCK_H,
  cornerCuts,
  layBlocks,
  levelFloor,
  lintelRects,
  rectBox,
  wallsOfLevel,
  type BoxItem,
  type Lvl,
  type Rect,
} from './envelope-kit';

const blockWalls = (ctx: BuildContext, lvl: Lvl | 'roof', roles: Wall['role'][]) =>
  wallsOfLevel(ctx, lvl).filter((w) => w.material === 'block' && roles.includes(w.role));

function boundsOfWalls(walls: Wall[], y0: number, y1: number, grow = 1): CameraHint['bounds'] {
  const b = bbox2(walls.flatMap((w) => [w.a, w.b]));
  return { min: [b.min[0] - grow, y0, b.min[1] - grow], max: [b.max[0] + grow, y1, b.max[1] + grow] };
}

interface LaidWalls {
  items: BoxItem[];
  area: number;
  courses: number;
}

function layAll(ctx: BuildContext, walls: Wall[], leaveLintels: boolean, allWalls: Wall[] = walls): LaidWalls {
  const items: BoxItem[] = [];
  let area = 0;
  let courses = 0;
  walls.forEach((w) => {
    const earlier = allWalls.slice(0, Math.max(0, allWalls.indexOf(w)));
    const r = layBlocks(w, ctx.house.openings, levelFloor(ctx, w.level), { leaveLintels: leaveLintels && w.role !== 'parapet', trim: cornerCuts(w, earlier) });
    items.push(...r.items);
    area += r.area;
    courses = Math.max(courses, r.courses);
  });
  return { items, area, courses };
}

const blocksPart = (id: string, laid: LaidWalls, tags: string[]): Part => ({
  id,
  shape: { kind: 'boxes', items: laid.items },
  material: 'block',
  tags,
  edges: false,
  anim: { type: 'courses', stagger: Math.min(0.26, 5.5 / Math.max(1, laid.courses)), duration: 0.35, ease: 'out' },
});

const blockCount = (area: number) => Math.round((area / (0.4 * BLOCK_H)) * 1.04);

function lintelBoxes(ctx: BuildContext, walls: Wall[]): { items: BoxItem[]; m3: number; len: number } {
  const items: BoxItem[] = [];
  let m3 = 0;
  let len = 0;
  for (const w of walls) {
    const f = wallFrame(w);
    for (const r of lintelRects(w, ctx.house.openings, levelFloor(ctx, w.level))) {
      const b = rectBox(w, r);
      items.push({ at: b.at, size: b.size, rotY: f.rotY });
      m3 += (r.s1 - r.s0) * (r.y1 - r.y0) * w.thickness;
      len += r.s1 - r.s0;
    }
  }
  return { items, m3, len };
}

/** Wall pieces minus corner cuts, as rects (used by parapet copings). */
function wallRects(w: Wall, cuts: Array<[number, number]>): Rect[] {
  const L = wallFrame(w).length;
  let spans: Array<[number, number]> = [[0, L]];
  for (const [c0, c1] of cuts) spans = spans.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b] as [number, number]] : [[a, Math.max(a, c0)] as [number, number], [Math.min(b, c1), b] as [number, number]])).filter(([a, b]) => b - a > 0.03);
  return spans.map(([s0, s1]) => ({ s0, s1, y0: w.baseY, y1: w.baseY + w.height }));
}

export function phaseMasonry(ctx: BuildContext): StepDef[] {
  const lowerExt = blockWalls(ctx, 'lower', ['exterior']);
  const entExt = blockWalls(ctx, 'entrance', ['exterior']);
  const lowerInt = blockWalls(ctx, 'lower', ['interior']);
  const entInt = blockWalls(ctx, 'entrance', ['interior']);
  const parapets = ctx.house.walls.filter((w) => w.role === 'parapet');
  const lowerTop = ctx.lower.floorY + ctx.lower.ceilingHeight;
  const entTop = ctx.entrance.floorY + ctx.entrance.ceilingHeight;

  // ------------------------------------------------------------ exterior, lower
  const lo = layAll(ctx, lowerExt, true);
  const blocksLower: StepDef = {
    id: 'p7-blocks-lower',
    phase: 7,
    titleHe: 'קירות חוץ בקומה התחתונה',
    materials: [
      line('בלוקים 20×20×40', blockCount(lo.area), 'יח׳', 0),
      line('שטח קירות חוץ', lo.area, 'מ״ר', 0),
      line('מלט וחול לבנייה', lo.area * 0.012, 'מ״ק', 1),
    ],
    costILS: roundCost(lo.area * PRICES.blockWallM2),
    parts: [blocksPart('p7-blocks-lower:blocks', lo, ['blocks', 'blocks-exterior', 'level:lower'])],
    // The lower floor's block walls face the garden (back and sides): watch them rise from the
    // garden side, under the entrance slab, with nothing faded (an x-ray through the slab and the
    // ground showed steel, piles and leftovers instead of the blocks).
    camera: { bounds: boundsOfWalls(lowerExt, ctx.lower.floorY - 0.2, lowerTop + 0.2, 1.2), azimuth: 200, polar: 64, zoom: 0.95 },
    view: { xray: false },
  };

  // ------------------------------------------------------------ exterior, entrance
  const en = layAll(ctx, entExt, true);
  const blocksEntrance: StepDef = {
    id: 'p7-blocks-entrance',
    phase: 7,
    titleHe: 'קירות חוץ בקומת הכניסה',
    materials: [
      line('בלוקים 20×20×40', blockCount(en.area), 'יח׳', 0),
      line('שטח קירות חוץ', en.area, 'מ״ר', 0),
      line('מלט וחול לבנייה', en.area * 0.012, 'מ״ק', 1),
    ],
    costILS: roundCost(en.area * PRICES.blockWallM2),
    parts: [blocksPart('p7-blocks-entrance:blocks', en, ['blocks', 'blocks-exterior', 'level:entrance'])],
    camera: { bounds: boundsOfWalls(entExt, ctx.entrance.floorY - 0.2, entTop + 0.2, 1.5), polar: 50 },
    view: { xray: false },
  };

  // ------------------------------------------------------------ lintels
  const lintParts: Part[] = [];
  let lintM3 = 0;
  let lintLen = 0;
  let lintCount = 0;
  (['lower', 'entrance'] as const).forEach((lvl) => {
    const l = lintelBoxes(ctx, blockWalls(ctx, lvl, ['exterior']));
    if (!l.items.length) return;
    lintM3 += l.m3;
    lintLen += l.len;
    lintCount += l.items.length;
    lintParts.push({
      id: `p7-lintels:${lvl}`,
      shape: { kind: 'boxes', items: l.items },
      material: 'concrete',
      tags: ['lintel', 'concrete', `level:${lvl}`],
      anim: { type: 'drop', from: [0, 0.9, 0], stagger: 0.12, duration: 0.5, ease: 'bounce', order: 'x' },
    });
  });
  const lintelKg = rebarKg(12, lintLen * 4) + rebarKg(6, (lintLen / 0.2) * 0.7);
  const lintels: StepDef = {
    id: 'p7-lintels',
    phase: 7,
    titleHe: 'חגורות ומשקופי בטון מעל פתחים',
    materials: [
      line('משקופי בטון מעל פתחים', lintCount, 'יח׳', 0),
      line('בטון ב-30', lintM3, 'מ״ק', 1),
      line('ברזל זיון', lintelKg, 'ק״ג', 0),
    ],
    costILS: roundCost(lintM3 * PRICES.concreteM3 + (lintelKg / 1000) * PRICES.rebarTon + lintCount * 220),
    parts: lintParts,
    camera: { bounds: boundsOfWalls([...lowerExt, ...entExt], ctx.lower.floorY, entTop, 1.5), polar: 50 },
    view: { xray: false },
  };

  // ------------------------------------------------------------ interior partitions
  const interiorParts: Part[] = [];
  let intArea = 0;
  let intCourses = 0;
  let intLintels = 0;
  (['lower', 'entrance'] as const).forEach((lvl) => {
    const walls = lvl === 'lower' ? lowerInt : entInt;
    const laid = layAll(ctx, walls, true);
    intArea += laid.area;
    intCourses = Math.max(intCourses, laid.courses);
    const p = blocksPart(`p7-blocks-interior:${lvl}`, laid, ['blocks', 'blocks-interior', `level:${lvl}`]);
    // Entrance partitions start after the lower ones.
    if (lvl === 'entrance' && p.anim && typeof p.anim === 'object') p.anim = { ...p.anim, delay: 1.2 };
    interiorParts.push(p);
    const l = lintelBoxes(ctx, walls);
    if (l.items.length) {
      intLintels += l.items.length;
      interiorParts.push({
        id: `p7-blocks-interior:lintels-${lvl}`,
        shape: { kind: 'boxes', items: l.items },
        material: 'concrete',
        tags: ['lintel', 'concrete', `level:${lvl}`],
        anim: { type: 'drop', from: [0, 0.6, 0], stagger: 0.1, duration: 0.45, delay: 2.5, ease: 'bounce' },
      });
    }
  });
  const interior: StepDef = {
    id: 'p7-blocks-interior',
    phase: 7,
    titleHe: 'קירות פנים',
    materials: [
      line('בלוקים 10×20×40 למחיצות', blockCount(intArea), 'יח׳', 0),
      line('שטח מחיצות', intArea, 'מ״ר', 0),
      line('משקופי בטון לדלתות פנים', intLintels, 'יח׳', 0),
    ],
    costILS: roundCost(intArea * PRICES.blockWallM2 * 0.7),
    parts: interiorParts,
    camera: { bounds: boundsOfWalls([...lowerInt, ...entInt], ctx.lower.floorY, entTop, 1), polar: 62 },
    view: { xray: true, ghostAbove: entTop - 0.05 },
  };

  // ------------------------------------------------------------ parapets
  const parParts: Part[] = [];
  let parArea = 0;
  let parLen = 0;
  let parCourses = 0;
  const roofP = parapets.filter((w) => w.level === 'roof');
  const terraceP = parapets.filter((w) => w.level !== 'roof');
  const groups: Array<[string, Wall[]]> = [
    ['roof', roofP],
    ['terrace', terraceP],
  ];
  for (const [name, walls] of groups) {
    if (!walls.length) continue;
    const laid = layAll(ctx, walls, false, parapets);
    parArea += laid.area;
    parCourses = Math.max(parCourses, laid.courses);
    const lvlTag = name === 'roof' ? 'level:roof' : 'level:entrance';
    const p = blocksPart(`p7-parapets:${name}`, laid, ['blocks', 'parapet', lvlTag]);
    if (name === 'terrace' && p.anim && typeof p.anim === 'object') p.anim = { ...p.anim, delay: 0.4 };
    parParts.push(p);
    // Concrete coping on top of every parapet run.
    const caps: BoxItem[] = [];
    for (const w of walls) {
      const f = wallFrame(w);
      parLen += f.length;
      for (const r of wallRects(w, cornerCuts(w, parapets.slice(0, parapets.indexOf(w))))) {
        const top = w.baseY + w.height;
        const b = rectBox(w, { s0: r.s0, s1: r.s1, y0: top, y1: top + 0.05 }, 0.04);
        caps.push({ at: b.at, size: b.size, rotY: f.rotY });
      }
    }
    parParts.push({
      id: `p7-parapets:${name}-coping`,
      shape: { kind: 'boxes', items: caps },
      material: 'concrete',
      tags: ['parapet', 'concrete', lvlTag],
      anim: { type: 'fade', delay: 1.4 + (name === 'terrace' ? 0.4 : 0), duration: 0.5 },
    });
  }
  const roofTop = ctx.roof.floorY + 1.0;
  const parapetStep: StepDef = {
    id: 'p7-parapets',
    phase: 7,
    titleHe: 'מעקות גג ומרפסת',
    materials: [
      line('בלוקים למעקות', blockCount(parArea), 'יח׳', 0),
      line('אורך מעקות', parLen, 'מ׳', 0),
      line('כיסוי בטון (קופינג)', parLen * 0.24 * 0.05, 'מ״ק', 1),
    ],
    costILS: roundCost(parArea * PRICES.blockWallM2 + parLen * 120),
    parts: parParts,
    camera: { bounds: boundsOfWalls(parapets, ctx.roof.floorY - 0.3, roofTop + 0.3, 1.5), polar: 52 },
    view: { xray: false },
  };

  // ------------------------------------------------------------ blind frames
  const frameParts: Part[] = [];
  let frameCount = 0;
  const FT = 0.045; // frame section
  const inset = 0.004;
  (['lower', 'entrance'] as const).forEach((lvl) => {
    const items: BoxItem[] = [];
    const floor = levelFloor(ctx, lvl);
    for (const o of ctx.house.openings as Opening[]) {
      if (o.level !== lvl || o.kind === 'mamad-door' || o.kind === 'mamad-window' || o.kind === 'opening') continue;
      const w = ctx.house.walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const f = wallFrame(w);
      const depth = Math.max(0.06, w.thickness - 0.03);
      const y0 = floor + o.sill + (o.sill > 0.01 ? inset : 0);
      const y1 = floor + o.head - inset;
      const s0 = o.offset - o.width / 2 + inset;
      const s1 = o.offset + o.width / 2 - inset;
      const put = (s: number, y: number, sx: number, sy: number) => {
        const c = wallPoint(w, s);
        items.push({ at: [c[0], y, c[1]], size: [sx, sy, depth], rotY: f.rotY });
      };
      // jambs, head, and a sill bar for windows
      put(s0 + FT / 2, (y0 + y1) / 2, FT, y1 - y0);
      put(s1 - FT / 2, (y0 + y1) / 2, FT, y1 - y0);
      put((s0 + s1) / 2, y1 - FT / 2, s1 - s0 - 2 * FT, FT);
      if (o.sill > 0.01) put((s0 + s1) / 2, y0 + FT / 2, s1 - s0 - 2 * FT, FT);
      frameCount++;
    }
    if (items.length)
      frameParts.push({
        id: `p7-blind-frames:${lvl}`,
        shape: { kind: 'boxes', items },
        material: 'galvanized',
        tags: ['blind-frame', `level:${lvl}`],
        anim: { type: 'grow', stagger: 0.12, duration: 0.45, ease: 'back', order: 'x' },
      });
  });
  const blind: StepDef = {
    id: 'p7-blind-frames',
    phase: 7,
    titleHe: 'משקופים עיוורים',
    materials: [line('משקופים עיוורים מגולוונים', frameCount, 'יח׳', 0), line('עוגנים וברגים', frameCount * 6, 'יח׳', 0)],
    costILS: roundCost(frameCount * PRICES.blindFrame),
    parts: frameParts,
    camera: { bounds: boundsOfWalls([...lowerExt, ...entExt], ctx.lower.floorY, entTop, 1.5), polar: 50 },
    view: { xray: false },
  };

  return [blocksLower, blocksEntrance, lintels, interior, parapetStep, blind];
}

