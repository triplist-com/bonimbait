/**
 * Phase 5 · תקרת הקומה התחתונה — the suspended entrance slab (+ terrace slab) over the
 * lower floor: steel props + H20 primaries/secondaries, plywood sheets 1.22 × 2.44 with
 * edge forms and beam bottoms/sides, bottom bars both ways, orange conduits between
 * ceiling boxes + plumbing sleeves, chairs + top bars + beam stirrups, pump pour that
 * sweeps from the hose, and curing (wet film + sprinklers).
 */
import { dist2, pointInPolygon, polygonCentroid, wallFrame } from '../house/geometry';
import type { Part, StepDef, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { PRICES, line, model, rebarKg, roundCost } from './kit';
import {
  Region,
  STRUCT_RATES,
  beamForms,
  boundsOf,
  boxVolume,
  columnRect,
  deckField,
  edgeForms,
  fit,
  gridPoints,
  pieceItem,
  pieceRect,
  pourBounds,
  propParts,
  pumpPart,
  pumpSpot,
  rodLength,
  slabGrid,
  slabPourParts,
  spaced,
  structureFrame,
  type BoxItem,
  type RodItem,
  type StructureFrame,
  type WallBox,
} from './structure-kit';

const LVL = 'level:entrance';
const SINK = (delay: number) => ({ type: 'sink' as const, to: [0, -0.9, 0] as Vec3, delay, duration: 0.9 });

/** Ceiling (slab over a level): shared by phase 5 (lower ceiling) and phase 6 (roof). */
export interface CeilingSpec {
  id: 'p5' | 'p6';
  /** Slab region (union) and the per-point top/bottom. */
  slab: Region;
  slabs: Region[];
  top: (p: Vec2) => number;
  bottom: (p: Vec2) => number;
  /** Things that carry the slab directly (wall tops, column tops): no deck there. */
  supports: Vec2[][];
  beams: WallBox[];
  floorAt: (p: Vec2) => number;
  /** Edge forms are skipped where the outward point lies in one of these (joints with other slabs). */
  joints: Vec2[][];
  tags: string[];
  /** Exit delays at the final strip (roof first, then the lower ceiling). */
  stripDelay: number;
}

export function phaseLowerCeiling(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const spec: CeilingSpec = {
    id: 'p5',
    slab: fr.regions.ceiling,
    slabs: [fr.regions.susp, fr.regions.terrace],
    top: fr.y.entranceTop,
    bottom: fr.y.entranceBottom,
    supports: [...fr.lowerWalls.cast.map((p) => pieceRect(p)), ...fr.lowerCols.map((c) => columnRect(c))],
    beams: fr.lowerWalls.beams,
    floorAt: fr.lowerFloorAt,
    joints: fr.slabs.grade ? [fr.slabs.grade.outline] : [],
    tags: [LVL, 'level:lower'],
    stripDelay: 1.6,
  };
  const c = ceilingSteps(ctx, fr, spec);
  c.props.remove = { tags: ['p4-col-ghost'] };
  return [c.props, c.deck, c.rebarBottom, c.conduits, c.rebarTop, c.pour, curing(fr, spec)];
}

export function ceilingSteps(ctx: BuildContext, fr: StructureFrame, spec: CeilingSpec) {
  const P = spec.id;
  const P6: Record<string, string> = { props: 'p6-roof-deck:shoring', deck: 'p6-roof-deck', 'rebar-bottom': 'p6-roof-rebar:bottom', 'rebar-top': 'p6-roof-rebar:top', pour: 'p6-roof-pour' };
  const stepId = (s: string) => (P === 'p5' ? `p5-${s}` : P6[s] ?? `p6-roof-${s}`);
  const tag = (s: string) => `${P}-${s}`;
  const slab = spec.slab;
  const outline = slab.shapes().flatMap((s) => s.outline);
  const yTop = Math.max(...outline.map((p) => spec.top(p)));
  const yLow = Math.min(...outline.map((p) => spec.floorAt(p)));
  const cam = (azimuth: number, polar: number, grow = 1.2, y0 = yLow, y1 = yTop + 0.6) => ({ bounds: boundsOf(outline, y0, y1, grow), azimuth, polar });
  const corner: Vec2 = [slab.xs[slab.nx], slab.zs[0]];

  // ------------------------------------------------------------------ props + beams
  const supportReg = Region.of(spec.supports.length ? spec.supports : [[[0, 0], [0, 0], [0, 0]]]);
  const beamRects = spec.beams.map((b) => pieceRect(b, 0.03));
  const deck = Region.of([...(slab.shapes().map((s) => s.outline))], [...spec.supports, ...beamRects]);
  const deckReal = Region.of(spec.slabs.flatMap((r) => r.shapes().map((s) => s.outline)), [...spec.supports, ...beamRects]);
  const avoidReg = Region.of([...spec.supports.map((r) => grow(r, 0.12)), ...spec.beams.map((b) => pieceRect(b, 0.15))]);
  // One field per slab (soffit steps between slabs, e.g. the terrace sits 4 cm lower).
  const avoid = (p: Vec2) => avoidReg.contains(p) || supportReg.contains(p);
  const fields = spec.slabs
    .filter((r) => !r.empty)
    .map((r) => deckField(Region.of(r.shapes().map((s) => s.outline), [...spec.supports, ...beamRects]), spec.bottom, spec.floorAt, avoid));
  const field = fields.reduce((a, f) => ({
    outer: [...a.outer, ...f.outer],
    inner: [...a.inner, ...f.inner],
    plates: [...a.plates, ...f.plates],
    heads: [...a.heads, ...f.heads],
    collars: [...a.collars, ...f.collars],
    primaries: [...a.primaries, ...f.primaries],
    secondaries: [...a.secondaries, ...f.secondaries],
    sheets: [...a.sheets, ...f.sheets],
    props: a.props + f.props,
    deckM2: a.deckM2 + f.deckM2,
  }));
  const bf = beamForms(spec.beams, spec.bottom, spec.floorAt);
  const shoreExit = SINK(spec.stripDelay + 0.6);
  const propsAll = { ...field, outer: [...field.outer, ...bf.field.outer], inner: [...field.inner, ...bf.field.inner], plates: [...field.plates, ...bf.field.plates], heads: [...field.heads, ...bf.field.heads], collars: [...field.collars, ...bf.field.collars], props: field.props + bf.field.props };
  const props: StepDef = {
    id: P === 'p5' ? 'p5-props' : 'p6-roof-deck',
    phase: P === 'p5' ? 5 : 6,
    titleHe: P === 'p5' ? 'תמיכות (פרופים)' : 'תמיכות ומשטח לתקרת הגג',
    materials: [],
    costILS: 0,
    parts: [
      ...propParts(`${stepId('props')}:props`, propsAll, [...spec.tags, tag('shoring')], { origin: corner, total: 2.4 }).map((p) => ({ ...p, exit: shoreExit })),
      {
        id: `${stepId('props')}:primaries`,
        shape: { kind: 'boxes', items: [...field.primaries, ...bf.bearers] },
        material: 'timber',
        tags: ['formwork', ...spec.tags, tag('shoring')],
        anim: { type: 'drop', from: [0, 1.2, 0], delay: 2.4, duration: 0.5, stagger: fit(1.0, field.primaries.length, 0.08), order: 'x', ease: 'out' },
        exit: SINK(spec.stripDelay + 0.4),
      },
      {
        id: `${stepId('props')}:secondaries`,
        shape: { kind: 'boxes', items: field.secondaries },
        material: 'timber',
        tags: ['formwork', ...spec.tags, tag('shoring')],
        anim: { type: 'drop', from: [0, 1.0, 0], delay: 3.4, duration: 0.45, stagger: fit(1.1, field.secondaries.length, 0.05), order: 'z', ease: 'out' },
        exit: SINK(spec.stripDelay + 0.2),
      },
    ],
    camera: cam(205, 52, 1.0),
    view: { xray: true },
  };

  // ------------------------------------------------------------------ deck + edge forms + beam sides
  const inJoint = (p: Vec2) => spec.joints.some((j) => pointInPolygon(p, j));
  const ef = edgeForms(slab, (p) => ({ bottom: spec.bottom(p), top: spec.top(p) }), () => false, (p) => supportReg.contains(p));
  // Split edge-form boards into joint (removed when the neighbour slab is prepared) and outer.
  const jointBoards: BoxItem[] = [];
  const outerBoards: BoxItem[] = [];
  for (const b of ef.boards) (inJoint([b.at[0], b.at[2]]) ? jointBoards : outerBoards).push(b);
  const jointBr: BoxItem[] = [];
  const outerBr: BoxItem[] = [];
  for (const b of ef.brackets) (inJoint([b.at[0], b.at[2]]) ? jointBr : outerBr).push(b);
  const deckM2 = deckReal.area;
  const deckParts: Part[] = [
    {
      id: `${stepId('deck')}:sheets`,
      shape: { kind: 'boxes', items: field.sheets },
      material: 'plywood',
      tags: ['formwork', 'deck', ...spec.tags, tag('deck')],
      anim: { type: 'drop', from: [0, 0.8, 0], duration: 0.45, stagger: fit(3.0, field.sheets.length, 0.08), order: 'near', origin: corner, ease: 'out' },
      exit: SINK(spec.stripDelay),
    },
    {
      id: `${stepId('deck')}:beam-bottoms`,
      shape: { kind: 'boxes', items: bf.bottoms },
      material: 'plywood',
      tags: ['formwork', ...spec.tags, tag('deck')],
      anim: { type: 'drop', from: [0, 0.6, 0], delay: 0.2, duration: 0.5 },
      exit: SINK(spec.stripDelay + 0.2),
    },
    {
      id: `${stepId('deck')}:beam-sides`,
      shape: { kind: 'boxes', items: bf.sides },
      material: 'plywood',
      tags: ['formwork', ...spec.tags, tag('deck')],
      anim: { type: 'rise', delay: 0.6, duration: 0.6 },
      exit: SINK(spec.stripDelay + 0.1),
    },
    {
      id: `${stepId('deck')}:edges`,
      shape: { kind: 'boxes', items: outerBoards },
      material: 'plywood',
      tags: ['formwork', 'edge-forms', ...spec.tags, tag('edge-forms')],
      anim: { type: 'rise', delay: 3.0, duration: 0.5, stagger: fit(1.2, outerBoards.length, 0.06), order: 'near', origin: corner },
      exit: { type: 'lift', delay: Math.max(0, spec.stripDelay - 1.4), duration: 0.8 },
    },
    {
      id: `${stepId('deck')}:brackets`,
      shape: { kind: 'boxes', items: outerBr },
      material: 'timber',
      tags: ['formwork', 'edge-forms', ...spec.tags, tag('edge-forms')],
      anim: { type: 'rise', delay: 3.4, duration: 0.4, stagger: fit(1.0, outerBr.length, 0.03), order: 'near', origin: corner },
      exit: { type: 'lift', delay: Math.max(0, spec.stripDelay - 1.4), duration: 0.8 },
    },
  ];
  if (jointBoards.length)
    deckParts.push(
      {
        id: `${stepId('deck')}:joint`,
        shape: { kind: 'boxes', items: jointBoards },
        material: 'plywood',
        tags: ['formwork', 'edge-forms', ...spec.tags, tag('joint-form')],
        anim: { type: 'rise', delay: 3.0, duration: 0.5, stagger: fit(0.8, jointBoards.length, 0.06) },
      },
      {
        id: `${stepId('deck')}:joint-brackets`,
        shape: { kind: 'boxes', items: jointBr },
        material: 'timber',
        tags: ['formwork', 'edge-forms', ...spec.tags, tag('joint-form')],
        anim: { type: 'rise', delay: 3.4, duration: 0.4 },
      },
    );
  const deckStep: StepDef = {
    id: P === 'p5' ? 'p5-deck' : 'p6-roof-deck',
    phase: P === 'p5' ? 5 : 6,
    titleHe: P === 'p5' ? 'משטח טפסנות' : 'תמיכות ומשטח לתקרת הגג',
    materials: [
      line('משטח דיקט (לוחות 1.22×2.44)', deckM2, 'מ״ר', 0),
      line('לוחות דיקט', field.sheets.length, 'יח׳', 0),
      line('תבניות קצה', ef.m, 'מ׳', 0),
      ...(bf.bottoms.length ? [line('תבניות קורות (תחתית וצדדים)', bf.m2, 'מ״ר', 1)] : []),
    ],
    costILS: roundCost(deckM2 * PRICES.slabFormworkM2 * 0.55 + bf.m2 * PRICES.formworkM2),
    parts: deckParts,
    camera: cam(200, 48, 1.0),
    view: { xray: true },
  };
  // Props step costs: shoring share of the slab formwork rate.
  props.materials = [
    line('פרופי פלדה', propsAll.props, 'יח׳', 0),
    line('קורות H20 ראשיות', field.primaries.length + bf.bearers.length, 'יח׳', 0),
    line('קורות H20 משניות', field.secondaries.length, 'יח׳', 0),
    line('שטח תקרה לתמיכה', slab.area, 'מ״ר', 0),
  ];
  props.costILS = roundCost(slab.area * PRICES.slabFormworkM2 * 0.45);

  // ------------------------------------------------------------------ bottom rebar
  const bottomBars: { x: RodItem[]; z: RodItem[] } = { x: [], z: [] };
  const topBars: { x: RodItem[]; z: RodItem[] } = { x: [], z: [] };
  const chairs: Array<{ at: Vec3 }> = [];
  const spacersB: BoxItem[] = [];
  let chairH = 0.12;
  for (const r of spec.slabs) {
    if (r.empty) continue;
    const c: Vec2 = [(r.xs[0] + r.xs[r.nx]) / 2, (r.zs[0] + r.zs[r.nz]) / 2];
    const any = r.rects()[0];
    const q: Vec2 = any ? [(any.x0 + any.x1) / 2, (any.z0 + any.z1) / 2] : c;
    const b = spec.bottom(q);
    const t = spec.top(q);
    const g = slabGrid(r, b + 0.035, 0.25, { cover: 0.04 });
    bottomBars.x.push(...g.x);
    bottomBars.z.push(...g.z);
    // Top mesh 6.5 cm below the surface: palette polygonOffset can sink a far, oblique slab
    // face by ~3 cm, so bars any closer would speckle through the finished slab.
    const yTopBars = t - 0.065 - 0.014;
    const gt = slabGrid(r, yTopBars, 0.3, { cover: 0.05, zFirst: true, phase: 0.06 });
    topBars.x.push(...gt.x);
    topBars.z.push(...gt.z);
    chairH = yTopBars - 0.006 - (b + 0.035 + 0.014 + 0.006);
    for (const p of gridPoints(r, [1.0, 1.0], 0.3, [r.xs[0] + 0.45, r.zs[0] + 0.45])) {
      if (supportReg.contains(p)) continue;
      chairs.push({ at: [p[0], b + 0.035 + 0.014 + 0.006, p[1]] });
      spacersB.push({ at: [p[0] + 0.12, b + 0.017, p[1] + 0.12], size: [0.04, 0.03, 0.04] });
    }
  }
  // Beam bars (bottom 4 Ø16, top 3 Ø14) + stirrups every 15 cm.
  const beamBars: RodItem[] = [];
  const beamTop: RodItem[] = [];
  const stirrups: RodItem[] = [];
  for (const bm of spec.beams) {
    const f = wallFrame(bm.wall);
    const h = bm.wall.thickness / 2 - 0.04;
    const P0 = (s: number, n: number): Vec2 => [bm.wall.a[0] + f.dir[0] * s + f.normal[0] * n, bm.wall.a[1] + f.dir[1] * s + f.normal[1] * n];
    const yb = bm.y0 + 0.045;
    const yt = spec.top(P0((bm.s0 + bm.s1) / 2, 0)) - 0.09;
    for (const n of spaced(-h, h, 0.1)) {
      const a = P0(bm.s0 - 0.15, n);
      const b2 = P0(bm.s1 + 0.15, n);
      beamBars.push({ a: [a[0], yb, a[1]], b: [b2[0], yb, b2[1]] });
    }
    for (const n of [-h, 0, h]) {
      const a = P0(bm.s0 - 0.15, n);
      const b2 = P0(bm.s1 + 0.15, n);
      beamTop.push({ a: [a[0], yt, a[1]], b: [b2[0], yt, b2[1]] });
    }
    for (const s of spaced(bm.s0, bm.s1, 0.15, 0.05)) {
      const l = P0(s, -h - 0.01);
      const r2 = P0(s, h + 0.01);
      const y0 = yb - 0.012;
      const y1 = yt + 0.012;
      stirrups.push(
        { a: [l[0], y0, l[1]], b: [l[0], y1, l[1]] },
        { a: [r2[0], y0, r2[1]], b: [r2[0], y1, r2[1]] },
        { a: [l[0], y0, l[1]], b: [r2[0], y0, r2[1]] },
        { a: [l[0], y1, l[1]], b: [r2[0], y1, r2[1]] },
      );
    }
  }
  const kgBottom = rebarKg(12, rodLength(bottomBars.x) + rodLength(bottomBars.z)) + rebarKg(16, rodLength(beamBars));
  const rebarBottom: StepDef = {
    id: P === 'p5' ? 'p5-rebar-bottom' : 'p6-roof-rebar',
    phase: P === 'p5' ? 5 : 6,
    titleHe: P === 'p5' ? 'זיון תחתון' : 'זיון תקרת הגג וצנרת',
    materials: [
      line('זיון תחתון קוטר 12 כל 25 ס״מ', kgBottom / 1000, 'טון', 2),
      line('מוטות בכיוון X', bottomBars.x.length, 'יח׳', 0),
      line('מוטות בכיוון Z', bottomBars.z.length, 'יח׳', 0),
      line('ספייסרים', spacersB.length, 'יח׳', 0),
    ],
    costILS: roundCost((kgBottom / 1000) * PRICES.rebarTon),
    parts: [
      { id: `${stepId('rebar-bottom')}:spacers`, shape: { kind: 'boxes', items: spacersB }, material: 'block', tags: ['spacers', ...spec.tags], edges: false, anim: { type: 'fade', duration: 0.6 } },
      { id: `${stepId('rebar-bottom')}:x`, shape: { kind: 'rods', radius: 0.006, segments: 5, items: bottomBars.x }, material: 'rebar', tags: ['rebar', 'slab-rebar', ...spec.tags], anim: { type: 'rise', delay: 0.4, duration: 0.55, stagger: fit(1.8, bottomBars.x.length, 0.05), order: 'z' } },
      { id: `${stepId('rebar-bottom')}:z`, shape: { kind: 'rods', radius: 0.006, segments: 5, items: bottomBars.z }, material: 'rebar', tags: ['rebar', 'slab-rebar', ...spec.tags], anim: { type: 'rise', delay: 2.2, duration: 0.55, stagger: fit(1.8, bottomBars.z.length, 0.05), order: 'x' } },
    ],
    camera: cam(205, 40, 0.6, yTop - 1.5),
    view: { xray: false },
  };
  if (beamBars.length)
    rebarBottom.parts.push({ id: `${stepId('rebar-bottom')}:beam`, shape: { kind: 'rods', radius: 0.008, segments: 6, items: beamBars }, material: 'rebar', tags: ['rebar', 'beam-rebar', ...spec.tags], anim: { type: 'rise', delay: 0.2, duration: 0.6, stagger: 0.12 } });

  // ------------------------------------------------------------------ conduits + boxes + sleeves
  const svc = services(ctx, fr, spec, deckReal.empty ? deck : deckReal);
  const conduitSt: StepDef = {
    id: 'p5-conduits',
    phase: 5,
    titleHe: 'צנרת חשמל ושרוולים בתקרה',
    materials: [
      line('נקודות תאורה בתקרה', svc.boxes.length, 'יח׳', 0),
      line('צנרת שרשורית כתומה', svc.len, 'מ׳', 0),
      line('שרוולי אינסטלציה', svc.sleeves.length, 'יח׳', 0),
    ],
    costILS: roundCost(svc.boxes.length * (PRICES.electricalPoint * 0.35 + STRUCT_RATES.ceilingBox) + svc.sleeves.length * STRUCT_RATES.sleeve),
    parts: svc.parts,
    camera: cam(200, 38, 0.4, yTop - 1.5),
    view: { xray: false },
  };

  // ------------------------------------------------------------------ chairs + top rebar + stirrups
  const chairShape = {
    kind: 'merge' as const,
    shapes: [
      { kind: 'rod' as const, a: [-0.1, 0, -0.05] as Vec3, b: [-0.07, chairH, 0] as Vec3, radius: 0.005, segments: 4 },
      { kind: 'rod' as const, a: [0.1, 0, -0.05] as Vec3, b: [0.07, chairH, 0] as Vec3, radius: 0.005, segments: 4 },
      { kind: 'rod' as const, a: [-0.1, 0, 0.05] as Vec3, b: [-0.07, chairH, 0] as Vec3, radius: 0.005, segments: 4 },
      { kind: 'rod' as const, a: [0.1, 0, 0.05] as Vec3, b: [0.07, chairH, 0] as Vec3, radius: 0.005, segments: 4 },
      { kind: 'rod' as const, a: [-0.09, chairH, 0] as Vec3, b: [0.09, chairH, 0] as Vec3, radius: 0.005, segments: 4 },
    ],
  };
  const kgTop = rebarKg(10, rodLength(topBars.x) + rodLength(topBars.z)) + rebarKg(8, rodLength(stirrups)) + rebarKg(14, rodLength(beamTop)) + chairs.length * 0.35;
  const topParts: Part[] = [
    { id: `${stepId('rebar-top')}:chairs`, shape: { kind: 'instances', of: chairShape, items: chairs }, material: 'rebar', tags: ['rebar', ...spec.tags], edges: false, castShadow: false, anim: { type: 'grow', duration: 0.3, stagger: fit(1.2, chairs.length, 0.03), order: 'near', origin: corner } },
    { id: `${stepId('rebar-top')}:x`, shape: { kind: 'rods', radius: 0.005, segments: 5, items: topBars.x }, material: 'rebar', tags: ['rebar', 'slab-rebar', ...spec.tags], castShadow: false, anim: { type: 'rise', delay: 1.3, duration: 0.5, stagger: fit(1.4, topBars.x.length, 0.05), order: 'z' } },
    { id: `${stepId('rebar-top')}:z`, shape: { kind: 'rods', radius: 0.005, segments: 5, items: topBars.z }, material: 'rebar', tags: ['rebar', 'slab-rebar', ...spec.tags], castShadow: false, anim: { type: 'rise', delay: 2.8, duration: 0.5, stagger: fit(1.4, topBars.z.length, 0.05), order: 'x' } },
  ];
  if (stirrups.length)
    topParts.push(
      { id: `${stepId('rebar-top')}:stirrups`, shape: { kind: 'rods', radius: 0.004, segments: 4, items: stirrups }, material: 'rebar', tags: ['rebar', 'beam-rebar', ...spec.tags], anim: { type: 'grow', delay: 0.2, duration: 0.25, stagger: fit(1.0, stirrups.length, 0.01), order: 'x' } },
      { id: `${stepId('rebar-top')}:beam-top`, shape: { kind: 'rods', radius: 0.007, segments: 6, items: beamTop }, material: 'rebar', tags: ['rebar', 'beam-rebar', ...spec.tags], castShadow: false, anim: { type: 'rise', delay: 1.1, duration: 0.5, stagger: 0.1 } },
    );
  const rebarTop: StepDef = {
    id: P === 'p5' ? 'p5-rebar-top' : 'p6-roof-rebar',
    phase: P === 'p5' ? 5 : 6,
    titleHe: P === 'p5' ? 'זיון עליון' : 'זיון תקרת הגג וצנרת',
    materials: [
      line('זיון עליון קוטר 10 כל 30 ס״מ', (rebarKg(10, rodLength(topBars.x) + rodLength(topBars.z)) / 1000), 'טון', 2),
      line('כיסאות זיון', chairs.length, 'יח׳', 0),
      ...(stirrups.length ? [line('חישוקי קורות', stirrups.length / 4, 'יח׳', 0)] : []),
    ],
    costILS: roundCost((kgTop / 1000) * PRICES.rebarTon),
    parts: topParts,
    camera: cam(200, 42, 0.6, yTop - 1.5),
    view: { xray: false },
  };

  // ------------------------------------------------------------------ pour
  const target = polygonCentroid(outline);
  const pump = pumpSpot(ctx, slab, target, fr.backfill, fr.backfill, (p) => spec.top(p));
  const pourRegions = spec.slabs.filter((r) => !r.empty);
  const pourParts: Part[] = [];
  let m3 = 0;
  pourRegions.forEach((r, i) => {
    const sp = slabPourParts(`${stepId('pour')}:${i}`, r, spec.bottom, spec.top, pump.origin, spec.tags, { delay: 1.6 + i * 0.4, total: 4.4 });
    pourParts.push(...sp.parts);
    m3 += sp.m3;
  });
  const beamItems = spec.beams.map((b) => pieceItem(b));
  if (beamItems.length) {
    m3 += boxVolume(beamItems);
    pourParts.push({ id: `${stepId('pour')}:beams`, shape: { kind: 'boxes', items: beamItems }, material: 'concrete', tags: ['concrete', 'beams', ...spec.tags], anim: { type: 'pour', delay: 1.2, duration: 1.4, stagger: 0.2 } });
  }
  const crewTag = tag('pour-machine');
  const crewY = spec.top(pump.origin);
  pourParts.push(
    pumpPart(`${stepId('pour')}:pump`, pump, { tags: ['machine', 'pump', crewTag], anim: { type: 'slide', from: [-ctx.lot.street.inward[0] * 10, 0, -ctx.lot.street.inward[1] * 10], duration: 1.3 } }),
    model(`${stepId('pour')}:w1`, 'worker', [pump.origin[0] + 0.9, crewY, pump.origin[1] - 0.6], 0.8, { tags: ['machine', crewTag, ...spec.tags], shape: { kind: 'model', name: 'worker', seed: 31 }, anim: { type: 'drop', delay: 0.6, from: [0, 0.8, 0] } }),
    model(`${stepId('pour')}:w2`, 'worker', [pump.origin[0] - 1.2, crewY, pump.origin[1] + 0.8], 2.6, { tags: ['machine', crewTag, ...spec.tags], shape: { kind: 'model', name: 'worker', seed: 17 }, anim: { type: 'drop', delay: 0.8, from: [0, 0.8, 0] } }),
  );
  const pour: StepDef = {
    id: P === 'p5' ? 'p5-pour' : 'p6-roof-pour',
    phase: P === 'p5' ? 5 : 6,
    titleHe: P === 'p5' ? 'יציקת התקרה' : 'יציקת תקרת הגג',
    materials: [
      line('בטון ב-30 לתקרה', m3 * 1.03, 'מ״ק', 1),
      line('שטח תקרה', slab.area, 'מ״ר', 0),
      line('מערבלים (8 מ״ק)', Math.ceil((m3 * 1.03) / 8), 'נסיעות', 0),
      line('משאבת בטון', 1, 'יום', 0),
    ],
    costILS: roundCost(m3 * 1.03 * PRICES.concreteM3 + PRICES.pumpDay),
    parts: pourParts,
    camera: { bounds: pourBounds(outline, pump, yTop - 2, yTop + 2), azimuth: 35, polar: 52 },
    view: { xray: false },
  };

  return { props, deck: deckStep, rebarBottom, conduits: conduitSt, rebarTop, pour, svc, pump };
}

const grow = (r: Vec2[], d: number): Vec2[] => {
  const xs = r.map((p) => p[0]);
  const zs = r.map((p) => p[1]);
  const x0 = Math.min(...xs) - d;
  const x1 = Math.max(...xs) + d;
  const z0 = Math.min(...zs) - d;
  const z1 = Math.max(...zs) + d;
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
};

/** Ceiling boxes at room centers, orange conduits (MST, L-routes), plumbing sleeves. */
export function services(ctx: BuildContext, fr: StructureFrame, spec: CeilingSpec, deck: Region) {
  const P = spec.id;
  const id = P === 'p5' ? 'p5-conduits' : 'p6-roof-rebar';
  const below = P === 'p5' ? 'lower' : 'entrance';
  const rooms = ctx.house.rooms.filter((r) => r.level === below && r.kind !== 'terrace');
  const pts: Vec2[] = [];
  for (const r of rooms) {
    const c = polygonCentroid(r.polygon);
    if (deck.contains(c) && pointInPolygon(c, r.polygon)) pts.push(c);
    // Big rooms get two points.
    if (r.area > 18) {
      const xs = r.polygon.map((p) => p[0]);
      const zs = r.polygon.map((p) => p[1]);
      const wide = Math.max(...xs) - Math.min(...xs) > Math.max(...zs) - Math.min(...zs);
      for (const k of [-1, 1]) {
        const q: Vec2 = wide ? [c[0] + k * (Math.max(...xs) - Math.min(...xs)) * 0.25, c[1]] : [c[0], c[1] + k * (Math.max(...zs) - Math.min(...zs)) * 0.25];
        if (deck.contains(q) && pointInPolygon(q, r.polygon)) pts.push(q);
      }
    }
  }
  // Panel feed: near the stair (enters from the floor below / the panel by the entry).
  const st = ctx.house.stairs[0];
  const near: Vec2 = st ? polygonCentroid(st.footprint) : polygonCentroid(spec.slab.shapes()[0]?.outline ?? [[0, 0]]);
  const feed: Vec2 = gridPoints(deck, [0.5, 0.5], 0.3).reduce<Vec2>((b, p) => (dist2(p, near) < dist2(b, near) ? p : b), pts[0] ?? near);
  const nodes = [feed, ...pts];
  // Prim MST.
  const inTree = new Set<number>([0]);
  const edges: Array<[number, number]> = [];
  while (inTree.size < nodes.length) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const i of Array.from(inTree))
      for (let j = 0; j < nodes.length; j++) {
        if (inTree.has(j)) continue;
        const d = dist2(nodes[i], nodes[j]);
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    if (!best) break;
    inTree.add(best[1]);
    edges.push(best);
  }
  const yC = (p: Vec2) => spec.bottom(p) + 0.075;
  const parts: Part[] = [];
  let len = 0;
  edges.forEach(([i, j], k) => {
    const a = nodes[i];
    const b = nodes[j];
    const mid: Vec2 = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
    // A gentle offset in the middle so runs snake rather than cross exactly at boxes.
    const route: Vec2[] = [a, mid, b].filter((p, q, arr) => q === 0 || dist2(p, arr[q - 1]) > 0.05);
    const pts3: Vec3[] = route.map((p) => [p[0], yC(p), p[1]] as Vec3);
    for (let q = 1; q < route.length; q++) len += dist2(route[q - 1], route[q]);
    if (pts3.length >= 2)
      parts.push({
        id: `${id}:conduit${k}`,
        shape: { kind: 'tube', points: pts3, radius: 0.017, bend: 0.35, radialSegments: 6 },
        material: 'conduit',
        tags: ['conduit', 'mep-ceiling', ...spec.tags],
        edges: false,
        anim: { type: 'fade', delay: (P === 'p5' ? 0.6 : 1.6) + k * fit(2.0, edges.length, 0.25), duration: 0.5 },
      });
  });
  const boxes = pts.map((p) => ({ at: [p[0], spec.bottom(p), p[1]] as Vec3 }));
  parts.unshift({
    id: `${id}:boxes`,
    shape: { kind: 'instances', of: { kind: 'cylinder', radius: 0.07, height: 0.08, segments: 12 }, items: boxes },
    material: 'conduit',
    tags: ['ceiling-box', ...spec.tags],
    anim: { type: 'grow', delay: P === 'p5' ? 0 : 1.4, duration: 0.35, stagger: fit(0.6, boxes.length, 0.08) },
  });
  // Plumbing sleeves through the slab under the wet rooms above (only for the lower ceiling).
  const sleeves: Array<{ a: Vec3; b: Vec3; r: number }> = [];
  if (P === 'p5') {
    const wet = ctx.house.rooms.filter((r) => r.level === 'entrance' && ['bath', 'wc', 'kitchen', 'laundry'].includes(r.kind));
    for (const r of wet) {
      const c = polygonCentroid(r.polygon);
      for (const [dx, dz, rad] of [
        [0.35, 0.25, 0.055],
        [-0.3, 0.3, 0.032],
      ] as const) {
        const q: Vec2 = [c[0] + dx, c[1] + dz];
        if (!deck.contains(q)) continue;
        sleeves.push({ a: [q[0], spec.bottom(q) + 0.001, q[1]], b: [q[0], spec.top(q) + 0.035, q[1]], r: rad });
      }
    }
    // Installation shafts: walls named *-SH* enclose a small box.
    const sh = ctx.house.walls.filter((w) => w.level === 'entrance' && /-SH[NSEW]$/.test(w.id));
    if (sh.length >= 2) {
      const xs = sh.flatMap((w) => [w.a[0], w.b[0]]);
      const zs = sh.flatMap((w) => [w.a[1], w.b[1]]);
      const c: Vec2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
      for (const dz of [-0.35, 0.35]) {
        const q: Vec2 = [c[0], c[1] + dz];
        if (deck.contains(q)) sleeves.push({ a: [q[0], spec.bottom(q) + 0.001, q[1]], b: [q[0], spec.top(q) + 0.035, q[1]], r: 0.08 });
      }
    }
    if (sleeves.length)
      parts.push({
        id: `${id}:sleeves`,
        shape: { kind: 'rods', radius: 0.055, segments: 14, items: sleeves.map((s) => ({ a: s.a, b: s.b, r: s.r })) },
        material: 'drain',
        tags: ['sleeves', ...spec.tags],
        anim: { type: 'rise', delay: 2.6, duration: 0.5, stagger: fit(0.8, sleeves.length, 0.12) },
      });
  }
  return { parts, boxes, sleeves, len };
}

function curing(fr: StructureFrame, spec: CeilingSpec): StepDef {
  const films: Part[] = [];
  spec.slabs.forEach((r, i) => {
    if (r.empty) return;
    const any = r.rects()[0];
    const q: Vec2 = [(any.x0 + any.x1) / 2, (any.z0 + any.z1) / 2];
    const t = spec.top(q);
    r.shapes().forEach((sh, k) => {
      films.push({
        id: `p5-curing:film${i}-${k}`,
        shape: { kind: 'extrude', outline: sh.outline, holes: sh.holes, y0: t + 0.009, y1: t + 0.013 },
        material: 'water',
        color: '#61798A',
        tags: ['p5-curing-kit', LVL],
        edges: false,
        highlight: false,
        anim: { type: 'fade', delay: 0.4, duration: 2.2 },
      });
    });
  });
  // Sprinklers on a coarse grid, a green hose linking them and dropping over the edge.
  const sp = gridPoints(spec.slab, [3.4, 3.4], 1.0, [spec.slab.xs[0] + 1.6, spec.slab.zs[0] + 1.6]).slice(0, 4);
  const topAt = (p: Vec2) => spec.top(p) + 0.02;
  const hose: Vec3[] = sp.map((p) => [p[0], topAt(p), p[1]] as Vec3);
  if (hose.length) {
    // Run from the slab's south edge down to the ground.
    const last = sp[sp.length - 1];
    let edgeZ = last[1];
    while (spec.slab.contains([last[0], edgeZ + 0.1]) && edgeZ < last[1] + 30) edgeZ += 0.1;
    hose.push([last[0], topAt(last), edgeZ + 0.05], [last[0], topAt(last) - 0.05, edgeZ + 0.12], [last[0], fr.lowerFloorAt([last[0], edgeZ + 0.6]) + 0.03, edgeZ + 0.6]);
  }
  const parts: Part[] = [...films];
  if (hose.length >= 2)
    parts.push({
      id: 'p5-curing:hose',
      shape: { kind: 'tube', points: hose, radius: 0.014, bend: 0.25, radialSegments: 6 },
      material: 'grass',
      color: '#2F7D45',
      tags: ['p5-curing-kit', LVL],
      edges: false,
      anim: { type: 'fade', delay: 0.2, duration: 0.6 },
    });
  if (sp.length) {
    parts.push(
      {
        id: 'p5-curing:sprinklers',
        shape: { kind: 'instances', of: { kind: 'cylinder', radius: 0.035, height: 0.14, segments: 8 }, items: sp.map((p) => ({ at: [p[0], topAt(p) - 0.01, p[1]] as Vec3 })) },
        material: 'steel',
        tags: ['p5-curing-kit', LVL],
        anim: { type: 'grow', delay: 0.3, duration: 0.3 },
      },
      {
        id: 'p5-curing:spray',
        shape: { kind: 'instances', of: { kind: 'cylinder', radius: 1.1, radiusTop: 0.05, height: 0.45, segments: 18, open: true }, items: sp.map((p) => ({ at: [p[0], topAt(p) + 0.02, p[1]] as Vec3, rot: [Math.PI, 0, 0] as Vec3 })) },
        material: 'water',
        color: '#CFEAF7',
        opacity: 0.32,
        tags: ['p5-curing-kit', LVL],
        edges: false,
        highlight: false,
        anim: { type: 'grow', delay: 0.8, duration: 0.8, stagger: 0.15 },
      },
    );
  }
  const outline = spec.slab.shapes().flatMap((s) => s.outline);
  const yTop = Math.max(...outline.map((p) => spec.top(p)));
  return {
    id: 'p5-curing',
    phase: 5,
    titleHe: 'אשפרה',
    materials: [line('הרטבת התקרה', 7, 'ימים', 0), line('ממטרות', sp.length, 'יח׳', 0), line('שטח לאשפרה', spec.slab.area, 'מ״ר', 0)],
    costILS: STRUCT_RATES.curingLump,
    remove: { tags: ['p5-pour-machine', 'pour-tiles'] },
    parts,
    camera: { bounds: boundsOf(outline, yTop - 2.5, yTop + 1, 0.8), azimuth: 30, polar: 50 },
    view: { xray: false },
  };
}

