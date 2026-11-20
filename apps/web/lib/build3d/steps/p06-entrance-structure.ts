/**
 * Phase 6 · קומת כניסה — שלד: the on-grade (south) part of the entrance slab on void
 * formers, entrance columns, the mamad (dense double mesh, blast door/window steel
 * frames, vent sleeves → forms → pour), the roof slab (props + deck + edge forms →
 * rebar + conduits → pump pour) and the big reveal: every form and prop comes out and
 * the bare concrete skeleton stands.
 */
import { polygonCentroid, wallFrame } from '../house/geometry';
import type { Anim, Part, StepDef, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { PRICES, line, model, rebarKg, roundCost } from './kit';
import { ceilingSteps, type CeilingSpec } from './p05-lower-ceiling';
import {
  JOINT,
  Region,
  STRUCT_RATES,
  boundsOf,
  boxVolume,
  columnCages,
  columnForms,
  columnRect,
  edgeForms,
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
  wallRect,
  formGhosts,
  type BoxItem,
  type RodItem,
  type WallBox,
} from './structure-kit';

const LVL = 'level:entrance';

export function phaseEntranceStructure(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const steps: StepDef[] = [];
  const gradeReg = fr.regions.grade;
  const gradeOutline = gradeReg.shapes().flatMap((s) => s.outline);
  const entranceFp = ctx.footprint.entrance;
  const slide = (d: number): Vec3 => [-ctx.lot.street.inward[0] * d, 0, -ctx.lot.street.inward[1] * d];

  // ================================================================ ground slab: void formers + mesh
  const eBeams = ctx.beams.filter((b) => b.level === 'entrance');
  const beamRects = eBeams.map((b) => wallRect({ a: b.a, b: b.b, thickness: b.w }, 0.01));
  const formerReg = Region.of(gradeOutline.length ? gradeReg.shapes().map((s) => s.outline) : [], [...beamRects, ...fr.lowerWalls.cast.map((p) => pieceRect(p, 0.01))]);
  const formers: BoxItem[] = formerReg.sheets([1.0, 0.5], [gradeReg.xs[0] ?? 0, gradeReg.zs[0] ?? 0]).map((r) => ({
    at: [(r.x0 + r.x1) / 2, (fr.y.voidBottom + fr.y.gradeBottom) / 2, (r.z0 + r.z1) / 2] as Vec3,
    size: [Math.max(0.02, r.x1 - r.x0 - 0.012), fr.y.gradeBottom - fr.y.voidBottom - 0.003, Math.max(0.02, r.z1 - r.z0 - 0.012)] as Vec3,
  }));
  const gMid = (fr.y.gradeBottom + fr.y.gradeTop) / 2;
  const gGrid = slabGrid(gradeReg, gMid - 0.007, 0.25, { cover: 0.05 });
  const gSpacers: BoxItem[] = gridPoints(gradeReg, [1.2, 1.2], 0.3, [gradeReg.xs[0] + 0.6, gradeReg.zs[0] + 0.6]).map((p) => {
    const h = gMid - 0.011 - fr.y.gradeBottom;
    return { at: [p[0], fr.y.gradeBottom + h / 2, p[1]] as Vec3, size: [0.05, h, 0.05] as Vec3 };
  });
  const inUpper = (p: Vec2) => fr.regions.susp.contains(p) || fr.regions.terrace.contains(p);
  const beamReg = Region.of(beamRects);
  const gEdge = edgeForms(gradeReg, () => ({ bottom: fr.y.gradeBottom, top: fr.y.gradeTop }), (p) => inUpper(p), (p) => beamReg.contains(p));
  const gKg = rebarKg(10, rodLength(gGrid.x) + rodLength(gGrid.z));
  const gc = polygonCentroid(gradeOutline.length ? gradeOutline : entranceFp);
  const gCam = (az: number, polar = 50) => ({ bounds: boundsOf(gradeOutline, fr.y.voidBottom - 0.3, 0.6, 1.2), azimuth: az, polar });
  steps.push({
    id: 'p6-ground-slab-prep',
    phase: 6,
    titleHe: 'רצפה תלויה: ארגזי קלקר ורשת',
    materials: [
      line('ארגזי קלקר', formerReg.area, 'מ״ר', 0),
      line('רשת ברזל קוטר 10 כל 25 ס״מ', gKg / 1000, 'טון', 2),
      line('תבניות קצה', gEdge.m, 'מ׳', 0),
      line('שטח הרצפה התלויה', gradeReg.area, 'מ״ר', 0),
    ],
    costILS: roundCost(formerReg.area * STRUCT_RATES.voidFormerM2 + (gKg / 1000) * PRICES.rebarTon + gEdge.m * 0.3 * PRICES.formworkM2),
    remove: { tags: ['p5-joint-form', 'p5-curing-kit'] },
    parts: [
      {
        id: 'p6-ground-slab-prep:formers',
        shape: { kind: 'boxes', items: formers },
        material: 'insulation',
        color: '#F1EDE3',
        tags: ['void-formers', LVL],
        anim: { type: 'drop', from: [0, 0.6, 0], duration: 0.4, stagger: fit(2.4, formers.length, 0.04), order: 'near', origin: gc, ease: 'out' },
      },
      { id: 'p6-ground-slab-prep:spacers', shape: { kind: 'boxes', items: gSpacers }, material: 'block', tags: ['spacers', LVL], edges: false, anim: { type: 'grow', delay: 2.4, duration: 0.3, stagger: fit(0.6, gSpacers.length, 0.02) } },
      { id: 'p6-ground-slab-prep:x', shape: { kind: 'rods', radius: 0.005, segments: 5, items: gGrid.x }, material: 'rebar', tags: ['rebar', 'slab-rebar', LVL], anim: { type: 'rise', delay: 2.8, duration: 0.5, stagger: fit(1.3, gGrid.x.length, 0.05), order: 'z' } },
      { id: 'p6-ground-slab-prep:z', shape: { kind: 'rods', radius: 0.005, segments: 5, items: gGrid.z }, material: 'rebar', tags: ['rebar', 'slab-rebar', LVL], anim: { type: 'rise', delay: 4.0, duration: 0.5, stagger: fit(1.3, gGrid.z.length, 0.05), order: 'x' } },
      { id: 'p6-ground-slab-prep:edges', shape: { kind: 'boxes', items: gEdge.boards }, material: 'plywood', tags: ['formwork', 'edge-forms', 'p6-gs-edge-forms', LVL], anim: { type: 'rise', delay: 1.0, duration: 0.5, stagger: fit(1.4, gEdge.boards.length, 0.06), order: 'near', origin: gc } },
      { id: 'p6-ground-slab-prep:brackets', shape: { kind: 'boxes', items: gEdge.brackets }, material: 'timber', tags: ['formwork', 'edge-forms', 'p6-gs-edge-forms', LVL], anim: { type: 'rise', delay: 1.4, duration: 0.4 } },
    ],
    camera: gCam(25, 48),
    view: { xray: false },
  });

  // ================================================================ ground slab pour
  const gPump = pumpSpot(ctx, gradeReg, gc, fr.backfill);
  const gPour = slabPourParts('p6-ground-slab-pour', gradeReg, () => fr.y.gradeBottom, () => fr.y.gradeTop, gPump.origin, [LVL], { delay: 1.3, total: 4.0 });
  const tAt: Vec3 = [gc[0] + 1.2, fr.y.gradeTop, gc[1] + 1.0];
  steps.push({
    id: 'p6-ground-slab-pour',
    phase: 6,
    titleHe: 'יציקת רצפת קומת הכניסה',
    materials: [line('בטון ב-30 לרצפה', gPour.m3 * 1.03, 'מ״ק', 1), line('שטח רצפה', gPour.area, 'מ״ר', 0), line('החלקה במחליק מכני', gPour.area, 'מ״ר', 0), line('משאבת בטון', 1, 'יום', 0)],
    costILS: roundCost(gPour.m3 * 1.03 * PRICES.concreteM3 + PRICES.pumpDay + gPour.area * STRUCT_RATES.trowelM2),
    parts: [
      ...gPour.parts,
      model('p6-ground-slab-pour:pump', 'pump-truck', gPump.at, gPump.rotY, { tags: ['machine', 'pump', 'p6-gs-machine'], anim: { type: 'slide', from: slide(10), duration: 1.3 } }),
      ...trowelParts('p6-ground-slab-pour:trowel', tAt, 0.4, 5.5, [-2.6, 0, -0.8], ['p6-gs-machine', LVL]),
      model('p6-ground-slab-pour:op', 'worker', [tAt[0] - 1.2, fr.y.gradeTop, tAt[2] - 0.5], 0.4, {
        tags: ['machine', 'p6-gs-machine', LVL],
        shape: { kind: 'model', name: 'worker', seed: 44 },
        anim: { type: 'slide', delay: 5.5, duration: 2.6, from: [-2.6, 0, -0.8], ease: 'inOut' },
      }),
    ],
    camera: { bounds: pourBounds(gradeOutline, gPump, fr.y.voidBottom, 1.0), azimuth: 30, polar: 52 },
    view: { xray: false },
  });

  // ================================================================ entrance columns (cages + forms)
  const cols = fr.entranceCols;
  const cBase = (c: (typeof cols)[number]) => c.baseY;
  const cTop = (c: (typeof cols)[number]) => c.baseY + c.height;
  const cages = columnCages(cols, cBase, cTop, fr.above.entrance, 0.14);
  const floorE = (p: Vec2) => fr.entranceFloorAt(p);
  const toward = polygonCentroid(entranceFp);
  const cf = columnForms(cols, cBase, cTop, floorE, toward);
  const cExit = 'none' as const;
  const colPts = cols.flatMap((c) => columnRect(c, 0.5));
  const colCam = (az: number) => ({ bounds: boundsOf([...colPts, ...entranceFp], -0.4, fr.y.wallTopEntrance + 0.4, 0.6), azimuth: az, polar: 54 });
  const colStep: StepDef = {
    id: 'p6-columns',
    phase: 6,
    titleHe: 'עמודים בקומת הכניסה',
    materials: [
      line('עמודים', cols.length, 'יח׳', 0),
      line('ברזל זיון לעמודים', cages.kg / 1000, 'טון', 2),
      line('תבניות עמודים', cf.m2, 'מ״ר', 0),
      line('מהדקי עמודים', cf.clamps.length / 4, 'יח׳', 0),
    ],
    costILS: roundCost((cages.kg / 1000) * PRICES.rebarTon + cf.m2 * PRICES.formworkM2),
    remove: { tags: ['p6-gs-machine', 'pour-tiles'] },
    parts: [
      { id: 'p6-columns:bars', shape: { kind: 'rods', radius: 0.007, segments: 6, items: cages.bars }, material: 'rebar', tags: ['rebar', 'column-rebar', LVL], anim: { type: 'rise', duration: 0.7, stagger: fit(1.4, cages.bars.length, 0.03), order: 'x' } },
      { id: 'p6-columns:ties', shape: { kind: 'rods', radius: 0.004, segments: 4, items: cages.ties }, material: 'rebar', tags: ['rebar', 'column-rebar', LVL], anim: { type: 'grow', delay: 1.1, duration: 0.22, stagger: fit(1.6, cages.ties.length, 0.01), order: 'y' } },
      { id: 'p6-columns:ply', shape: { kind: 'boxes', items: cf.ply }, material: 'plywood', tags: ['formwork', 'p6-col-forms', LVL], anim: { type: 'drop', from: [0, 1.6, 0], delay: 3.0, duration: 0.55, stagger: fit(1.4, cf.ply.length, 0.04), order: 'x', ease: 'out' }, exit: cExit },
      { id: 'p6-columns:clamps', shape: { kind: 'boxes', items: cf.clamps }, material: 'steel', tags: ['formwork', 'p6-col-forms', LVL], anim: { type: 'drop', from: [0, 0.5, 0], delay: 4.5, duration: 0.35, stagger: fit(1.0, cf.clamps.length, 0.01), order: 'y', ease: 'out' }, exit: cExit },
      { id: 'p6-columns:braces', shape: { kind: 'rods', radius: 0.022, segments: 8, items: cf.braces }, material: 'pipeBlue', tags: ['formwork', 'p6-col-forms', LVL], anim: { type: 'rise', delay: 5.4, duration: 0.5, stagger: fit(0.8, cf.braces.length, 0.05) }, exit: cExit },
    ],
    camera: colCam(35),
    view: { xray: false },
  };
  steps.push(colStep);

  const colConcrete: BoxItem[] = cols.map((c) => ({ at: [c.center[0], (cBase(c) + cTop(c)) / 2, c.center[1]] as Vec3, size: [c.size[0], cTop(c) - cBase(c), c.size[1]] as Vec3, rotY: c.rotation ?? 0 }));
  const colM3 = boxVolume(colConcrete);
  steps.push({
    id: 'p6-columns-pour',
    phase: 6,
    titleHe: 'יציקת עמודים',
    materials: [line('בטון ב-30 לעמודים', colM3 * 1.05, 'מ״ק', 2), line('עמודים', cols.length, 'יח׳', 0)],
    costILS: roundCost(colM3 * 1.05 * PRICES.concreteM3 + 1500),
    remove: { tags: ['p6-col-forms', 'p6-gs-edge-forms'] },
    parts: [
      ...formGhosts('p6-columns-pour:forms', colStep.parts.filter((p) => p.tags?.includes('p6-col-forms')), 'p6-col-ghost', [LVL]),
      { id: 'p6-columns-pour:concrete', shape: { kind: 'boxes', items: colConcrete }, material: 'concrete', tags: ['concrete', 'columns', LVL], anim: { type: 'pour', delay: 0.4, duration: 1.6, stagger: fit(1.4, colConcrete.length, 0.15), order: 'x' } },
    ],
    camera: colCam(30),
    view: { xray: false },
  });

  // ================================================================ mamad: dense mesh + frames + sleeves
  const mam = fr.entranceWalls.cast;
  const mamWalls = Array.from(new Set(mam.map((p) => p.wall)));
  const mamPts = mamWalls.flatMap((w) => wallRect(w, 0.4));
  const mamCam = (az: number, polar = 52) => ({ bounds: boundsOf(mamPts, -0.3, fr.y.wallTopEntrance + 0.5, 0.8), azimuth: az, polar });
  const ops = ctx.house.openings.filter((o) => mamWalls.some((w) => w.id === o.wallId));
  const floorY = ctx.entrance.floorY;
  // Vent sleeves in the longest exterior mamad wall without openings.
  const fpReg = Region.of([entranceFp]);
  const exterior = (w: (typeof mamWalls)[number]) => {
    const f = wallFrame(w);
    const m = f.mid;
    const out = (k: number): Vec2 => [m[0] + f.normal[0] * k * (w.thickness / 2 + 0.15), m[1] + f.normal[1] * k * (w.thickness / 2 + 0.15)];
    return !fpReg.contains(out(1)) || !fpReg.contains(out(-1));
  };
  const ventWall = mamWalls.filter((w) => w.role === 'mamad' && !ops.some((o) => o.wallId === w.id) && exterior(w)).sort((a, b) => wallFrame(b).length - wallFrame(a).length)[0];
  const vents: Array<{ wallId: string; s: number; y: number; r: number }> = [];
  if (ventWall) {
    const L = wallFrame(ventWall).length;
    for (const s of [L * 0.3, L * 0.3 + 0.42]) vents.push({ wallId: ventWall.id, s, y: floorY + 2.45, r: 0.055 });
  }
  const meshRaw = wallMesh(mam, { spacing: 0.15, starter: 0.14, slabAbove: fr.above.entrance, dV: 12, dH: 12 });
  const mesh = { v: cutAround(meshRaw.v, mam, vents, 'v'), h: cutAround(meshRaw.h, mam, vents, 'h'), ties: meshRaw.ties, kg: meshRaw.kg };
  const trims = trimmerBars(mam, ops, floorY);
  const frames = steelFrames(mamWalls, ops, floorY);
  const ventRods: RodItem[] = vents.map((v) => {
    const w = mamWalls.find((x) => x.id === v.wallId) as (typeof mamWalls)[number];
    const f = wallFrame(w);
    const c: Vec2 = [w.a[0] + f.dir[0] * v.s, w.a[1] + f.dir[1] * v.s];
    const h = w.thickness / 2 + 0.035;
    return { a: [c[0] - f.normal[0] * h, v.y, c[1] - f.normal[1] * h], b: [c[0] + f.normal[0] * h, v.y, c[1] + f.normal[1] * h] };
  });
  const trimKg = rebarKg(12, rodLength(trims));
  steps.push({
    id: 'p6-mamad-rebar',
    phase: 6,
    titleHe: 'זיון קירות הממ״ד',
    materials: [
      line('ברזל זיון לממ״ד (רשת כפולה כל 15 ס״מ)', (mesh.kg + trimKg) / 1000, 'טון', 2),
      line('משקופי פלדה לדלת ולחלון ההדף', frames.count, 'יח׳', 0),
      line('שרוולי אוורור 4 צול', vents.length, 'יח׳', 0),
      line('אורך קירות בטון', mamWalls.reduce((s, w) => s + wallFrame(w).length, 0), 'מ׳', 1),
    ],
    costILS: roundCost(((mesh.kg + trimKg) / 1000) * PRICES.rebarTon + STRUCT_RATES.mamadFrames),
    remove: { tags: ['p6-col-ghost'] },
    parts: [
      { id: 'p6-mamad-rebar:v', shape: { kind: 'rods', radius: 0.006, segments: 5, items: mesh.v }, material: 'rebar', tags: ['rebar', 'wall-rebar', LVL], anim: { type: 'rise', duration: 0.55, stagger: fit(2.0, mesh.v.length, 0.02), order: 'near', origin: polygonCentroid(mamPts) } },
      { id: 'p6-mamad-rebar:h', shape: { kind: 'rods', radius: 0.006, segments: 5, items: mesh.h }, material: 'rebar', tags: ['rebar', 'wall-rebar', LVL], anim: { type: 'rise', delay: 1.8, duration: 0.45, stagger: fit(2.0, mesh.h.length, 0.02), order: 'y' } },
      { id: 'p6-mamad-rebar:ties', shape: { kind: 'rods', radius: 0.004, segments: 4, items: mesh.ties }, material: 'rebar', tags: ['rebar', 'wall-rebar', LVL], anim: { type: 'grow', delay: 3.6, duration: 0.3, stagger: fit(0.5, mesh.ties.length, 0.02) } },
      { id: 'p6-mamad-rebar:trims', shape: { kind: 'rods', radius: 0.006, segments: 5, items: trims }, material: 'rebar', tags: ['rebar', 'wall-rebar', LVL], anim: { type: 'grow', delay: 3.4, duration: 0.35, stagger: 0.04 } },
      { id: 'p6-mamad-rebar:frames', shape: { kind: 'boxes', items: frames.items }, material: 'steel', tags: ['mamad-frame', LVL], anim: { type: 'drop', from: [0, 1.2, 0], delay: 4.0, duration: 0.7, ease: 'bounce' } },
      { id: 'p6-mamad-rebar:vents', shape: { kind: 'rods', radius: 0.055, segments: 14, items: ventRods }, material: 'galvanized', tags: ['mamad-sleeves', LVL], anim: { type: 'grow', delay: 4.6, duration: 0.4, stagger: 0.2 } },
    ],
    camera: mamCam(-40, 54),
    view: { xray: false },
  });

  // ================================================================ mamad forms
  const mForms = wallForms(mam, Math.min(...mam.map((p) => p.y0)), Math.max(...mam.map((p) => p.y1)), { floorAt: (p) => fr.entranceFloorAt(p) });
  const blockouts = openingBlockouts(mamWalls, ops, floorY);
  const mExit = 'none' as const;
  const mFormStep: StepDef = {
    id: 'p6-mamad-forms',
    phase: 6,
    titleHe: 'טפסנות ממ״ד',
    materials: [line('תבניות דו-צדדיות לממ״ד', mForms.m2, 'מ״ר', 0), line('לוחות טפסנות', mForms.ply.length, 'יח׳', 0), line('קשרים', mForms.ties.length, 'יח׳', 0), line('תמיכות', mForms.braces.length / 2, 'יח׳', 0)],
    costILS: roundCost(mForms.m2 * PRICES.formworkM2 * 1.15),
    parts: [
      ...wallFormParts('p6-mamad-forms', mForms, ['p6-mamad-forms', LVL], 0, mExit),
      { id: 'p6-mamad-forms:blockouts', shape: { kind: 'boxes', items: blockouts }, material: 'plywood', color: '#D9A13F', tags: ['formwork', 'p6-mamad-forms', LVL], anim: { type: 'grow', delay: 0, duration: 0.5 }, exit: mExit },
    ],
    camera: mamCam(-30, 52),
    view: { xray: false },
  };
  steps.push(mFormStep);

  // ================================================================ mamad pour
  const mc = wallConcrete(mam);
  const mReg = Region.of(mam.map((p) => pieceRect(p)));
  const mPump = pumpSpot(ctx, mReg, polygonCentroid(mamPts), fr.backfill);
  const mParts: Part[] = mc.extrudes.map((e, i) => ({
    id: `p6-mamad-pour:wall${i}`,
    shape: { kind: 'extrude', outline: e.outline, holes: e.holes, y0: e.y0, y1: e.y1 },
    material: 'concrete',
    tags: ['concrete', 'walls', 'mamad', LVL],
    anim: { type: 'pour', delay: 1.4, duration: 3.2, ease: 'inOut' },
  }));
  if (mc.boxes.length)
    mParts.push({ id: 'p6-mamad-pour:pieces', shape: { kind: 'boxes', items: mc.boxes }, material: 'concrete', tags: ['concrete', 'walls', 'mamad', LVL], anim: { type: 'pour', delay: 1.4, duration: 2.6, stagger: 0.25, order: 'y' } });
  mParts.push(model('p6-mamad-pour:pump', 'pump-truck', mPump.at, mPump.rotY, { tags: ['machine', 'pump', 'p6-mamad-machine'], anim: { type: 'slide', from: slide(10), duration: 1.3 } }));
  steps.push({
    id: 'p6-mamad-pour',
    phase: 6,
    titleHe: 'יציקת הממ״ד',
    materials: [line('בטון ב-30 לקירות הממ״ד', mc.m3 * 1.04, 'מ״ק', 1), line('משאבת בטון', 1, 'יום', 0)],
    costILS: roundCost(mc.m3 * 1.04 * PRICES.concreteM3 + PRICES.pumpDay),
    remove: { tags: ['p6-mamad-forms'] },
    parts: [...formGhosts('p6-mamad-pour:forms', mFormStep.parts, 'p6-mamad-ghost', [LVL]), ...mParts],
    camera: { bounds: boundsOf([...mamPts, [mPump.tip[0], mPump.tip[2]]], -0.3, mPump.tip[1] + 0.5, 1.0), azimuth: 150, polar: 52 },
    view: { xray: false },
  });

  // ================================================================ roof: deck → rebar + conduits → pour
  const roofSupports = [...mam.map((p) => pieceRect(p)), ...cols.map((c) => columnRect(c))];
  const spec: CeilingSpec = {
    id: 'p6',
    slab: fr.regions.roof,
    slabs: [fr.regions.roof],
    top: () => fr.y.roofTop,
    bottom: () => fr.y.roofBottom,
    supports: roofSupports,
    beams: fr.entranceWalls.beams,
    floorAt: (p) => fr.entranceFloorAt(p) ?? fr.lowerFloorAt(p),
    joints: [],
    tags: ['level:roof', LVL],
    stripDelay: 0,
  };
  const roof = ceilingSteps(ctx, fr, spec);
  const deck = merge('p6-roof-deck', [
    [roof.props, 0],
    [roof.deck, 3.0],
  ]);
  deck.remove = { tags: ['p6-mamad-machine', 'p6-mamad-ghost'] };
  deck.camera = { ...roof.deck.camera, azimuth: 30, polar: 50 };
  deck.view = { xray: true };
  const rebar = merge('p6-roof-rebar', [
    [roof.rebarBottom, 0],
    [roof.conduits, 1.0],
    [roof.rebarTop, 3.4],
  ]);
  rebar.camera = { ...roof.rebarBottom.camera, azimuth: 30, polar: 42 };
  steps.push(deck, rebar, roof.pour);

  // ================================================================ strip everything: the skeleton
  const skeletonM3 =
    wallConcrete(fr.lowerWalls.cast).m3 +
    fr.regions.lowerSlab.area * (fr.y.lowerTop - fr.y.lowerBottom) +
    [...fr.lowerCols, ...cols].reduce((s, c) => s + c.size[0] * c.size[1] * c.height, 0) +
    fr.regions.ceiling.area * 0.25 +
    gradeReg.area * (fr.y.gradeTop - fr.y.gradeBottom) +
    mc.m3 +
    fr.regions.roof.area * (fr.y.roofTop - fr.y.roofBottom) +
    [...fr.lowerWalls.beams, ...fr.entranceWalls.beams].reduce((s, b) => s + (b.s1 - b.s0) * b.wall.thickness * (b.y1 - b.y0), 0);
  const deckM2 = fr.regions.ceiling.area + fr.regions.roof.area;
  steps.push({
    id: 'p6-strip-all',
    phase: 6,
    titleHe: 'פירוק טפסנות: השלד מוכן!',
    materials: [
      line('משטחי טפסנות ופרופים לפירוק', deckM2, 'מ״ר', 0),
      line('בטון בשלד: קירות, עמודים, רצפות ותקרות', skeletonM3, 'מ״ק', 0),
      line('תקרות יצוקות', 2, 'יח׳', 0),
    ],
    costILS: roundCost(deckM2 * 18),
    remove: { tags: ['formwork', 'props', 'p6-pour-machine', 'pour-tiles'] },
    parts: [],
    camera: { fit: 'house', azimuth: 40, polar: 63, zoom: 1.05, orbit: true },
    view: { xray: false },
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merges steps into one (parts' entry delays shifted), keeping the first step's metadata. */
function merge(id: string, list: Array<[StepDef, number]>): StepDef {
  const [first] = list[0];
  const parts: Part[] = [];
  const materials = list.flatMap(([s]) => s.materials);
  for (const [s, dt] of list)
    for (const p of s.parts) {
      const a: Anim = typeof p.anim === 'string' ? { type: p.anim } : { ...(p.anim ?? { type: 'rise' }) };
      a.delay = (a.delay ?? 0) + dt;
      parts.push({ ...p, anim: a });
    }
  // Keep the bill short: the first two lines of each merged step, max 5.
  const short = list.flatMap(([s]) => s.materials.slice(0, 2)).slice(0, 5);
  return { ...first, id, parts, materials: short.length ? short : materials.slice(0, 5), costILS: list.reduce((s, [x]) => s + x.costILS, 0) };
}

/** Splits mesh bars that would cross a sleeve (gap of r + 4 cm around it). */
function cutAround(rods: RodItem[], pieces: WallBox[], holes: Array<{ wallId: string; s: number; y: number; r: number }>, kind: 'v' | 'h'): RodItem[] {
  if (!holes.length) return rods;
  const out: RodItem[] = [];
  for (const r of rods) {
    let parts: RodItem[] = [r];
    for (const h of holes) {
      const w = pieces.find((p) => p.wall.id === h.wallId)?.wall;
      if (!w) continue;
      const f = wallFrame(w);
      const gap = h.r + 0.04;
      const next: RodItem[] = [];
      for (const q of parts) {
        const mx = (q.a[0] + q.b[0]) / 2 - w.a[0];
        const mz = (q.a[2] + q.b[2]) / 2 - w.a[1];
        const nOff = mx * f.normal[0] + mz * f.normal[1];
        if (Math.abs(nOff) > w.thickness / 2 + 0.01) {
          next.push(q);
          continue;
        }
        if (kind === 'v') {
          const s = mx * f.dir[0] + mz * f.dir[1];
          if (Math.abs(s - h.s) > gap || q.a[1] > h.y + gap || q.b[1] < h.y - gap) next.push(q);
          else {
            if (h.y - gap - q.a[1] > 0.1) next.push({ a: q.a, b: [q.b[0], h.y - gap, q.b[2]] });
            if (q.b[1] - (h.y + gap) > 0.1) next.push({ a: [q.a[0], h.y + gap, q.a[2]], b: q.b });
          }
        } else {
          if (Math.abs(q.a[1] - h.y) > gap) {
            next.push(q);
            continue;
          }
          const sa = (q.a[0] - w.a[0]) * f.dir[0] + (q.a[2] - w.a[1]) * f.dir[1];
          const sb = (q.b[0] - w.a[0]) * f.dir[0] + (q.b[2] - w.a[1]) * f.dir[1];
          const lo = Math.min(sa, sb);
          const hi = Math.max(sa, sb);
          if (h.s + gap < lo || h.s - gap > hi) {
            next.push(q);
            continue;
          }
          const at = (s: number): Vec3 => {
            const t = (s - sa) / (sb - sa || 1);
            return [q.a[0] + (q.b[0] - q.a[0]) * t, q.a[1], q.a[2] + (q.b[2] - q.a[2]) * t];
          };
          if (h.s - gap - lo > 0.1) next.push({ a: at(lo), b: at(h.s - gap) });
          if (hi - (h.s + gap) > 0.1) next.push({ a: at(h.s + gap), b: at(hi) });
        }
      }
      parts = next;
    }
    out.push(...parts);
  }
  return out;
}

/** 45° trimmer bars at the corners of openings, both layers, kept inside the wall. */
function trimmerBars(pieces: WallBox[], ops: Array<{ wallId: string; offset: number; width: number; sill: number; head: number }>, floorY: number): RodItem[] {
  const out: RodItem[] = [];
  for (const o of ops) {
    const piece = pieces.find((p) => p.wall.id === o.wallId);
    if (!piece) continue;
    const w = piece.wall;
    const f = wallFrame(w);
    const top = Math.max(...pieces.filter((p) => p.wall.id === w.id).map((p) => p.y1));
    const s0 = o.offset - o.width / 2;
    const s1 = o.offset + o.width / 2;
    const yb = floorY + o.sill;
    const yt = floorY + o.head;
    const corners: Array<[number, number, number, number]> = [
      [s0, yt, -1, 1],
      [s1, yt, 1, 1],
    ];
    if (o.sill > 0.2) corners.push([s0, yb, -1, -1], [s1, yb, 1, -1]);
    for (const [s, y, ds, dy] of corners)
      for (const side of [-1, 1]) {
        const n = side * (w.thickness / 2 - 0.075);
        const sa = s + ds * 0.07;
        const ya = y + dy * 0.07;
        const sb = sa + ds * 0.42;
        const yb2 = ya + dy * 0.42;
        if (sb < 0.03 || sb > f.length - 0.03 || yb2 > top - 0.04 || yb2 < w.baseY + 0.04) continue;
        const pa: Vec2 = [w.a[0] + f.dir[0] * sa + f.normal[0] * n, w.a[1] + f.dir[1] * sa + f.normal[1] * n];
        const pb: Vec2 = [w.a[0] + f.dir[0] * sb + f.normal[0] * n, w.a[1] + f.dir[1] * sb + f.normal[1] * n];
        out.push({ a: [pa[0], ya, pa[1]], b: [pb[0], yb2, pb[1]] });
      }
  }
  return out;
}

/** Steel frames lining blast door / window openings (jambs, head, sill), flush + 4 mm proud. */
function steelFrames(walls: Array<{ id: string; a: Vec2; b: Vec2; thickness: number }>, ops: Array<{ wallId: string; kind: string; offset: number; width: number; sill: number; head: number }>, floorY: number) {
  const items: BoxItem[] = [];
  let count = 0;
  for (const o of ops) {
    if (o.kind !== 'mamad-door' && o.kind !== 'mamad-window') continue;
    const w = walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    count += 1;
    const f = wallFrame(w);
    const P = (s: number): Vec2 => [w.a[0] + f.dir[0] * s, w.a[1] + f.dir[1] * s];
    const s0 = o.offset - o.width / 2;
    const s1 = o.offset + o.width / 2;
    const y0 = floorY + o.sill;
    const y1 = floorY + o.head;
    const T = w.thickness + 0.008;
    const k = 0.06;
    for (const s of [s0 + k / 2, s1 - k / 2]) {
      const c = P(s);
      items.push({ at: [c[0], (y0 + y1) / 2, c[1]], size: [k, y1 - y0, T], rotY: f.rotY });
    }
    const cm = P((s0 + s1) / 2);
    items.push({ at: [cm[0], y1 - k / 2, cm[1]], size: [s1 - s0 - 2 * k - JOINT, k, T], rotY: f.rotY });
    if (o.sill > 0.2) items.push({ at: [cm[0], y0 + k / 2, cm[1]], size: [s1 - s0 - 2 * k - JOINT, k, T], rotY: f.rotY });
  }
  return { items, count };
}

/** Plywood blockouts filling openings inside their steel frames (removed with the forms). */
function openingBlockouts(walls: Array<{ id: string; a: Vec2; b: Vec2; thickness: number }>, ops: Array<{ wallId: string; kind: string; offset: number; width: number; sill: number; head: number }>, floorY: number): BoxItem[] {
  const out: BoxItem[] = [];
  for (const o of ops) {
    const w = walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const f = wallFrame(w);
    const framed = o.kind === 'mamad-door' || o.kind === 'mamad-window';
    const k = framed ? 0.062 : 0.004;
    const y0 = floorY + o.sill + (framed && o.sill > 0.2 ? k : 0.004);
    const y1 = floorY + o.head - k;
    const c: Vec2 = [w.a[0] + f.dir[0] * o.offset, w.a[1] + f.dir[1] * o.offset];
    out.push({ at: [c[0], (y0 + y1) / 2, c[1]], size: [o.width - 2 * k, y1 - y0, w.thickness - 0.004], rotY: f.rotY });
  }
  return out;
}
