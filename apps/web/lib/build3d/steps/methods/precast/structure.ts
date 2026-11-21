/**
 * Precast phases 4-6: the mobile crane arrives, wall panels and hollow-core planks fly in one by one,
 * a thin topping ties the floor together, and the precast ממ״ד module is lowered in one piece.
 * Shared steps (retaining walls, slab on grade, ground slab) come from the concrete builders via pick().
 */
import { polygonCentroid, wallFrame, wallPieces } from '../../../house/geometry';
import type { Anim, Part, StepDef, Vec2, Vec3 } from '../../../engine/types';
import type { BuildContext } from '../../context';
import { levelFloor, cornerCuts } from '../../envelope-kit';
import { PRICES, line, roundCost } from '../../kit';
import { phaseLowerStructure } from '../../p04-lower-structure';
import { phaseEntranceStructure } from '../../p06-entrance-structure';
import {
  Region,
  boundsOf,
  fit,
  pourBounds,
  pumpPart,
  pumpSpot,
  slabGrid,
  slabPourParts,
  structureFrame,
  rodLength,
  type BoxItem,
} from '../../structure-kit';
import { pick } from '../compose';
import {
  HOLLOW_GREY,
  PRECAST_GREY,
  PRECAST_RATES,
  columnItems,
  cranePart,
  craneStand,
  panelShape,
  plankPlan,
  precastPlan,
  propsFor,
  reachTo,
  totalM2,
  totalM3,
  type Panel,
} from './kit';

const swap = { anim: 'none' as const, exit: 'none' as const };

/** A shared step with extra removals appended (the concrete builder's own def is not touched). */
const alsoRemove = (def: StepDef, tags: string[]): StepDef => ({ ...def, remove: { ...def.remove, tags: [...(def.remove?.tags ?? []), ...tags] } });

const R2 = (n: number) => Math.round(n * 10) / 10;

function panelBounds(panels: Panel[], y0: number, y1: number, extra: Vec2[] = [], grow = 1.4) {
  const pts: Vec2[] = panels.flatMap((p) => [
    [p.center[0] + p.dir[0] * (p.s1 - p.s0) / 2, p.center[1] + p.dir[1] * (p.s1 - p.s0) / 2] as Vec2,
    [p.center[0] - p.dir[0] * (p.s1 - p.s0) / 2, p.center[1] - p.dir[1] * (p.s1 - p.s0) / 2] as Vec2,
  ]);
  return boundsOf([...pts, ...extra], y0, y1, grow);
}

/** Panel parts: one merged mesh per panel, dropped in from far to near (the crane works toward itself). */
function panelParts(prefix: string, panels: Panel[], at: Vec2, tags: string[], t0: number, total: number): { parts: Part[]; step: number; end: number } {
  const order = [...panels].sort((a, b) => Math.hypot(b.center[0] - at[0], b.center[1] - at[1]) - Math.hypot(a.center[0] - at[0], a.center[1] - at[1]));
  const step = Math.min(0.42, total / Math.max(1, order.length));
  const parts = order.map(
    (p, i): Part => ({
      id: `${prefix}:${p.id}`,
      shape: panelShape(p),
      material: 'block',
      color: PRECAST_GREY,
      tags: ['precast', 'panel', ...tags],
      anim: { type: 'drop', from: [0, 6.5, 0], delay: t0 + i * step, duration: 0.8, ease: 'out' },
    }),
  );
  return { parts, step, end: t0 + order.length * step + 0.8 };
}

function columnPart(id: string, items: BoxItem[], tags: string[]): Part {
  return {
    id,
    shape: { kind: 'boxes', items },
    material: 'block',
    color: PRECAST_GREY,
    tags: ['precast', 'column', ...tags],
    anim: { type: 'drop', from: [0, 6.5, 0], delay: 0.2, duration: 0.8, stagger: fit(1.4, items.length, 0.22), ease: 'out' },
  };
}

function propParts(id: string, rods: ReturnType<typeof propsFor>, tags: string[], delay: number, stagger: number): Part[] {
  return [
    {
      id: `${id}:rods`,
      shape: { kind: 'rods', radius: 0.035, segments: 6, items: rods.rods },
      material: 'steel',
      tags: ['formwork', 'props', ...tags],
      anim: { type: 'grow', delay, duration: 0.3, stagger },
    },
    {
      id: `${id}:plates`,
      shape: { kind: 'boxes', items: rods.plates },
      material: 'steel',
      tags: ['formwork', 'props', ...tags],
      anim: { type: 'grow', delay, duration: 0.3, stagger },
    },
  ];
}

export function phasePrecastLower(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const plan = precastPlan(ctx);
  const st = craneStand(ctx);
  const p4 = phaseLowerStructure(ctx);
  const lowerPanels = plan.lower;
  const lowerCenter = polygonCentroid(ctx.footprint.lower);
  const topLower = fr.y.wallTopLower;
  const hookWork: Vec3 = [lowerCenter[0], topLower + 2.6, lowerCenter[1]];
  const cols = columnItems(ctx, 'lower');
  const m2 = totalM2(lowerPanels);
  const m3 = totalM3(lowerPanels) + cols.m3;
  const panelCam = { bounds: panelBounds(lowerPanels, ctx.y.lowerBeamTop, topLower + 0.3, [], 0.5), azimuth: 200, polar: 58, zoom: 0.92 };
  const out: StepDef[] = [];

  // ---------------------------------------------------------------- crane arrives
  const nearHouse = ctx.footprint.house.filter((p) => Math.hypot(p[0] - st.at[0], p[1] - st.at[2]) < 15);
  const houseB = boundsOf([...nearHouse, [st.at[0] + st.dir[0] * 5.5, st.at[2] + st.dir[1] * 5.5], [st.at[0] - st.dir[0] * 5.5, st.at[2] - st.dir[1] * 5.5]], -1, 8, 1);
  out.push({
    id: 'p4p-crane',
    phase: 4,
    titleHe: 'הגעת מנוף',
    materials: [
      line('מנוף נייד 120 טון עם מפעיל ומסנר', 1, 'יח׳', 0),
      line('רדיוס עבודה מרבי עד הפאנל הרחוק', Math.round(Math.max(...[...lowerPanels, ...plan.entrance].map((p) => reachTo(st, p.center)))), 'מ׳', 0),
      line('לוחות פיזור עומסים מתחת לרגליים', 4, 'יח׳', 0),
    ],
    costILS: PRECAST_RATES.craneDay,
    remove: { tags: ['p4-backfill-machine'] },
    parts: [
      cranePart('p4p-crane:crane', st, hookWork, {
        tags: ['p4p-crane'],
        anim: { type: 'slide', from: st.slideIn, duration: 2.0, ease: 'inOut' },
        exit: 'none',
      }),
    ],
    camera: { bounds: houseB, azimuth: 55, polar: 52, zoom: 1.2 },
    view: { xray: false },
  });

  // ---------------------------------------------------------------- panels
  const pp = panelParts('p4p-panels', lowerPanels, st.pivot, ['level:lower'], 1.0, 4.2);
  const props = propsFor(ctx, lowerPanels, () => ctx.y.gravelTop, topLower - 0.9, 2.0);
  out.push({
    id: 'p4p-panels',
    phase: 4,
    titleHe: 'הרכבת פאנלים',
    materials: [
      line('פאנלי קיר טרומיים עם פתחים יצוקים', lowerPanels.length, 'יח׳', 0),
      line('שטח פאנלים נטו', m2, 'מ״ר', 0),
      line('בטון ב-30 בפאנלים ובעמודים (יצוק במפעל)', m3, 'מ״ק', 1),
      line('ברזל זיון בפאנלים', m3 * 0.11, 'טון', 2),
      line('תמיכות דחיפה-משיכה', props.rods.length, 'יח׳', 0),
      line('ימי מנוף', 3, 'ימים', 0),
    ],
    costILS: roundCost(m2 * PRECAST_RATES.panelM2),
    remove: { tags: ['crane'] },
    parts: [
      cranePart('p4p-panels:crane', st, hookWork, { ...swap, tags: ['p4p-panels'] }),
      columnPart('p4p-panels:columns', cols.items, ['level:lower']),
      ...pp.parts,
      ...propParts('p4p-panels:props', props, ['p4p-props', 'level:lower'], 1.6, pp.step * 0.5),
    ],
    camera: panelCam,
    view: { xray: false },
  });

  // ---------------------------------------------------------------- grout
  const joints = plan.joints.filter((j) => j.level === 'lower');
  const groutItems: BoxItem[] = joints.map((j) => {
    const f = wallFrame(j.wall);
    const c: Vec2 = [j.wall.a[0] + f.dir[0] * j.s, j.wall.a[1] + f.dir[1] * j.s];
    return { at: [c[0], (j.y0 + j.y1) / 2, c[1]], size: [0.04, j.y1 - j.y0, j.wall.thickness + 0.004], rotY: f.rotY };
  });
  const bedItems: BoxItem[] = lowerPanels.map((p) => {
    const f = wallFrame(p.wall);
    return { at: [p.center[0], p.y0 + 0.012, p.center[1]], size: [p.s1 - p.s0 - 0.01, 0.03, p.wall.thickness + 0.004], rotY: f.rotY };
  });
  const groutM = joints.reduce((s, j) => s + (j.y1 - j.y0), 0) + lowerPanels.reduce((s, p) => s + (p.s1 - p.s0), 0);
  out.push({
    id: 'p4p-grout',
    phase: 4,
    titleHe: 'דיוס וחיבורים',
    materials: [
      line('דיס מלט נטול הצטמקות בחיבורים', groutM * 0.0035, 'מ״ק', 2),
      line('אורך חיבורים אנכיים ואופקיים', groutM, 'מ׳', 0),
      line('כיסי חיבור וברזלי המתנה', joints.length * 2, 'יח׳', 0),
    ],
    costILS: roundCost(groutM * PRECAST_RATES.groutM),
    parts: [
      { id: 'p4p-grout:joints', shape: { kind: 'boxes', items: groutItems }, material: 'concrete', tags: ['grout', 'level:lower'], anim: { type: 'rise', duration: 0.8, stagger: fit(3.0, groutItems.length, 0.2), order: 'near', origin: lowerCenter } },
      { id: 'p4p-grout:bed', shape: { kind: 'boxes', items: bedItems }, material: 'concrete', tags: ['grout', 'level:lower'], anim: { type: 'rise', delay: 1.0, duration: 0.6, stagger: fit(2.4, bedItems.length, 0.12), order: 'near', origin: lowerCenter } },
    ],
    camera: { ...panelCam, polar: 52, zoom: 0.8 },
    view: { xray: false },
  });

  // ---------------------------------------------------------------- compose phase 4
  return [
    ...pick(p4, ['p4-retaining-rebar', 'p4-retaining-forms', 'p4-retaining-pour', 'p4-retaining-strip', 'p4-waterproofing', 'p4-backfill']),
    ...out,
    ...pick(p4, ['p4-subbase', 'p4-slab-mesh', 'p4-slab-pour']),
  ];
}

export function phasePrecastCeiling(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const plan = precastPlan(ctx);
  const st = craneStand(ctx);
  const reg = fr.regions.ceiling;
  const outline = reg.shapes().flatMap((s) => s.outline);
  const c = polygonCentroid(outline);
  const yBot = (p: Vec2) => fr.y.entranceBottom(p);
  const planks = plankPlan(ctx, reg, 'lower', yBot);
  const hook: Vec3 = [c[0], fr.y.entranceTop(c) + 3.0, c[1]];
  const far = outline.reduce<Vec2>((b, p) => (Math.hypot(p[0] - st.pivot[0], p[1] - st.pivot[1]) > Math.hypot(b[0] - st.pivot[0], b[1] - st.pivot[1]) ? p : b), outline[0]);
  const camB = boundsOf(outline, fr.y.entranceTop(c) - 3.4, fr.y.entranceTop(c) + 0.5, 0.6);
  const items: BoxItem[] = planks.planks.map((t) => {
    const p: Vec2 = [(t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2];
    const y0 = yBot(p);
    return { at: [p[0], y0 + 0.1, p[1]], size: [t.x1 - t.x0 - 0.006, 0.2, t.z1 - t.z0 - 0.006] };
  });
  const out: StepDef[] = [];
  out.push({
    id: 'p5p-hollowcore',
    phase: 5,
    titleHe: 'הנחת לוחות חלולים',
    materials: [
      line('לוחות תקרה חלולים 20 ס״מ', items.length, 'יח׳', 0),
      line('שטח תקרה', planks.m2, 'מ״ר', 0),
      line('בטון ב-30 בלוחות חלולים (מתוח, יצוק במפעל)', planks.m2 * 0.12, 'מ״ק', 1),
      line('ימי מנוף', 2, 'ימים', 0),
    ],
    costILS: roundCost(planks.m2 * PRECAST_RATES.hollowM2),
    remove: { tags: ['crane', 'p4-slab-machine', 'pour-tiles'] },
    parts: [
      cranePart('p5p-hollowcore:crane', st, hook, { ...swap, tags: ['p5p-hollowcore'] }),
      {
        id: 'p5p-hollowcore:planks',
        shape: { kind: 'boxes', items },
        material: 'block',
        color: HOLLOW_GREY,
        tags: ['precast', 'hollowcore', 'level:lower', 'level:entrance'],
        anim: { type: 'drop', from: [0, 5.5, 0], delay: 1.0, duration: 0.7, stagger: fit(4.4, items.length, 0.26), order: 'near', origin: far, ease: 'out' },
      },
      {
        id: 'p5p-hollowcore:cores',
        shape: { kind: 'boxes', items: planks.holes },
        material: 'ink',
        color: '#4B4F55',
        tags: ['precast', 'hollowcore-cores', 'level:entrance'],
        edges: false,
        anim: { type: 'fade', delay: 5.2, duration: 0.6 },
      },
    ],
    camera: { bounds: camB, azimuth: 35, polar: 52, zoom: 1.0 },
    view: { xray: false },
  });

  // ---------------------------------------------------------------- topping
  const pump = pumpSpot(ctx, reg, c, fr.backfill, fr.backfill, (p) => fr.y.entranceTop(p));
  const yPlankTop = (p: Vec2) => yBot(p) + 0.2;
  const sp = slabPourParts('p5p-topping', reg, yPlankTop, (p) => fr.y.entranceTop(p), pump.origin, ['level:entrance'], { delay: 2.2, total: 3.6 });
  const mesh = slabGrid(reg, fr.y.entranceTop(c) - 0.028, 0.2, { cover: 0.06 });
  const kg = 0.00617 * 6 * 6 * (rodLength(mesh.x) + rodLength(mesh.z));
  out.push({
    id: 'p5p-topping',
    phase: 5,
    titleHe: 'שכבת פני הרצפה',
    materials: [
      line('בטון ב-30 לשכבת פני הרצפה (5 ס״מ)', sp.m3 * 1.04, 'מ״ק', 1),
      line('רשת ברזל קוטר 6 כל 20 ס״מ', kg / 1000, 'טון', 2),
      line('משאבת בטון', 1, 'יום', 0),
    ],
    costILS: roundCost(planks.m2 * PRECAST_RATES.toppingM2 + PRICES.pumpDay),
    remove: { tags: ['p4p-props'] },
    parts: [
      { id: 'p5p-topping:mesh-x', shape: { kind: 'rods', radius: 0.004, segments: 4, items: mesh.x }, material: 'rebar', tags: ['rebar', 'slab-rebar', 'level:entrance'], anim: { type: 'rise', duration: 0.4, stagger: fit(1.0, mesh.x.length, 0.03), order: 'z' } },
      { id: 'p5p-topping:mesh-z', shape: { kind: 'rods', radius: 0.004, segments: 4, items: mesh.z }, material: 'rebar', tags: ['rebar', 'slab-rebar', 'level:entrance'], anim: { type: 'rise', delay: 0.9, duration: 0.4, stagger: fit(1.0, mesh.z.length, 0.03), order: 'x' } },
      ...sp.parts,
      pumpPart('p5p-topping:pump', pump, { tags: ['machine', 'pump', 'p5p-pump'], anim: { type: 'slide', from: st.slideIn, duration: 1.3 } }),
    ],
    camera: { bounds: camB, azimuth: 30, polar: 52, zoom: 1.0 },
    view: { xray: false },
  });
  return out;
}

export function phasePrecastEntrance(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const plan = precastPlan(ctx);
  const st = craneStand(ctx);
  const p6 = phaseEntranceStructure(ctx);
  const panels = plan.entrance;
  const topE = fr.y.wallTopEntrance;
  const e0 = ctx.entrance.floorY;
  const entC = polygonCentroid(ctx.footprint.entrance);
  const hookWork: Vec3 = [entC[0], topE + 3.0, entC[1]];
  const cols = columnItems(ctx, 'entrance');
  const m2 = totalM2(panels);
  const m3 = totalM3(panels) + cols.m3;
  const out: StepDef[] = [];

  const [prep, pour] = pick(p6, ['p6-ground-slab-prep', 'p6-ground-slab-pour']);
  out.push(alsoRemove(prep, ['p5p-pump']), pour);

  // ---------------------------------------------------------------- entrance-floor panels
  const pp = panelParts('p6p-panels', panels, st.pivot, ['level:entrance'], 1.0, 4.4);
  const props = propsFor(ctx, panels, () => e0 - 0.08, topE - 0.6, 1.6);
  const panelCam = { bounds: panelBounds(panels, e0, topE + 0.3, [], 0.5), azimuth: 25, polar: 55, zoom: 0.92 };
  out.push({
    id: 'p6p-panels',
    phase: 6,
    titleHe: 'הרכבת פאנלים בקומת הכניסה',
    materials: [
      line('פאנלי קיר טרומיים עם פתחים יצוקים', panels.length, 'יח׳', 0),
      line('שטח פאנלים נטו', m2, 'מ״ר', 0),
      line('בטון ב-30 בפאנלים ובעמודים (יצוק במפעל)', m3, 'מ״ק', 1),
      line('ברזל זיון בפאנלים', m3 * 0.11, 'טון', 2),
      line('תמיכות דחיפה-משיכה', props.rods.length, 'יח׳', 0),
      line('ימי מנוף', 3, 'ימים', 0),
    ],
    costILS: roundCost(m2 * PRECAST_RATES.panelM2),
    remove: { tags: ['crane', 'p6-gs-machine', 'pour-tiles', 'p6-gs-edge-forms'] },
    parts: [
      cranePart('p6p-panels:crane', st, hookWork, { ...swap, tags: ['p6p-panels'] }),
      columnPart('p6p-panels:columns', cols.items, ['level:entrance']),
      ...pp.parts,
      ...propParts('p6p-panels:props', props, ['p6p-props', 'level:entrance'], 1.6, pp.step * 0.5),
    ],
    camera: panelCam,
    view: { xray: false },
  });

  // ---------------------------------------------------------------- the mamad module
  const mam = plan.mamadWalls;
  const modBoxes: Array<{ at: Vec3; size: Vec3; rotY: number }> = [];
  const rects: Vec2[][] = [];
  let modM3 = 0;
  mam.forEach((w, wi) => {
    const f = wallFrame(w);
    const earlier = mam.slice(0, wi);
    let spans: Array<[number, number]> = [[0, f.length]];
    for (const [c0, c1] of cornerCuts(w, earlier)) spans = spans.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b] as [number, number]] : [[a, Math.max(a, c0)] as [number, number], [Math.min(b, c1), b] as [number, number]])).filter(([a, b]) => b - a > 0.03);
    const pieces = wallPieces(w, ctx.house.openings, levelFloor(ctx, 'entrance')).filter((p) => !(p.y0 <= w.baseY + 0.01 && p.y1 - p.y0 < 0.12));
    for (const [a, b] of spans) {
      const h = w.thickness / 2;
      const P = (s: number, n: number): Vec2 => [w.a[0] + f.dir[0] * s + f.normal[0] * n, w.a[1] + f.dir[1] * s + f.normal[1] * n];
      rects.push([P(a, -h), P(b, -h), P(b, h), P(a, h)]);
      for (const pc of pieces) {
        const s0 = Math.max(pc.s0, a);
        const s1 = Math.min(pc.s1, b);
        if (s1 - s0 < 0.02) continue;
        const cc = P((s0 + s1) / 2, 0);
        modBoxes.push({ at: [cc[0], (pc.y0 + pc.y1) / 2, cc[1]], size: [s1 - s0, pc.y1 - pc.y0, w.thickness], rotY: f.rotY });
        modM3 += (s1 - s0) * (pc.y1 - pc.y0) * w.thickness;
      }
    }
  });
  const filled = Region.of(Region.of(rects).shapes().map((s) => s.outline));
  const lid = filled.shapes();
  const lidM3 = filled.area * 0.25;
  const lidTop = fr.y.roofTop;
  const lidBot = fr.y.roofBottom;
  const modC = polygonCentroid(lid[0]?.outline ?? ctx.footprint.entrance);
  const modHook: Vec3 = [modC[0], lidTop + 2.4, modC[1]];
  const dropAnim: Anim = { type: 'drop', from: [0, 9, 0], delay: 1.2, duration: 2.6, ease: 'out' };
  const frames: BoxItem[] = [];
  for (const o of ctx.house.openings) {
    if (o.kind !== 'mamad-door' && o.kind !== 'mamad-window') continue;
    const w = mam.find((x) => x.id === o.wallId);
    if (!w) continue;
    const f = wallFrame(w);
    const P = (s: number): Vec2 => [w.a[0] + f.dir[0] * s, w.a[1] + f.dir[1] * s];
    const y0 = e0 + o.sill;
    const y1 = e0 + o.head;
    const T = w.thickness + 0.008;
    const k = 0.06;
    for (const s of [o.offset - o.width / 2 + k / 2, o.offset + o.width / 2 - k / 2]) {
      const q = P(s);
      frames.push({ at: [q[0], (y0 + y1) / 2, q[1]], size: [k, y1 - y0, T], rotY: f.rotY });
    }
    const q = P(o.offset);
    frames.push({ at: [q[0], y1 - k / 2, q[1]], size: [o.width - 2 * k, k, T], rotY: f.rotY });
    if (o.sill > 0.2) frames.push({ at: [q[0], y0 + k / 2, q[1]], size: [o.width - 2 * k, k, T], rotY: f.rotY });
  }
  const modTons = (modM3 + lidM3) * 2.5;
  out.push({
    id: 'p6p-mamad',
    phase: 6,
    titleHe: 'ממ״ד טרומי',
    materials: [
      line('מודול ממ״ד טרומי בדגם מאושר פיקוד העורף', 1, 'יח׳', 0),
      line('בטון ב-30 במודול (קירות ותקרה, יצוק במפעל)', modM3 + lidM3, 'מ״ק', 1),
      line('משקל מודול להרמה', modTons, 'טונות', 0),
      line('משקופי פלדה לדלת ולחלון ההדף', frames.length > 0 ? ctx.house.openings.filter((o) => o.kind === 'mamad-door' || o.kind === 'mamad-window').length : 0, 'יח׳', 0),
      line('ימי מנוף כבד', 1, 'יום', 0),
    ],
    costILS: PRECAST_RATES.mamadModule,
    remove: { tags: ['crane'] },
    parts: [
      cranePart('p6p-mamad:crane', st, modHook, { ...swap, tags: ['p6p-mamad'] }),
      { id: 'p6p-mamad:walls', shape: { kind: 'merge', shapes: modBoxes.map((b) => ({ kind: 'box' as const, size: b.size, at: b.at, rotY: b.rotY })) }, material: 'block', color: PRECAST_GREY, tags: ['precast', 'mamad', 'level:entrance'], anim: dropAnim },
      ...lid.map(
        (s, i): Part => ({ id: `p6p-mamad:lid${i}`, shape: { kind: 'extrude', outline: s.outline, holes: s.holes, y0: lidBot, y1: lidTop }, material: 'block', color: PRECAST_GREY, tags: ['precast', 'mamad', 'level:entrance', 'level:roof'], anim: dropAnim }),
      ),
      { id: 'p6p-mamad:frames', shape: { kind: 'boxes', items: frames }, material: 'steel', tags: ['mamad-frame', 'level:entrance'], anim: dropAnim },
    ],
    camera: { bounds: boundsOf(lid.flatMap((s) => s.outline), e0, lidTop + 1.5, 1.2), azimuth: 150, polar: 48, zoom: 1.0 },
    view: { xray: false },
  });

  // ---------------------------------------------------------------- roof planks (the module is its own lid)
  const roofReg = Region.of(
    fr.regions.roof.shapes().map((s) => s.outline),
    lid.map((s) => s.outline),
  );
  const roofOutline = roofReg.shapes().flatMap((s) => s.outline);
  const rc = polygonCentroid(roofOutline);
  const yBot = () => lidBot;
  const planks = plankPlan(ctx, roofReg, 'entrance', yBot);
  const farR = roofOutline.reduce<Vec2>((b, p) => (Math.hypot(p[0] - st.pivot[0], p[1] - st.pivot[1]) > Math.hypot(b[0] - st.pivot[0], b[1] - st.pivot[1]) ? p : b), roofOutline[0]);
  const items: BoxItem[] = planks.planks.map((t) => ({ at: [(t.x0 + t.x1) / 2, lidBot + 0.1, (t.z0 + t.z1) / 2], size: [t.x1 - t.x0 - 0.006, 0.2, t.z1 - t.z0 - 0.006] }));
  const roofHook: Vec3 = [rc[0], lidTop + 3.2, rc[1]];
  out.push({
    id: 'p6p-hollowcore',
    phase: 6,
    titleHe: 'לוחות חלולים לגג',
    materials: [
      line('לוחות תקרה חלולים 20 ס״מ', items.length, 'יח׳', 0),
      line('שטח גג', planks.m2, 'מ״ר', 0),
      line('בטון ב-30 בלוחות חלולים (מתוח, יצוק במפעל)', planks.m2 * 0.12, 'מ״ק', 1),
      line('ימי מנוף', 2, 'ימים', 0),
    ],
    costILS: roundCost(planks.m2 * PRECAST_RATES.hollowM2),
    remove: { tags: ['crane'] },
    parts: [
      cranePart('p6p-hollowcore:crane', st, roofHook, { ...swap, tags: ['p6p-hollowcore'] }),
      {
        id: 'p6p-hollowcore:planks',
        shape: { kind: 'boxes', items },
        material: 'block',
        color: HOLLOW_GREY,
        tags: ['precast', 'hollowcore', 'level:roof'],
        anim: { type: 'drop', from: [0, 5.5, 0], delay: 1.0, duration: 0.7, stagger: fit(4.4, items.length, 0.26), order: 'near', origin: farR, ease: 'out' },
      },
      {
        id: 'p6p-hollowcore:cores',
        shape: { kind: 'boxes', items: planks.holes },
        material: 'ink',
        color: '#4B4F55',
        tags: ['precast', 'hollowcore-cores', 'level:roof'],
        edges: false,
        anim: { type: 'fade', delay: 5.2, duration: 0.6 },
      },
    ],
    camera: { bounds: boundsOf(roofOutline, lidBot - 0.5, lidTop + 0.5, 0.4), azimuth: 35, polar: 50, zoom: 0.95 },
    view: { xray: false },
  });

  // ---------------------------------------------------------------- roof topping
  const rPump = pumpSpot(ctx, roofReg, rc, fr.backfill, fr.backfill, lidTop);
  const rsp = slabPourParts('p6p-topping', roofReg, () => lidBot + 0.2, () => lidTop, rPump.origin, ['level:roof'], { delay: 2.2, total: 3.6 });
  const rmesh = slabGrid(roofReg, lidTop - 0.028, 0.2, { cover: 0.06 });
  const rkg = 0.00617 * 6 * 6 * (rodLength(rmesh.x) + rodLength(rmesh.z));
  out.push({
    id: 'p6p-topping',
    phase: 6,
    titleHe: 'שכבת פני הגג',
    materials: [
      line('בטון ב-30 לשכבת פני הגג (5 ס״מ)', rsp.m3 * 1.04, 'מ״ק', 1),
      line('רשת ברזל קוטר 6 כל 20 ס״מ', rkg / 1000, 'טון', 2),
      line('משאבת בטון', 1, 'יום', 0),
    ],
    costILS: roundCost(planks.m2 * PRECAST_RATES.toppingM2 + PRICES.pumpDay),
    parts: [
      { id: 'p6p-topping:mesh-x', shape: { kind: 'rods', radius: 0.004, segments: 4, items: rmesh.x }, material: 'rebar', tags: ['rebar', 'slab-rebar', 'level:roof'], anim: { type: 'rise', duration: 0.4, stagger: fit(1.0, rmesh.x.length, 0.03), order: 'z' } },
      { id: 'p6p-topping:mesh-z', shape: { kind: 'rods', radius: 0.004, segments: 4, items: rmesh.z }, material: 'rebar', tags: ['rebar', 'slab-rebar', 'level:roof'], anim: { type: 'rise', delay: 0.9, duration: 0.4, stagger: fit(1.0, rmesh.z.length, 0.03), order: 'x' } },
      ...rsp.parts,
      pumpPart('p6p-topping:pump', rPump, { tags: ['machine', 'pump', 'p6p-pump'], anim: { type: 'slide', from: st.slideIn, duration: 1.3 } }),
    ],
    camera: { bounds: boundsOf(roofOutline, lidBot - 0.5, lidTop + 0.5, 0.4), azimuth: 35, polar: 50, zoom: 0.95 },
    view: { xray: false },
  });

  // ---------------------------------------------------------------- frame done
  const skeletonM3 = m3 + totalM3(plan.lower) + modM3 + lidM3;
  out.push({
    id: 'p6p-frame-done',
    phase: 6,
    titleHe: 'השלד מוכן: פירוק מנוף ותמיכות',
    materials: [
      line('שלד טרומי: פאנלים, עמודים, לוחות ומודול ממ״ד', skeletonM3, 'מ״ק', 0),
      line('פירוק תמיכות והחזרת המנוף', 1, 'יום', 0),
      line('תקרות חלולות עם שכבת פנים', 2, 'יח׳', 0),
    ],
    costILS: PRECAST_RATES.craneDay,
    remove: { tags: ['formwork', 'props', 'crane', 'p6p-pump', 'p5p-pump', 'pour-tiles'] },
    parts: [],
    camera: { fit: 'house', azimuth: 40, polar: 63, zoom: 1.05, orbit: true },
    view: { xray: false },
  });
  return out;
}

export { R2 };
