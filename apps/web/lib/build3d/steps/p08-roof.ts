/**
 * Phase 8 · גג — slope screed (3% fall toward four drains, built from a 40 cm cell grid
 * clipped to the area inside the parapets), insulation boards, black bitumen membrane
 * with 30 cm upturns on the parapets, white reflective coat, solar heaters and AC
 * condensers. All roof geometry comes from `roofModel(ctx)` (envelope-kit).
 */
import { angleOfDir, bbox2, norm2, pointInPolygon, wallFrame, wallPoint } from '../house/geometry';
import type { CameraHint, Part, StepDef, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { PRICES, line, model, roundCost } from './kit';
import { COAT_T, INSUL_T, MEMBRANE_T, roofModel, type BoxItem, type RoofModel } from './envelope-kit';

const TAGS = ['level:roof'];

function roofBounds(r: RoofModel, extraTop: number): CameraHint['bounds'] {
  const b = bbox2(r.outline);
  return { min: [b.min[0] - 1, r.slabTop - 0.2, b.min[1] - 1], max: [b.max[0] + 1, r.slabTop + extraTop, b.max[1] + 1] };
}

/** Cells as boxes; `top` returns the cell's top, `bottom` its bottom, `grow` expands the footprint. */
function cellBoxes(r: RoofModel, bottom: (c: RoofModel['cells'][number]) => number, top: (c: RoofModel['cells'][number]) => number, grow = 0): BoxItem[] {
  return r.cells.map((c) => {
    const y0 = bottom(c);
    const y1 = top(c);
    return {
      at: [(c.x0 + c.x1) / 2, (y0 + y1) / 2, (c.z0 + c.z1) / 2] as Vec3,
      size: [c.x1 - c.x0 + grow, y1 - y0, c.z1 - c.z0 + grow] as Vec3,
      rotY: 0,
    };
  });
}

/** Upturn strips along the inner face of every roof parapet. */
function upturnBoxes(ctx: BuildContext, r: RoofModel, thickness: number, height: number, baseOf: (x: number, z: number) => number): BoxItem[] {
  const out: BoxItem[] = [];
  for (const w of ctx.house.walls.filter((x) => x.role === 'parapet' && x.level === 'roof')) {
    const f = wallFrame(w);
    // Roof-side normal = the one pointing into the inner roof polygon.
    const probe = (n: number): Vec2 => {
      const p = wallPoint(w, f.length / 2, n * (w.thickness / 2 + 0.3));
      return p;
    };
    const side = pointInPolygon(probe(1), r.inner) ? 1 : pointInPolygon(probe(-1), r.inner) ? -1 : 0;
    if (!side) continue;
    const n = Math.max(1, Math.round(f.length / 0.5));
    for (let i = 0; i < n; i++) {
      const s0 = (f.length * i) / n;
      const s1 = (f.length * (i + 1)) / n;
      const sm = (s0 + s1) / 2;
      const inside = wallPoint(w, sm, side * (w.thickness / 2 + 0.1));
      if (!pointInPolygon(inside, r.inner)) continue;
      const y0 = baseOf(inside[0], inside[1]) - 0.02;
      const y1 = baseOf(inside[0], inside[1]) + height;
      const c = wallPoint(w, sm, side * (w.thickness / 2 + thickness / 2 - 0.002));
      out.push({ at: [c[0], (y0 + y1) / 2, c[1]], size: [s1 - s0 + 0.01, y1 - y0, thickness], rotY: f.rotY });
    }
  }
  return out;
}

export function phaseRoof(ctx: BuildContext): StepDef[] {
  const r = roofModel(ctx);
  const m2 = r.area;
  const avgScreed = r.cells.reduce((s, c) => s + (c.top - r.slabTop) * (c.x1 - c.x0) * (c.z1 - c.z0), 0);
  const cam = (z: number): CameraHint => ({ bounds: roofBounds(r, z), polar: 40, azimuth: 30 });
  const ord = { order: 'near' as const, origin: [r.drains[0][0], r.drains[0][1]] as Vec2 };

  // --------------------------------------------------------------- screed
  const drainParts: Part[] = r.drains.map((d, i) => ({
    id: `p8-roof-screed:drain-${i + 1}`,
    shape: { kind: 'cylinder', radius: 0.1, height: SCREED_DRAIN_H, at: [d[0], r.slabTop, d[1]], segments: 18 },
    material: 'drain',
    tags: ['roof-drain', ...TAGS],
    anim: { type: 'rise', delay: 1.0 + i * 0.2, duration: 0.5 },
  }));
  const screed: StepDef = {
    id: 'p8-roof-screed',
    phase: 8,
    titleHe: 'בטון שיפועים',
    materials: [
      line('בטון קל לשיפועים', avgScreed, 'מ״ק', 1),
      line('שטח גג', m2, 'מ״ר', 0),
      line('פתחי ניקוז', r.drains.length, 'יח׳', 0),
    ],
    costILS: roundCost(m2 * PRICES.screedM2),
    parts: [
      {
        id: 'p8-roof-screed:screed',
        shape: { kind: 'boxes', items: cellBoxes(r, () => r.slabTop, (c) => c.top) },
        material: 'concreteFresh',
        tags: ['screed', 'concrete', ...TAGS],
        edges: false,
        anim: { type: 'rise', stagger: 3.2 / Math.max(1, r.cells.length), duration: 0.5, ...ord },
      },
      ...drainParts,
    ],
    camera: cam(0.6),
    view: { xray: false },
  };

  // --------------------------------------------------------------- insulation
  const insulation: StepDef = {
    id: 'p8-roof-insulation',
    phase: 8,
    titleHe: 'בידוד תרמי',
    materials: [line('לוחות בידוד XPS בעובי 6 ס״מ', m2 / 0.36, 'יח׳', 0), line('שטח בידוד', m2, 'מ״ר', 0)],
    costILS: roundCost(m2 * PRICES.roofInsulationM2),
    parts: [
      {
        id: 'p8-roof-insulation:boards',
        shape: { kind: 'boxes', items: cellBoxes(r, (c) => c.top, (c) => c.top + INSUL_T, -0.008) },
        material: 'insulation',
        tags: ['insulation', ...TAGS],
        edges: false,
        anim: { type: 'drop', from: [0, 0.5, 0], stagger: 3.4 / Math.max(1, r.cells.length), duration: 0.35, ease: 'out', order: 'x' },
      },
    ],
    camera: cam(0.8),
    view: { xray: false },
  };

  // --------------------------------------------------------------- membrane
  const membraneTop = (c: RoofModel['cells'][number]) => c.top + INSUL_T + MEMBRANE_T;
  const membrane: StepDef = {
    id: 'p8-roof-membrane',
    phase: 8,
    titleHe: 'איטום ביריעות ביטומניות',
    materials: [
      line('יריעות ביטומניות (שתי שכבות)', m2 * 2.2, 'מ״ר', 0),
      line('עליות איטום על המעקות', upturnLen(ctx), 'מ׳', 0),
      line('פריימר ביטומני', m2 * 0.3, 'ליטר', 0),
    ],
    costILS: roundCost(m2 * PRICES.roofWaterproofingM2),
    parts: [
      {
        id: 'p8-roof-membrane:sheet',
        shape: { kind: 'boxes', items: cellBoxes(r, (c) => c.top + INSUL_T - 0.01, membraneTop, 0.012) },
        material: 'bitumen',
        tags: ['roof-membrane', ...TAGS],
        edges: false,
        anim: { type: 'fade', stagger: 3.2 / Math.max(1, r.cells.length), duration: 0.4, order: 'x' },
      },
      {
        id: 'p8-roof-membrane:upturns',
        shape: { kind: 'boxes', items: upturnBoxes(ctx, r, 0.014, 0.3, (x, z) => r.screedTop(x, z) + INSUL_T) },
        material: 'bitumen',
        tags: ['roof-membrane', ...TAGS],
        edges: false,
        anim: { type: 'rise', delay: 2.4, stagger: 0.03, duration: 0.4, ...ord },
      },
    ],
    camera: cam(0.8),
    view: { xray: false },
  };

  // --------------------------------------------------------------- white coat
  const coat: StepDef = {
    id: 'p8-roof-coat',
    phase: 8,
    titleHe: 'ציפוי לבן מחזיר קרינה',
    materials: [line('צבע אלסטומרי לבן מחזיר קרינה', m2 * 1.2, 'ק״ג', 0), line('שטח ציפוי', m2, 'מ״ר', 0)],
    costILS: roundCost(m2 * 45),
    remove: { tags: ['roof-membrane'] },
    parts: [
      {
        id: 'p8-roof-coat:coat',
        shape: { kind: 'boxes', items: cellBoxes(r, (c) => c.top + INSUL_T - 0.01, (c) => membraneTop(c) + COAT_T, 0.024) },
        material: 'roofWhite',
        tags: ['roof-coat', ...TAGS],
        edges: false,
        anim: { type: 'fade', stagger: 3.2 / Math.max(1, r.cells.length), duration: 0.5, order: 'z' },
      },
      {
        id: 'p8-roof-coat:upturns',
        shape: { kind: 'boxes', items: upturnBoxes(ctx, r, 0.03, 0.31, (x, z) => r.screedTop(x, z) + INSUL_T) },
        material: 'roofWhite',
        tags: ['roof-coat', ...TAGS],
        edges: false,
        anim: { type: 'fade', delay: 2.2, duration: 0.6 },
      },
    ],
    camera: cam(1.0),
    view: { xray: false },
  };

  // --------------------------------------------------------------- equipment
  const south = norm2([-ctx.lot.street.inward[0], -ctx.lot.street.inward[1]]);
  const north: Vec2 = [-south[0], -south[1]];
  const ok = (p: Vec2) => pointInPolygon(p, r.inner);
  const solarSpots: Vec2[] = [
    [2.4, 3.2],
    [2.4, 5.4],
  ].map((p) => p as Vec2).filter(ok);
  const acSpots: Vec2[] = [
    [1.0, 0.95],
    [2.2, 0.95],
    [3.4, 0.95],
  ].map((p) => p as Vec2).filter(ok);
  const lowest = (p: Vec2, hw: number) => {
    let y = Infinity;
    for (const dx of [-hw, hw]) for (const dz of [-hw, hw]) y = Math.min(y, r.surface(p[0] + dx, p[1] + dz));
    return y;
  };
  const parts: Part[] = [];
  solarSpots.forEach((p, i) =>
    parts.push(
      model(`p8-roof-equipment:solar-${i + 1}`, 'solar-heater', [p[0], lowest(p, 0.7) - 0.01, p[1]], angleOfDir(south), {
        tags: ['roof-equipment', 'solar', ...TAGS],
        anim: { type: 'drop', from: [0, 3, 0], delay: i * 0.5, duration: 1.0, ease: 'bounce' },
      }),
    ),
  );
  acSpots.forEach((p, i) =>
    parts.push(
      model(`p8-roof-equipment:ac-${i + 1}`, 'ac-unit', [p[0], lowest(p, 0.4) - 0.01, p[1]], angleOfDir(north), {
        tags: ['roof-equipment', 'ac-condenser', ...TAGS],
        anim: { type: 'drop', from: [0, 3, 0], delay: 1.2 + i * 0.4, duration: 1.0, ease: 'bounce' },
      }),
    ),
  );
  const eqCenter = solarSpots[0] ?? acSpots[0] ?? ([2, 3] as Vec2);
  const equipment: StepDef = {
    id: 'p8-roof-equipment',
    phase: 8,
    titleHe: 'דוד שמש, קולטים ומעבים',
    materials: [
      line('דוד שמש עם קולט', solarSpots.length, 'יח׳', 0),
      line('מעבי מיזוג', acSpots.length, 'יח׳', 0),
      line('מעמדי פלדה וכיפופים', solarSpots.length + acSpots.length, 'יח׳', 0),
    ],
    costILS: roundCost(solarSpots.length * PRICES.solarHeater + acSpots.length * 4800 * 1.5 * 0.5),
    parts,
    camera: { bounds: { min: [eqCenter[0] - 5, r.slabTop - 0.5, eqCenter[1] - 5], max: [eqCenter[0] + 5, r.slabTop + 3, eqCenter[1] + 5] }, polar: 48, azimuth: 40 },
    view: { xray: false },
  };

  return [screed, insulation, membrane, coat, equipment];
}

const SCREED_DRAIN_H = 0.16;

function upturnLen(ctx: BuildContext) {
  return ctx.house.walls.filter((w) => w.role === 'parapet' && w.level === 'roof').reduce((s, w) => s + wallFrame(w).length, 0);
}
