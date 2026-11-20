/**
 * Phase 4 · קומה תחתונה — שלד: retaining / concrete walls of the lower floor (two-layer
 * mesh → double-sided forms with studs, walers and ties → pour → strip), waterproofing
 * on the soil side (bitumen, protection board, perforated drain in gravel), backfill
 * (terrain swap), slab on grade (gravel, poly sheet, mesh on spacers, pour sweep from the
 * pump hose, power trowel) and the lower columns (cages → forms → pour).
 */
import { pointInPolygon, polygonCentroid, sampleGrid, volumeBetween } from '../house/geometry';
import type { Part, StepDef, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { EXTRA_RATES, PRICES, line, model, rebarKg, roundCost } from './kit';
import {
  Region,
  STRUCT_RATES,
  bandBox,
  bandRange,
  boundsOf,
  boxVolume,
  columnCages,
  columnForms,
  columnRect,
  divide,
  edgePoint,
  fit,
  gridPoints,
  pieceRect,
  pourBounds,
  pumpSpot,
  rodLength,
  slabGrid,
  slabPourParts,
  structureFrame,
  trowelParts,
  wallConcrete,
  wallFormParts,
  wallForms,
  wallMesh,
  type BoxItem,
  type FaceEdge,
  type RodItem,
} from './structure-kit';

const LVL = 'level:lower';

export function phaseLowerStructure(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const { cast } = fr.lowerWalls;
  const y0 = ctx.y.lowerBeamTop;
  const y1 = fr.y.wallTopLower;
  const fpLower = ctx.footprint.lower;
  const wallReg = Region.of(cast.map((p) => pieceRect(p)));
  const wallPts = cast.flatMap((p) => pieceRect(p));
  const wallCam = (azimuth: number, polar = 56, grow = 2.2) => ({ bounds: boundsOf(wallPts, ctx.y.pitFloor, y1 + 0.4, grow), azimuth, polar });
  const eastEnd: Vec2 = wallPts.reduce((b, p) => (p[0] > b[0] ? p : b), wallPts[0] ?? [0, 0]);
  const steps: StepDef[] = [];

  // ================================================================ retaining rebar
  const mesh = wallMesh(cast, { spacing: 0.2, starter: 0.2, slabAbove: fr.above.lower, dV: 14, dH: 12 });
  const crewAt = (k: number): Vec3 => {
    const c = polygonCentroid(fpLower);
    const a = wallReg.empty ? c : (edgeInside(wallReg, fpLower)?.mid ?? c);
    return [a[0] + (k - 0.5) * 1.6, ctx.y.gravelTop, a[1] - 1.4];
  };
  steps.push({
    id: 'p4-retaining-rebar',
    phase: 4,
    titleHe: 'זיון קירות תומכים',
    materials: [
      line('ברזל זיון לקירות (רשת כפולה)', mesh.kg / 1000, 'טון', 2),
      line('מוטות אנכיים קוטר 14 כל 20 ס״מ', mesh.v.length, 'יח׳', 0),
      line('מוטות אופקיים קוטר 12 כל 20 ס״מ', mesh.h.length, 'יח׳', 0),
      line('אורך קירות תומכים', cast.reduce((s, p) => s + (p.s1 - p.s0), 0), 'מ׳', 1),
    ],
    costILS: roundCost((mesh.kg / 1000) * PRICES.rebarTon),
    parts: [
      {
        id: 'p4-retaining-rebar:v',
        shape: { kind: 'rods', radius: 0.007, segments: 6, items: mesh.v },
        material: 'rebar',
        tags: ['rebar', 'wall-rebar', LVL],
        anim: { type: 'rise', duration: 0.55, stagger: fit(2.2, mesh.v.length, 0.03), order: 'near', origin: eastEnd },
      },
      {
        id: 'p4-retaining-rebar:h',
        shape: { kind: 'rods', radius: 0.006, segments: 6, items: mesh.h },
        material: 'rebar',
        tags: ['rebar', 'wall-rebar', LVL],
        anim: { type: 'rise', delay: 1.9, duration: 0.5, stagger: fit(2.0, mesh.h.length, 0.03), order: 'y' },
      },
      {
        id: 'p4-retaining-rebar:ties',
        shape: { kind: 'rods', radius: 0.004, segments: 4, items: mesh.ties },
        material: 'rebar',
        tags: ['rebar', 'wall-rebar', LVL],
        anim: { type: 'grow', delay: 3.9, duration: 0.3, stagger: fit(0.6, mesh.ties.length, 0.02) },
      },
      model('p4-retaining-rebar:bundle', 'rebar-bundle', crewAt(2.2), 0.2, { tags: ['machine', 'p4-crew', LVL], anim: { type: 'drop', from: [0, 2, 0], duration: 0.8 } }),
      model('p4-retaining-rebar:w1', 'worker', crewAt(0), Math.PI / 2, { tags: ['machine', 'p4-crew', LVL], shape: { kind: 'model', name: 'worker', seed: 4 } }),
      model('p4-retaining-rebar:w2', 'worker', crewAt(1.1), Math.PI / 2 + 0.4, { tags: ['machine', 'p4-crew', LVL], shape: { kind: 'model', name: 'worker', seed: 9 } }),
    ],
    camera: wallCam(200, 60),
    view: { xray: false },
  });

  // ================================================================ retaining forms
  const inPit = (p: Vec2) => pointInPolygon(p, fpLower);
  const forms = wallForms(cast, y0, y1, { floorAt: (p) => (inPit(p) ? ctx.y.gravelTop : null) });
  steps.push({
    id: 'p4-retaining-forms',
    phase: 4,
    titleHe: 'טפסנות קירות תומכים',
    materials: [
      line('תבניות דו-צדדיות לקירות', forms.m2 * 1, 'מ״ר', 0),
      line('לוחות טפסנות', forms.ply.length, 'יח׳', 0),
      line('קשרים (ברגי טפסנות)', forms.ties.length, 'יח׳', 0),
      line('קורות חיזוק (ווילרים)', forms.walers.length, 'יח׳', 0),
      line('תמיכות דחיפה-משיכה', forms.braces.length / 2, 'יח׳', 0),
    ],
    costILS: roundCost(forms.m2 * PRICES.formworkM2),
    remove: { tags: ['p4-crew'] },
    parts: wallFormParts('p4-retaining-forms', forms, ['p4-wall-forms', LVL]),
    camera: wallCam(160, 58),
    view: { xray: false },
  });

  // ================================================================ retaining pour
  const wc = wallConcrete(cast);
  const wallPump = pumpSpot(ctx, wallReg, polygonCentroid(wallPts), ctx.terrain.excavated, fr.backfill);
  const pourParts: Part[] = [
    ...wc.extrudes.map(
      (e, i): Part => ({
        id: `p4-retaining-pour:wall${i}`,
        shape: { kind: 'extrude', outline: e.outline, holes: e.holes, y0: e.y0, y1: e.y1 },
        material: 'concrete',
        tags: ['concrete', 'walls', 'retaining', LVL],
        anim: { type: 'pour', delay: 1.4, duration: 3.4, ease: 'inOut' },
      }),
    ),
  ];
  if (wc.boxes.length)
    pourParts.push({
      id: 'p4-retaining-pour:pieces',
      shape: { kind: 'boxes', items: wc.boxes },
      material: 'concrete',
      tags: ['concrete', 'walls', 'retaining', LVL],
      anim: { type: 'pour', delay: 1.4, duration: 2.4, stagger: 0.2 },
    });
  pourParts.push(
    model('p4-retaining-pour:pump', 'pump-truck', wallPump.at, wallPump.rotY, {
      tags: ['machine', 'pump', 'p4-pump-walls'],
      anim: { type: 'slide', from: slideIn(ctx, 10), duration: 1.3 },
    }),
  );
  steps.push({
    id: 'p4-retaining-pour',
    phase: 4,
    titleHe: 'יציקת קירות תומכים',
    materials: [line('בטון ב-30 עם מוסף אטימות', wc.m3 * 1.04, 'מ״ק', 1), line('משאבת בטון', 1, 'יום', 0), line('מערבלי בטון', Math.ceil((wc.m3 * 1.04) / 8), 'נסיעות', 0)],
    costILS: roundCost(wc.m3 * 1.04 * PRICES.concreteM3 + PRICES.pumpDay),
    parts: pourParts,
    camera: { bounds: pourBounds(wallPts, wallPump, ctx.y.pitFloor, y1 + 1), azimuth: 150, polar: 55 },
    view: { xray: false },
  });

  // ================================================================ strip
  const plugs: BoxItem[] = forms.ties.flatMap((t) => {
    const a: Vec2 = [t.a[0], t.a[2]];
    const b: Vec2 = [t.b[0], t.b[2]];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u: Vec2 = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Wall thickness along the tie = distance between the two faces it crosses.
    const half = halfThicknessAt(cast, mid);
    if (!half) return [];
    const rotY = Math.atan2(u[0], u[1]);
    return [-1, 1].map((q) => ({ at: [mid[0] + u[0] * q * (half + 0.0015), t.a[1], mid[1] + u[1] * q * (half + 0.0015)] as Vec3, size: [0.035, 0.035, 0.003] as Vec3, rotY }));
  });
  steps.push({
    id: 'p4-retaining-strip',
    phase: 4,
    titleHe: 'פירוק טפסות',
    materials: [line('פירוק תבניות קירות', forms.m2, 'מ״ר', 0), line('איטום חורי קשרים', plugs.length, 'יח׳', 0)],
    costILS: roundCost(plugs.length * 8),
    remove: { tags: ['p4-wall-forms', 'p4-pump-walls'] },
    parts: [
      {
        id: 'p4-retaining-strip:plugs',
        shape: { kind: 'boxes', items: plugs },
        material: 'drain',
        tags: ['tie-plugs', LVL],
        edges: false,
        anim: { type: 'fade', delay: 1.4, duration: 0.8 },
      },
    ],
    camera: wallCam(170, 58),
    view: { xray: false },
  });

  // ================================================================ waterproofing (soil side)
  const soil = wallReg.edges().filter((e) => !inPit(edgePoint(e, e.len / 2, 0.5)));
  const bitumen: BoxItem[] = [];
  const boards: BoxItem[] = [];
  const gravelFoot: BoxItem[] = [];
  const drain: RodItem[] = [];
  let skinM2 = 0;
  const beamW = 0.3;
  const footTop = ctx.y.lowerBeamTop - 0.27;
  for (const e of soil) {
    const [b0, b1] = bandRange(e, 0.008, 0.014);
    bitumen.push(bandBox(e, b0, b1, 0.008, 0.014, y0 + 0.002, y1 - 0.06));
    skinM2 += e.len * (y1 - y0);
    const [p0, p1] = bandRange(e, 0.016, 0.028);
    const cols = divide(p0, p1, 1.0);
    for (let i = 0; i < cols.length - 1; i++) boards.push(bandBox(e, cols[i] + 0.003, cols[i + 1] - 0.003, 0.016, 0.028, y0 + 0.01, y1 - 0.16));
    const dp = (beamW - 0.2) / 2 + 0.09;
    const [d0, d1] = bandRange(e, dp, dp);
    const pa = edgePoint(e, d0, dp);
    const pb = edgePoint(e, d1, dp);
    const yp = ctx.y.pitFloor + 0.11;
    if (d1 - d0 > 0.05) drain.push({ a: [pa[0], yp, pa[1]], b: [pb[0], yp, pb[1]] });
    const [g0, g1] = bandRange(e, 0.03, 0.24);
    gravelFoot.push(bandBox(e, g0, g1, 0.03, 0.24, ctx.y.pitFloor + 0.003, footTop));
  }
  const drainLen = rodLength(drain);
  const holes: RodItem[] = drain.flatMap((r) => {
    const L = Math.hypot(r.b[0] - r.a[0], r.b[2] - r.a[2]);
    const n = Math.max(1, Math.floor(L / 0.12));
    const out: RodItem[] = [];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = r.a[0] + (r.b[0] - r.a[0]) * t;
      const z = r.a[2] + (r.b[2] - r.a[2]) * t;
      const ux = (r.b[0] - r.a[0]) / L;
      const uz = (r.b[2] - r.a[2]) / L;
      out.push({ a: [x - ux * 0.008, r.a[1], z - uz * 0.008], b: [x + ux * 0.008, r.a[1], z + uz * 0.008] });
    }
    return out;
  });
  steps.push({
    id: 'p4-waterproofing',
    phase: 4,
    titleHe: 'איטום קירות תומכים',
    materials: [
      line('איטום ביטומני בצד הקרקע', skinM2, 'מ״ר', 0),
      line('לוחות הגנה', boards.length, 'יח׳', 0),
      line('צינור ניקוז מחורר 110 מ״מ', drainLen, 'מ׳', 0),
      line('חצץ ניקוז סביב הצינור', boxVolume(gravelFoot), 'מ״ק', 1),
    ],
    costILS: roundCost(skinM2 * PRICES.retainingWaterproofM2 + drainLen * STRUCT_RATES.drainPipeM),
    parts: [
      { id: 'p4-waterproofing:bitumen', shape: { kind: 'boxes', items: bitumen }, material: 'bitumen', tags: ['waterproofing', LVL], anim: { type: 'rise', duration: 1.0, stagger: fit(1.4, bitumen.length, 0.2), order: 'x' } },
      { id: 'p4-waterproofing:boards', shape: { kind: 'boxes', items: boards }, material: 'insulation', color: '#56656C', tags: ['waterproofing', LVL], anim: { type: 'drop', from: [0, 1.0, 0], delay: 1.6, duration: 0.5, stagger: fit(1.4, boards.length, 0.08), order: 'x', ease: 'out' } },
      { id: 'p4-waterproofing:gravel', shape: { kind: 'boxes', items: gravelFoot }, material: 'gravel', tags: ['drainage', LVL], anim: { type: 'rise', delay: 3.0, duration: 0.8 } },
      { id: 'p4-waterproofing:drain', shape: { kind: 'rods', radius: 0.055, segments: 12, items: drain }, material: 'drain', color: '#D8B64A', tags: ['drainage', LVL], edges: false, anim: { type: 'rise', delay: 3.4, duration: 0.9, stagger: 0.15 } },
      { id: 'p4-waterproofing:holes', shape: { kind: 'rods', radius: 0.057, segments: 12, items: holes }, material: 'ink', color: '#7A6A2E', tags: ['drainage', LVL], edges: false, anim: { type: 'fade', delay: 4.0, duration: 0.5 } },
    ],
    camera: wallCam(20, 50, 2.5),
    view: { groundXray: true, xray: false },
  });

  // ================================================================ backfill
  const { excavated, natural, baseY } = ctx.terrain;
  const backfill = fr.backfill;
  const fillM3 = volumeBetween(backfill, excavated);
  // Filter gravel column behind the wall, up to the fill level (in ≤ 1 m pieces).
  const column: BoxItem[] = [];
  for (const e of soil) {
    const [c0, c1] = bandRange(e, 0.03, 0.3);
    const cuts = divide(c0, c1, 1.0);
    for (let i = 0; i < cuts.length - 1; i++) {
      const s = (cuts[i] + cuts[i + 1]) / 2;
      const q = edgePoint(e, Math.min(e.len, Math.max(0, s)), 0.55);
      const fill = sampleGrid(backfill, q[0], q[1]);
      const top = Math.min(y1 - 0.1, fill + 0.012);
      if (top < footTop + 0.4) continue;
      column.push(bandBox(e, cuts[i], cuts[i + 1], 0.03, 0.3, footTop, top));
    }
  }
  const gradeC = fr.slabs.grade ? polygonCentroid(fr.slabs.grade.outline) : polygonCentroid(ctx.footprint.entrance);
  const exAt: Vec3 = [gradeC[0], sampleGrid(backfill, gradeC[0], gradeC[1]), gradeC[1] + 1.2];
  steps.push({
    id: 'p4-backfill',
    phase: 4,
    titleHe: 'מילוי חוזר',
    materials: [
      line('מילוי חוזר מהודק בשכבות', fillM3, 'מ״ק', 0),
      line('חצץ מסנן מאחורי הקירות', boxVolume(column), 'מ״ק', 1),
      line('הידוק בשכבות של 20 ס״מ', Math.ceil(fillM3 / Math.max(1, ctx.footprint.entranceGroundArea * 0.2)), 'שכבות', 0),
    ],
    costILS: roundCost(fillM3 * STRUCT_RATES.backfillM3 + boxVolume(column) * EXTRA_RATES.gravelM3),
    remove: { ids: ['terrain-excavated'] },
    parts: [
      {
        id: 'terrain-backfill',
        shape: { kind: 'terrain', grid: backfill, from: excavated, ref: natural, baseY },
        material: 'soil',
        tags: ['ground', 'terrain'],
        anim: { type: 'morph', delay: 0.9, duration: 3.6, ease: 'inOut' },
      },
      { id: 'p4-backfill:gravel', shape: { kind: 'boxes', items: column }, material: 'gravel', tags: ['drainage', LVL], anim: { type: 'rise', delay: 0.6, duration: 3.0, ease: 'inOut' } },
      model('p4-backfill:excavator', 'excavator', exAt, Math.PI / 2, {
        tags: ['machine', 'p4-backfill-machine'],
        anim: { type: 'slide', from: slideIn(ctx, 7), duration: 1.3 },
      }),
    ],
    camera: { bounds: boundsOf([...wallPts, ...(fr.slabs.grade?.outline ?? [])], ctx.y.pitFloor, 1.5, 2), azimuth: 25, polar: 52 },
    view: { xray: false },
  });

  // ================================================================ sub-base + poly
  const slabReg = fr.regions.lowerSlab;
  const shapes = slabReg.shapes();
  const gravelTop = fr.y.lowerBottom - 0.015;
  const polyY = fr.y.lowerBottom + 0.0015;
  const strips = slabReg.tiles([2.0, 60], [slabReg.xs[0], slabReg.zs[0]]);
  const poly: BoxItem[] = strips.map((r, i) => ({
    at: [(r.x0 + r.x1) / 2, polyY + (i % 2) * 0.0009, (r.z0 + r.z1) / 2] as Vec3,
    size: [r.x1 - r.x0 + 0.06, 0.0012, r.z1 - r.z0] as Vec3,
  }));
  const subM3 = slabReg.area * (gravelTop - ctx.y.gravelTop);
  const sc = polygonCentroid(fpLower);
  steps.push({
    id: 'p4-subbase',
    phase: 4,
    titleHe: 'מצע ויריעת פוליאתילן',
    materials: [
      line('מצע חצץ מהודק', subM3, 'מ״ק', 1),
      line('יריעת פוליאתילן 0.3 מ״מ', slabReg.area * 1.12, 'מ״ר', 0),
      line('שטח הרצפה', slabReg.area, 'מ״ר', 1),
    ],
    costILS: roundCost(subM3 * EXTRA_RATES.gravelM3 + slabReg.area * (EXTRA_RATES.compactionM2 + STRUCT_RATES.polySheetM2)),
    remove: { tags: ['p4-backfill-machine'] },
    parts: [
      ...shapes.map(
        (sh, i): Part => ({
          id: `p4-subbase:gravel${i}`,
          shape: { kind: 'extrude', outline: sh.outline, holes: sh.holes, y0: ctx.y.gravelTop + 0.004, y1: gravelTop },
          material: 'gravel',
          tags: ['gravel', 'subbase', LVL],
          anim: { type: 'rise', delay: 0.3, duration: 2.0, ease: 'inOut' },
        }),
      ),
      {
        id: 'p4-subbase:poly',
        shape: { kind: 'boxes', items: poly },
        material: 'poly',
        tags: ['poly', LVL],
        edges: false,
        anim: { type: 'slide', from: [0, 0.35, -1.2], delay: 2.3, duration: 0.8, stagger: fit(1.6, poly.length, 0.25), order: 'x', ease: 'out' },
      },
      model('p4-subbase:w1', 'worker', [sc[0] - 1.2, polyY, sc[1] + 1.0], 0.6, { tags: ['machine', 'p4-subbase-crew', LVL], shape: { kind: 'model', name: 'worker', seed: 12 } }),
      model('p4-subbase:w2', 'worker', [sc[0] + 1.6, polyY, sc[1] - 0.8], 2.4, { tags: ['machine', 'p4-subbase-crew', LVL], shape: { kind: 'model', name: 'worker', seed: 3 } }),
      model('p4-subbase:barrow', 'wheelbarrow', [sc[0] + 0.4, polyY, sc[1] + 1.8], 0.3, { tags: ['machine', 'p4-subbase-crew', LVL] }),
    ],
    camera: { bounds: boundsOf(fpLower, ctx.y.pitFloor, y1, 1.5), azimuth: 195, polar: 52 },
    view: { xray: false },
  });

  // ================================================================ mesh on spacers
  const midY = (fr.y.lowerBottom + fr.y.lowerTop) / 2;
  const grid = slabGrid(slabReg, midY - 0.007, 0.25, { cover: 0.05 });
  const spacers: BoxItem[] = gridPoints(slabReg, [1.0, 1.0], 0.25, [slabReg.xs[0] + 0.5, slabReg.zs[0] + 0.5]).map((p) => {
    const h = midY - 0.007 - 0.004 - (polyY + 0.001);
    return { at: [p[0], polyY + 0.001 + h / 2, p[1]] as Vec3, size: [0.05, h, 0.05] as Vec3 };
  });
  const meshKg = rebarKg(8, rodLength(grid.x) + rodLength(grid.z));
  steps.push({
    id: 'p4-slab-mesh',
    phase: 4,
    titleHe: 'רשת ברזל לרצפה',
    materials: [
      line('רשת ברזל קוטר 8 כל 25 ס״מ', meshKg / 1000, 'טון', 2),
      line('קוביות מרווח', spacers.length, 'יח׳', 0),
      line('שטח רשת', slabReg.area, 'מ״ר', 0),
    ],
    costILS: roundCost((meshKg / 1000) * PRICES.rebarTon + spacers.length * 3),
    remove: { tags: ['p4-subbase-crew'] },
    parts: [
      { id: 'p4-slab-mesh:spacers', shape: { kind: 'boxes', items: spacers }, material: 'block', tags: ['spacers', LVL], edges: false, anim: { type: 'grow', duration: 0.3, stagger: fit(1.0, spacers.length, 0.03), order: 'near', origin: sc } },
      { id: 'p4-slab-mesh:x', shape: { kind: 'rods', radius: 0.004, segments: 4, items: grid.x }, material: 'rebar', tags: ['rebar', 'slab-rebar', LVL], anim: { type: 'rise', delay: 1.0, duration: 0.5, stagger: fit(1.6, grid.x.length, 0.05), order: 'z' } },
      { id: 'p4-slab-mesh:z', shape: { kind: 'rods', radius: 0.004, segments: 4, items: grid.z }, material: 'rebar', tags: ['rebar', 'slab-rebar', LVL], anim: { type: 'rise', delay: 2.6, duration: 0.5, stagger: fit(1.6, grid.z.length, 0.05), order: 'x' } },
    ],
    camera: { bounds: boundsOf(fpLower, ctx.y.pitFloor, y1, 1), azimuth: 200, polar: 46 },
    view: { xray: false },
  });

  // ================================================================ slab pour + trowel
  const slabPump = pumpSpot(ctx, slabReg, sc, backfill);
  const pour = slabPourParts('p4-slab-pour', slabReg, () => fr.y.lowerBottom, () => fr.y.lowerTop, slabPump.origin, [LVL], { delay: 1.3, total: 4.2 });
  const trowelAt: Vec3 = [sc[0] - 1.5, fr.y.lowerTop, sc[1]];
  steps.push({
    id: 'p4-slab-pour',
    phase: 4,
    titleHe: 'יציקת רצפת הקומה התחתונה',
    materials: [
      line('בטון ב-30 לרצפה', pour.m3 * 1.04, 'מ״ק', 1),
      line('שטח רצפה', pour.area, 'מ״ר', 0),
      line('החלקה במחליק מכני', pour.area, 'מ״ר', 0),
      line('משאבת בטון', 1, 'יום', 0),
    ],
    costILS: roundCost(pour.m3 * 1.04 * PRICES.concreteM3 + PRICES.pumpDay + pour.area * STRUCT_RATES.trowelM2),
    parts: [
      ...pour.parts,
      model('p4-slab-pour:pump', 'pump-truck', slabPump.at, slabPump.rotY, { tags: ['machine', 'pump', 'p4-slab-machine'], anim: { type: 'slide', from: slideIn(ctx, 10), duration: 1.3 } }),
      ...trowelParts('p4-slab-pour:trowel', trowelAt, 0, 5.6, [-2.8, 0, 0.6], ['p4-slab-machine', LVL]),
      model('p4-slab-pour:op', 'worker', [trowelAt[0] - 1.3, fr.y.lowerTop, trowelAt[2]], 0, {
        tags: ['machine', 'p4-slab-machine', LVL],
        shape: { kind: 'model', name: 'worker', seed: 21 },
        anim: { type: 'slide', delay: 5.6, duration: 2.6, from: [-2.8, 0, 0.6], ease: 'inOut' },
      }),
    ],
    camera: { bounds: pourBounds(fpLower, slabPump, ctx.y.pitFloor, y1), azimuth: 175, polar: 54 },
    view: { xray: false },
  });

  // ================================================================ columns
  const cols = fr.lowerCols;
  const colTop = (c: (typeof cols)[number]) => c.baseY + c.height;
  const cages = columnCages(cols, fr.y.lowerTop, (c) => colTop(c), fr.above.lower, 0.2);
  const colPts = cols.flatMap((c) => columnRect(c, 0.6));
  const colCam = (az: number) => ({ bounds: boundsOf([...colPts, ...fpLower], fr.y.lowerTop - 0.3, y1 + 0.5, 0.6), azimuth: az, polar: 55 });
  steps.push({
    id: 'p4-columns-rebar',
    phase: 4,
    titleHe: 'זיון עמודים',
    materials: [
      line('כלובי עמודים', cols.length, 'יח׳', 0),
      line('ברזל ראשי קוטר 14', rebarKg(14, rodLength(cages.bars)) / 1000, 'טון', 2),
      line('חישוקים קוטר 8', cages.ties.length / 4, 'יח׳', 0),
    ],
    costILS: roundCost((cages.kg / 1000) * PRICES.rebarTon),
    remove: { tags: ['p4-slab-machine'] },
    parts: [
      { id: 'p4-columns-rebar:bars', shape: { kind: 'rods', radius: 0.007, segments: 6, items: cages.bars }, material: 'rebar', tags: ['rebar', 'column-rebar', LVL], anim: { type: 'rise', duration: 0.7, stagger: fit(1.6, cages.bars.length, 0.05), order: 'x' } },
      { id: 'p4-columns-rebar:ties', shape: { kind: 'rods', radius: 0.004, segments: 4, items: cages.ties }, material: 'rebar', tags: ['rebar', 'column-rebar', LVL], anim: { type: 'grow', delay: 1.4, duration: 0.25, stagger: fit(2.4, cages.ties.length, 0.02), order: 'y' } },
    ],
    camera: colCam(200),
    view: { xray: false },
  });

  const toward = polygonCentroid(fpLower);
  const floorLower = (p: Vec2) => (slabReg.contains(p) ? fr.y.lowerTop : null);
  const cf = columnForms(cols, () => fr.y.lowerTop, colTop, floorLower, toward);
  const colExit = { type: 'lift' as const, delay: 2.9, duration: 0.8 };
  steps.push({
    id: 'p4-columns-forms',
    phase: 4,
    titleHe: 'טפסות עמודים',
    materials: [line('תבניות עמודים', cf.m2, 'מ״ר', 0), line('מהדקי עמודים', cf.clamps.length / 4, 'יח׳', 0), line('תמיכות אנך', cf.braces.length, 'יח׳', 0)],
    costILS: roundCost(cf.m2 * PRICES.formworkM2),
    parts: [
      { id: 'p4-columns-forms:ply', shape: { kind: 'boxes', items: cf.ply }, material: 'plywood', tags: ['formwork', 'p4-col-forms', LVL], anim: { type: 'drop', from: [0, 1.6, 0], duration: 0.6, stagger: fit(1.8, cf.ply.length, 0.08), order: 'x', ease: 'out' }, exit: colExit },
      { id: 'p4-columns-forms:clamps', shape: { kind: 'boxes', items: cf.clamps }, material: 'steel', tags: ['formwork', 'p4-col-forms', LVL], anim: { type: 'drop', from: [0, 0.6, 0], delay: 1.9, duration: 0.4, stagger: fit(1.4, cf.clamps.length, 0.02), order: 'y', ease: 'out' }, exit: colExit },
      { id: 'p4-columns-forms:braces', shape: { kind: 'rods', radius: 0.022, segments: 8, items: cf.braces }, material: 'pipeBlue', tags: ['formwork', 'p4-col-forms', LVL], anim: { type: 'rise', delay: 3.3, duration: 0.5, stagger: 0.08 }, exit: colExit },
    ],
    camera: colCam(205),
    view: { xray: false },
  });

  const colConcrete: BoxItem[] = cols.map((c) => ({
    at: [c.center[0], (fr.y.lowerTop + colTop(c)) / 2, c.center[1]] as Vec3,
    size: [c.size[0], colTop(c) - fr.y.lowerTop, c.size[1]] as Vec3,
    rotY: c.rotation ?? 0,
  }));
  const colM3 = boxVolume(colConcrete);
  steps.push({
    id: 'p4-columns-pour',
    phase: 4,
    titleHe: 'יציקת עמודים',
    materials: [line('בטון ב-30 לעמודים', colM3 * 1.05, 'מ״ק', 2), line('עמודים', cols.length, 'יח׳', 0)],
    costILS: roundCost(colM3 * 1.05 * PRICES.concreteM3 + 1500),
    remove: { tags: ['p4-col-forms'] },
    parts: [
      {
        id: 'p4-columns-pour:concrete',
        shape: { kind: 'boxes', items: colConcrete },
        material: 'concrete',
        tags: ['concrete', 'columns', LVL],
        anim: { type: 'pour', delay: 0.4, duration: 1.6, stagger: fit(1.2, colConcrete.length, 0.25), order: 'x' },
      },
    ],
    camera: colCam(195),
    view: { xray: false },
  });

  return steps;
}

/** Slide-in offset for vehicles: from the street side. */
function slideIn(ctx: BuildContext, d: number): Vec3 {
  return [-ctx.lot.street.inward[0] * d, 0, -ctx.lot.street.inward[1] * d];
}

/** A wall-group face that looks into the pit (for placing the crew), with its mid point. */
function edgeInside(reg: Region, fp: Vec2[]): { e: FaceEdge; mid: Vec2 } | null {
  let best: { e: FaceEdge; mid: Vec2 } | null = null;
  for (const e of reg.edges()) {
    const q = edgePoint(e, e.len / 2, 1.2);
    if (!pointInPolygon(q, fp)) continue;
    if (!best || e.len > best.e.len) best = { e, mid: q };
  }
  return best;
}

/** Half thickness of the cast wall piece under a plan point (0 if none). */
function halfThicknessAt(cast: ReturnType<typeof structureFrame>['lowerWalls']['cast'], p: Vec2): number {
  for (const c of cast) if (pointInPolygon(p, pieceRect(c, 0.01))) return c.wall.thickness / 2;
  return 0;
}

