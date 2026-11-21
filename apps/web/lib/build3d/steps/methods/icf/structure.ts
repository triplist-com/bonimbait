/**
 * Method "icf" — structure phases (docs/build3d/METHODS.md § icf):
 *  4 · lower floor: ICF courses → rebar in the cores → alignment braces → pump pour in lifts,
 *      then the shared waterproofing / backfill / slab-on-grade steps.
 *  5 · the shared lower-ceiling steps, rebuilt so the deck and props bear on the ICF walls.
 *  6 · shared ground slab, entrance ICF courses / rebar / braces, the shared cast-in-place ממ״ד,
 *      the ICF pour, then the roof slab (bearing on the ICF walls) and the big strip.
 *  7 · ICF parapets (one pour) + the shared partitions and blind frames.
 *
 * The shared steps of phases 4–6 come from the concrete builders run ONCE on an "ICF view" of the
 * house: every ICF wall is added as an extra (wall-shaped) column, so decks and props treat it as a
 * support, and the lower slab outline is trimmed to the ICF inner faces, so the slab stops there.
 * Walls are untouched, so the retaining-wall waterproofing, the backfill and the cast-in-place ממ״ד
 * come out exactly as in the concrete method.
 */
import { polygonArea, polygonCentroid, wallFrame } from '../../../house/geometry';
import type { Column, HouseModel, Wall } from '../../../house/types';
import type { Anim, Part, StepDef, Vec2, Vec3 } from '../../../engine/types';
import type { BuildContext } from '../../context';
import { PRICES, line, model, roundCost } from '../../kit';
import { pick } from '../compose';
import { phaseLowerStructure } from '../../p04-lower-structure';
import { phaseLowerCeiling } from '../../p05-lower-ceiling';
import { phaseEntranceStructure } from '../../p06-entrance-structure';
import { phaseMasonry } from '../../p07-masonry';
import {
  Region,
  boundsOf,
  boxVolume,
  columnCages,
  columnForms,
  columnRect,
  fit,
  formGhosts,
  pieceRect,
  pumpPart,
  pumpSpot,
  rodLength,
  structureFrame,
  wallRect,
  type BoxItem,
  type PumpSpot,
} from '../../structure-kit';
import { cornerCuts, rectBox, type Rect } from '../../envelope-kit';
import { EPS_COLOR, ICF, ICF_RATES, WEB_COLOR, icfBraces, icfLayout, inWallColumns, isBeamOnly, type IcfBraces, type IcfLayout } from './icf-kit';

type Lvl = 'lower' | 'entrance';
const ROLES = new Set<Wall['role']>(['exterior', 'retaining']);

// ---------------------------------------------------------------------------
// Which walls are ICF, the ICF view of the house, memoized layouts
// ---------------------------------------------------------------------------

function icfWalls(ctx: BuildContext, lvl: Lvl): Wall[] {
  const floorY = lvl === 'lower' ? ctx.lower.floorY : ctx.entrance.floorY;
  return ctx.house.walls.filter((w) => w.level === lvl && ROLES.has(w.role) && !isBeamOnly(w, ctx.house.openings, floorY));
}

/** An ICF wall as a wall-shaped column (a deck support in the ICF view). Axis-aligned walls. */
function wallColumn(w: Wall): Column {
  const f = wallFrame(w);
  const L = f.length;
  const alongX = Math.abs(f.dir[0]) > 0.5;
  // Only the footprint matters (deck supports); a token height keeps the concrete column steps that
  // run on the ICF view (and are dropped) from caging and forming every wall.
  return { id: `ICF-${w.id}`, level: w.level as Column['level'], center: f.mid, size: alongX ? [L, w.thickness] : [w.thickness, L], baseY: w.baseY, height: 0.02 };
}

interface IcfModel {
  /** The ICF view of the context (ICF walls are extra columns, the lower slab stops at their faces). */
  ictx: BuildContext;
  lower: IcfLayout;
  entrance: IcfLayout;
  lowerBraces: IcfBraces;
  entranceBraces: IcfBraces;
  /** Columns that stand free of the ICF walls (formed and cast with the ICF pour). */
  freeEntrance: Column[];
}

const models = new WeakMap<BuildContext, IcfModel>();

export function icfModel(ctx: BuildContext): IcfModel {
  const hit = models.get(ctx);
  if (hit) return hit;
  const fr = structureFrame(ctx);
  const lw = icfWalls(ctx, 'lower');
  const ew = icfWalls(ctx, 'entrance');
  const lc = inWallColumns(fr.lowerCols, lw);
  const ec = inWallColumns(fr.entranceCols, ew);
  // ICF view: walls as extra columns; the lower slab outline minus the ICF footprint (largest ring).
  const lowerRects = [...lw.map((w) => wallRect(w)), ...lc.map((c) => columnRect(c))];
  const slabs = ctx.house.slabs.map((sl) => {
    if (sl.level !== 'lower' || sl.role !== 'ground') return sl;
    const rings = Region.of([sl.outline], lowerRects).shapes();
    const big = rings.reduce<Vec2[] | null>((b, r) => (!b || polygonArea(r.outline) > polygonArea(b) ? r.outline : b), null);
    return big ? { ...sl, outline: big } : sl;
  });
  const house: HouseModel = { ...ctx.house, columns: [...ctx.house.columns, ...[...lw, ...ew].map(wallColumn)], slabs };
  const ictx: BuildContext = { ...ctx, house };
  const lower = icfLayout({
    key: 'lower',
    walls: lw,
    cols: lc,
    openings: ctx.house.openings,
    y0: ctx.y.lowerBeamTop,
    y1: fr.y.wallTopLower,
    floorY: ctx.lower.floorY,
    doorY: fr.y.lowerTop,
    slabAbove: fr.above.lower,
    inside: ctx.footprint.lower,
  });
  const ey0 = Math.min(...ew.map((w) => w.baseY));
  const entrance = icfLayout({
    key: 'entrance',
    walls: ew,
    cols: ec,
    openings: ctx.house.openings,
    y0: ey0,
    y1: fr.y.wallTopEntrance,
    floorY: ctx.entrance.floorY,
    doorY: ey0,
    slabAbove: fr.above.entrance,
    inside: ctx.footprint.entrance,
  });
  // Braces never stand where the ממ״ד forms go, nor in the stair void.
  const mamadRects = fr.entranceWalls.cast.map((p) => pieceRect(p, 0.25));
  const lowerBraces = icfBraces(lower, { floorAt: () => ctx.y.gravelTop });
  const entranceBraces = icfBraces(entrance, { floorAt: (p) => fr.entranceFloorAt(p), avoid: mamadRects });
  const freeEntrance = fr.entranceCols.filter((c) => !ec.includes(c));
  const m: IcfModel = { ictx, lower, entrance, lowerBraces, entranceBraces, freeEntrance };
  models.set(ctx, m);
  return m;
}

// ---------------------------------------------------------------------------
// Part builders shared by both storeys
// ---------------------------------------------------------------------------

const lvlTag = (l: Lvl) => `level:${l}`;
const slideIn = (ctx: BuildContext, d: number): Vec3 => [-ctx.lot.street.inward[0] * d, 0, -ctx.lot.street.inward[1] * d];

/** The near corner of a layout (courses start there and sweep away). */
function startCorner(L: IcfLayout, toward: Vec2): Vec2 {
  return L.points.reduce((b, p) => (Math.hypot(p[0] - toward[0], p[1] - toward[1]) < Math.hypot(b[0] - toward[0], b[1] - toward[1]) ? p : b), L.points[0] ?? [0, 0]);
}

function courseParts(id: string, L: IcfLayout, tags: string[], origin: Vec2, t0 = 0.2, per = 0.42): Part[] {
  const parts: Part[] = L.eps.map(
    (items, k): Part => ({
      id: `${id}:c${k}`,
      shape: { kind: 'boxes', items },
      material: 'insulation',
      color: EPS_COLOR,
      tags: ['icf', 'icf-eps', ...tags],
      anim: { type: 'drop', from: [0, 0.45, 0], delay: t0 + k * per, duration: 0.32, stagger: fit(per * 0.8, items.length, 0.01), order: 'near', origin, ease: 'out' },
    }),
  );
  if (L.webs.length)
    parts.push({
      id: `${id}:webs`,
      shape: { kind: 'boxes', items: L.webs },
      material: 'drain',
      color: WEB_COLOR,
      // 'spacers': embedded ties vanish under x-ray instead of ghosting into a dark cage.
      tags: ['icf', 'icf-webs', 'spacers', ...tags.filter((t) => t.startsWith('level:'))],
      edges: false,
      anim: { type: 'courses', delay: t0 + 0.05, duration: 0.3, stagger: per },
    });
  return parts;
}

function buckParts(id: string, L: IcfLayout, lvl: Lvl, delay: number): Part[] {
  if (!L.bucks.length) return [];
  return [
    {
      id: `${id}:bucks`,
      shape: { kind: 'boxes', items: L.bucks },
      material: 'timber',
      tags: ['formwork', 'icf-bucks', lvlTag(lvl)],
      exit: { type: 'fade', duration: 0.6 },
      anim: { type: 'grow', delay, duration: 0.4, stagger: fit(1.2, L.bucks.length, 0.05), order: 'x' },
    },
    {
      id: `${id}:buck-braces`,
      shape: { kind: 'rods', radius: 0.02, segments: 6, items: L.buckBraces },
      material: 'timber',
      tags: ['formwork', 'icf-bucks', lvlTag(lvl)],
      exit: { type: 'fade', duration: 0.6 },
      anim: { type: 'grow', delay: delay + 1.0, duration: 0.3, stagger: fit(0.6, L.buckBraces.length, 0.05) },
    },
  ];
}

/** A pallet of EPS blocks (crew props for the stacking step). */
function palletParts(id: string, at: Vec3, rotY: number, tags: string[]): Part[] {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const loc = (x: number, z: number): Vec2 => [at[0] + x * c + z * s, at[2] - x * s + z * c];
  const items: BoxItem[] = [];
  for (let layer = 0; layer < 5; layer++)
    for (const z of [-0.32, 0.32]) {
      const p = loc(0, z);
      items.push({ at: [p[0], at[1] + 0.14 + layer * 0.405 + 0.2, p[1]], size: [1.2, 0.4, 0.3], rotY });
    }
  const p0 = loc(0, 0);
  return [
    { id: `${id}:pallet`, shape: { kind: 'box', size: [1.25, 0.12, 1.0], at: [p0[0], at[1] + 0.06, p0[1]], rotY }, material: 'timber', tags, anim: { type: 'drop', from: [0, 2, 0], duration: 0.6 } },
    { id: `${id}:stack`, shape: { kind: 'boxes', items }, material: 'insulation', color: EPS_COLOR, tags, anim: { type: 'drop', from: [0, 2, 0], duration: 0.6 } },
  ];
}

function rebarParts(id: string, L: IcfLayout, lvl: Lvl, origin: Vec2): Part[] {
  const tags = ['rebar', 'icf-rebar', lvlTag(lvl)];
  return [
    { id: `${id}:h`, shape: { kind: 'rods', radius: 0.006, segments: 5, items: L.barsH }, material: 'rebar', tags, anim: { type: 'rise', duration: 0.4, stagger: fit(1.6, L.barsH.length, 0.02), order: 'y' } },
    { id: `${id}:v`, shape: { kind: 'rods', radius: 0.007, segments: 6, items: L.barsV }, material: 'rebar', tags, anim: { type: 'drop', from: [0, 1.6, 0], delay: 1.8, duration: 0.45, stagger: fit(2.0, L.barsV.length, 0.03), order: 'near', origin, ease: 'out' } },
    { id: `${id}:lintels`, shape: { kind: 'rods', radius: 0.007, segments: 6, items: L.barsLintel }, material: 'rebar', tags, anim: { type: 'grow', delay: 4.0, duration: 0.3, stagger: fit(0.6, L.barsLintel.length, 0.04) } },
  ].filter((p) => (p.shape as { items: unknown[] }).items.length > 0) as Part[];
}

function braceParts(id: string, B: IcfBraces, lvl: Lvl, tag: string, origin: Vec2): Part[] {
  const tags = ['formwork', 'icf-braces', tag, lvlTag(lvl)];
  const near = (delay: number, n: number, total = 1.4): Anim => ({ type: 'rise', delay, duration: 0.4, stagger: fit(total, n, 0.06), order: 'near', origin });
  return [
    { id: `${id}:uprights`, shape: { kind: 'boxes', items: B.uprights }, material: 'steel', tags, anim: near(0, B.uprights.length) },
    { id: `${id}:kickers`, shape: { kind: 'rods', radius: 0.021, segments: 8, items: B.kickers }, material: 'pipeBlue', tags, anim: { ...near(1.1, B.kickers.length), type: 'grow' } },
    { id: `${id}:feet`, shape: { kind: 'boxes', items: B.feet }, material: 'steel', tags, anim: { type: 'fade', delay: 1.2, duration: 0.3 } },
    { id: `${id}:arms`, shape: { kind: 'boxes', items: B.arms }, material: 'steel', tags, anim: { ...near(2.2, B.arms.length, 1.0), type: 'grow' } },
    { id: `${id}:struts`, shape: { kind: 'rods', radius: 0.012, segments: 5, items: B.struts }, material: 'steel', tags, anim: { ...near(2.3, B.struts.length, 1.0), type: 'grow' } },
    { id: `${id}:planks`, shape: { kind: 'boxes', items: B.planks }, material: 'timber', tags, anim: { type: 'drop', from: [0, 0.8, 0], delay: 3.1, duration: 0.45, stagger: fit(0.9, B.planks.length, 0.08), order: 'near', origin, ease: 'out' } },
    { id: `${id}:posts`, shape: { kind: 'boxes', items: B.posts }, material: 'steel', tags, anim: { ...near(3.8, B.posts.length, 0.6), type: 'grow' } },
    { id: `${id}:rails`, shape: { kind: 'rods', radius: 0.014, segments: 5, items: B.rails }, material: 'galvanized', tags, anim: { type: 'grow', delay: 4.3, duration: 0.3, stagger: fit(0.5, B.rails.length, 0.03) } },
  ].filter((p) => (p.shape as { items: unknown[] }).items.length > 0) as Part[];
}

function liftParts(id: string, L: IcfLayout, lvl: Lvl, origin: Vec2, t0 = 1.4, per = 1.25): Part[] {
  return L.lifts.map(
    (items, k): Part => ({
      id: `${id}:lift${k}`,
      shape: { kind: 'boxes', items },
      material: 'concrete',
      tags: ['concrete', 'walls', 'icf-core', lvlTag(lvl)],
      edges: false,
      anim: { type: 'pour', delay: t0 + k * per, duration: per * 0.62, stagger: fit(per * 0.4, items.length, 0.01), order: 'near', origin, ease: 'inOut' },
    }),
  );
}

/** Two workers on the walk boards nearest the hose. */
function pourCrew(id: string, B: IcfBraces, aim: Vec2, tags: string[]): Part[] {
  const st = [...B.stands].sort((p, q) => Math.hypot(p.at[0] - aim[0], p.at[2] - aim[1]) - Math.hypot(q.at[0] - aim[0], q.at[2] - aim[1])).slice(0, 2);
  return st.map((s, i) => model(`${id}:w${i}`, 'worker', s.at, s.rotY, { tags: ['machine', ...tags], shape: { kind: 'model', name: 'worker', seed: 30 + i * 7 } }));
}

const camOf = (L: IcfLayout, yLow: number, yHigh: number, azimuth: number, polar: number, grow = 1.6, extra: Vec2[] = []) => ({
  bounds: boundsOf([...L.points, ...extra], yLow, yHigh, grow),
  azimuth,
  polar,
});

function pourLines(L: IcfLayout, nameHe: string) {
  const m3 = L.coreM3 * 1.03;
  return {
    m3,
    lines: [line(`בטון ב-30 ${nameHe}`, m3, 'מ״ק', 1), line('משאבת בטון', 1, 'יום', 0), line('מערבלי בטון', Math.ceil(m3 / 8), 'נסיעות', 0), line('שכבות יציקה של כמטר', L.lifts.length, 'סבבים', 0)],
    cost: roundCost(m3 * (PRICES.concreteM3 + ICF_RATES.mixExtraM3) + PRICES.pumpDay + L.area * ICF_RATES.pourLaborM2),
  };
}

const rebarTon = (L: IcfLayout) => L.rebarKg / 1000;

/**
 * Where the hose starts the pour: the ICF wall nearest the site gate (a one-rect region keeps the
 * pump search cheap; the full ICF footprint has hundreds of runs).
 */
function hoseTarget(ctx: BuildContext, L: IcfLayout): Region {
  const g = ctx.lot.gate;
  const w = [...L.spec.walls].sort((p, q) => {
    const mp = wallFrame(p).mid;
    const mq = wallFrame(q).mid;
    return Math.hypot(mp[0] - g[0], mp[1] - g[1]) - wallFrame(p).length * 0.3 - (Math.hypot(mq[0] - g[0], mq[1] - g[1]) - wallFrame(q).length * 0.3);
  })[0];
  return w ? Region.of([wallRect(w)]) : L.region;
}

// ---------------------------------------------------------------------------
// Phase 4 · lower floor: ICF walls
// ---------------------------------------------------------------------------

export function phaseIcfLower(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const M = icfModel(ctx);
  const L = M.lower;
  const LV = lvlTag('lower');
  const y1 = L.spec.y1;
  const c = polygonCentroid(L.points);
  const origin = startCorner(L, [c[0], c[1] - 20]);
  const camLow = ctx.y.pitFloor;
  const steps: StepDef[] = [];

  // ---------------------------------------------------------------- courses
  const palletAt: Vec3 = [c[0] - 0.6, ctx.y.gravelTop, c[1] + 0.4];
  steps.push({
    id: 'p4i-icf-courses',
    phase: 4,
    titleHe: 'הנחת בלוקי ICF',
    materials: [
      line('תבניות ICF מקלקר (120×40 ס״מ)', L.blocks, 'יח׳', 0),
      line('שטח קירות ICF', L.area, 'מ״ר', 0),
      line('קלקר (EPS) בתבניות', L.area * ICF.epsReal * 2, 'מ״ק', 1),
      line('מסגרות עץ בפתחים', L.holes.length, 'יח׳', 0),
    ],
    costILS: roundCost(L.area * ICF_RATES.formM2 + L.holes.length * ICF_RATES.buck),
    parts: [
      ...courseParts('p4i-icf-courses', L, ['icf-eps-lower', LV], origin),
      ...buckParts('p4i-icf-courses', L, 'lower', 1.4),
      ...palletParts('p4i-icf-courses:crew', palletAt, 0.2, ['machine', 'p4i-crew', LV]),
      model('p4i-icf-courses:w1', 'worker', [c[0] + 1.0, ctx.y.gravelTop, c[1] - 0.8], 2.6, { tags: ['machine', 'p4i-crew', LV], shape: { kind: 'model', name: 'worker', seed: 5 } }),
      model('p4i-icf-courses:w2', 'worker', [c[0] - 1.8, ctx.y.gravelTop, c[1] - 1.6], 0.9, { tags: ['machine', 'p4i-crew', LV], shape: { kind: 'model', name: 'worker', seed: 11 } }),
    ],
    camera: camOf(L, camLow, y1 + 0.4, 200, 58, 1.8),
    view: { xray: false },
  });

  // ---------------------------------------------------------------- rebar
  steps.push({
    id: 'p4i-icf-rebar',
    phase: 4,
    titleHe: 'ברזל בתוך התבניות',
    materials: [
      line('ברזל זיון בקירות ICF', rebarTon(L), 'טון', 2),
      line('מוטות אנכיים בליבות', L.barsV.length, 'יח׳', 0),
      line('מוטות אופקיים בתפסני הגשרים', rodLength(L.barsH), 'מ׳', 0),
      line('ברזל משקופים מעל פתחים', L.barsLintel.length, 'יח׳', 0),
    ],
    costILS: roundCost(rebarTon(L) * PRICES.rebarTon),
    remove: { tags: ['p4i-crew'] },
    parts: rebarParts('p4i-icf-rebar', L, 'lower', origin),
    camera: camOf(L, camLow, y1 + 0.6, 165, 50, 1.4),
    view: { xray: false, ghostTags: ['icf-eps-lower', 'icf-webs'] },
  });

  // ---------------------------------------------------------------- bracing
  const B = M.lowerBraces;
  steps.push({
    id: 'p4i-icf-bracing',
    phase: 4,
    titleHe: 'מערכת יישור ותמיכה',
    materials: [
      line('תומכות יישור עם רגל מתכווננת', B.count, 'יח׳', 0),
      line('קרשי הליכה', B.planks.reduce((s, p) => s + p.size[0], 0) / 2, 'מ׳', 0),
      line('מעקה בטיחות', rodLength(B.rails) / 2, 'מ׳', 0),
    ],
    costILS: roundCost(L.area * ICF_RATES.bracingM2),
    parts: braceParts('p4i-icf-bracing', B, 'lower', 'p4i-braces', origin),
    camera: camOf(L, camLow, y1 + 0.8, 25, 52, 1.2),
    view: { xray: false },
  });

  // ---------------------------------------------------------------- pour
  const pump: PumpSpot = pumpSpot(ctx, hoseTarget(ctx, L), c, ctx.terrain.excavated, fr.backfill, y1);
  const pr = pourLines(L, 'לקירות ICF (אגרגט עד 11 מ״מ)');
  steps.push({
    id: 'p4i-icf-pour',
    phase: 4,
    titleHe: 'יציקת הקירות',
    materials: pr.lines,
    costILS: pr.cost,
    parts: [
      ...liftParts('p4i-icf-pour', L, 'lower', pump.origin),
      pumpPart('p4i-icf-pour:pump', pump, { tags: ['machine', 'pump', 'p4i-pump'], anim: { type: 'slide', from: slideIn(ctx, 10), duration: 1.3 } }),
      ...pourCrew('p4i-icf-pour:crew', B, pump.origin, ['p4i-pour-crew', LV]),
    ],
    camera: { bounds: boundsOf([...L.points, [pump.tip[0], pump.tip[2]]], camLow, pump.tip[1] + 0.5, 1.2), azimuth: 140, polar: 54 },
    view: { xray: false, ghostTags: ['icf-eps-lower', 'icf-webs'] },
  });

  // ---------------------------------------------------------------- shared: waterproofing + backfill (soil side of the
  // retaining walls, as in concrete) and the slab on grade, which stops at the ICF faces in the ICF view
  const [wp, ...rest] = pick(phaseLowerStructure(M.ictx), ['p4-waterproofing', 'p4-backfill', 'p4-subbase', 'p4-slab-mesh', 'p4-slab-pour']);
  steps.push({ ...wp, remove: { tags: [...(wp.remove?.tags ?? []), 'p4i-pump', 'p4i-braces', 'p4i-pour-crew'], ids: wp.remove?.ids } }, ...rest);
  return steps;
}

// ---------------------------------------------------------------------------
// Phase 5 · lower ceiling (shared steps; the deck bears on the ICF walls)
// ---------------------------------------------------------------------------

export function phaseIcfCeiling(ctx: BuildContext): StepDef[] {
  const steps = phaseLowerCeiling(icfModel(ctx).ictx);
  const props = steps.find((s) => s.id === 'p5-props');
  // No column steps in ICF: the props step also clears the slab pour's machines and tiles.
  if (props) props.remove = { tags: ['p4-slab-machine', 'pour-tiles'] };
  return steps;
}

// ---------------------------------------------------------------------------
// Phase 6 · entrance floor: ICF walls, ממ״ד, roof slab
// ---------------------------------------------------------------------------

export function phaseIcfEntrance(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const M = icfModel(ctx);
  const L = M.entrance;
  const LV = lvlTag('entrance');
  const y1 = L.spec.y1;
  const c = polygonCentroid(L.points);
  const origin = startCorner(L, [ctx.lot.gate[0], ctx.lot.gate[1]]);
  // Shared steps from the ICF view: ground slab and ממ״ד as in concrete; the roof deck avoids the ICF walls.
  const [gsPrep, gsPour, mRebar, mForms, mPour, deck, rebar, roofPour, strip] = pick(phaseEntranceStructure(M.ictx), [
    'p6-ground-slab-prep',
    'p6-ground-slab-pour',
    'p6-mamad-rebar',
    'p6-mamad-forms',
    'p6-mamad-pour',
    'p6-roof-deck',
    'p6-roof-rebar',
    'p6-roof-pour',
    'p6-strip-all',
  ]);
  const steps: StepDef[] = [gsPrep, gsPour];

  // Free-standing columns (not in an ICF wall line): cage with the rebar, plywood box with the braces.
  const free = M.freeEntrance;
  const cTop = (k: Column) => k.baseY + k.height;
  const cages = columnCages(free, (k) => k.baseY, cTop, fr.above.entrance, 0.14);
  const cf = columnForms(free, (k) => k.baseY, cTop, (p) => fr.entranceFloorAt(p), c);
  const colForms: Part[] = free.length
    ? [
        { id: 'p6i-icf-bracing:col-ply', shape: { kind: 'boxes', items: cf.ply }, material: 'plywood', tags: ['formwork', 'p6i-col-forms', LV], exit: 'none', anim: { type: 'drop', from: [0, 1.4, 0], delay: 3.6, duration: 0.5, stagger: 0.05, ease: 'out' } },
        { id: 'p6i-icf-bracing:col-clamps', shape: { kind: 'boxes', items: cf.clamps }, material: 'steel', tags: ['formwork', 'p6i-col-forms', LV], exit: 'none', anim: { type: 'drop', from: [0, 0.5, 0], delay: 4.2, duration: 0.3, stagger: 0.02, order: 'y' } },
        { id: 'p6i-icf-bracing:col-braces', shape: { kind: 'rods', radius: 0.022, segments: 8, items: cf.braces }, material: 'pipeBlue', tags: ['formwork', 'p6i-col-forms', LV], exit: 'none', anim: { type: 'rise', delay: 4.6, duration: 0.4 } },
      ]
    : [];
  const colConcrete: BoxItem[] = free.map((k) => ({ at: [k.center[0], (k.baseY + cTop(k)) / 2, k.center[1]] as Vec3, size: [k.size[0], k.height, k.size[1]] as Vec3, rotY: k.rotation ?? 0 }));

  // ---------------------------------------------------------------- courses
  const palletAt: Vec3 = [c[0] + 0.8, fr.entranceFloorAt([c[0] + 0.8, c[1] + 0.6]) ?? ctx.entrance.floorY - 0.08, c[1] + 0.6];
  steps.push({
    id: 'p6i-icf-courses',
    phase: 6,
    titleHe: 'בלוקי ICF בקומת הכניסה',
    materials: [
      line('תבניות ICF מקלקר (120×40 ס״מ)', L.blocks, 'יח׳', 0),
      line('שטח קירות ICF', L.area, 'מ״ר', 0),
      line('קלקר (EPS) בתבניות', L.area * ICF.epsReal * 2, 'מ״ק', 1),
      line('מסגרות עץ בפתחים', L.holes.length, 'יח׳', 0),
    ],
    costILS: roundCost(L.area * ICF_RATES.formM2 + L.holes.length * ICF_RATES.buck),
    remove: { tags: ['p6-gs-machine', 'pour-tiles', 'p6-gs-edge-forms'] },
    parts: [
      ...courseParts('p6i-icf-courses', L, ['icf-eps-entrance', LV], origin),
      ...buckParts('p6i-icf-courses', L, 'entrance', 1.4),
      ...palletParts('p6i-icf-courses:crew', palletAt, 1.1, ['machine', 'p6i-crew', LV]),
      model('p6i-icf-courses:w1', 'worker', [c[0] - 1.2, palletAt[1], c[1] + 1.4], 0.4, { tags: ['machine', 'p6i-crew', LV], shape: { kind: 'model', name: 'worker', seed: 17 } }),
      model('p6i-icf-courses:w2', 'worker', [c[0] + 2.2, palletAt[1], c[1] - 1.8], 3.3, { tags: ['machine', 'p6i-crew', LV], shape: { kind: 'model', name: 'worker', seed: 23 } }),
    ],
    camera: camOf(L, -0.4, y1 + 0.4, 35, 54, 1.4),
    view: { xray: false },
  });

  // ---------------------------------------------------------------- rebar (+ free column cages)
  const freeTon = cages.kg / 1000;
  steps.push({
    id: 'p6i-icf-rebar',
    phase: 6,
    titleHe: 'ברזל בתבניות קומת הכניסה',
    materials: [
      line('ברזל זיון בקירות ICF', rebarTon(L), 'טון', 2),
      line('מוטות אנכיים בליבות', L.barsV.length, 'יח׳', 0),
      line('ברזל משקופים מעל פתחים', L.barsLintel.length, 'יח׳', 0),
      ...(free.length ? [line('ברזל לעמוד פנימי', freeTon, 'טון', 2)] : []),
    ],
    costILS: roundCost((rebarTon(L) + freeTon) * PRICES.rebarTon),
    remove: { tags: ['p6i-crew'] },
    parts: [
      ...rebarParts('p6i-icf-rebar', L, 'entrance', origin),
      ...(free.length
        ? ([
            { id: 'p6i-icf-rebar:col-bars', shape: { kind: 'rods', radius: 0.007, segments: 6, items: cages.bars }, material: 'rebar', tags: ['rebar', 'column-rebar', LV], anim: { type: 'rise', delay: 0.6, duration: 0.6, stagger: 0.04 } },
            { id: 'p6i-icf-rebar:col-ties', shape: { kind: 'rods', radius: 0.004, segments: 4, items: cages.ties }, material: 'rebar', tags: ['rebar', 'column-rebar', LV], anim: { type: 'grow', delay: 1.3, duration: 0.2, stagger: fit(1.0, cages.ties.length, 0.02), order: 'y' } },
          ] as Part[])
        : []),
    ],
    camera: camOf(L, -0.4, y1 + 0.6, 40, 48, 1.2),
    view: { xray: false, ghostTags: ['icf-eps-entrance', 'icf-webs'] },
  });

  // ---------------------------------------------------------------- bracing (+ free column form)
  const B = M.entranceBraces;
  steps.push({
    id: 'p6i-icf-bracing',
    phase: 6,
    titleHe: 'יישור ותמיכה בקומת הכניסה',
    materials: [
      line('תומכות יישור עם רגל מתכווננת', B.count, 'יח׳', 0),
      line('קרשי הליכה', B.planks.reduce((s, p) => s + p.size[0], 0) / 2, 'מ׳', 0),
      ...(free.length ? [line('תבנית לעמוד פנימי', cf.m2, 'מ״ר', 1)] : []),
    ],
    costILS: roundCost(L.area * ICF_RATES.bracingM2 + cf.m2 * PRICES.formworkM2),
    parts: [...braceParts('p6i-icf-bracing', B, 'entrance', 'p6i-braces', origin), ...colForms],
    camera: camOf(L, -0.4, y1 + 0.8, 210, 52, 1.0),
    view: { xray: false },
  });

  // ---------------------------------------------------------------- shared ממ״ד (cast-in-place in every method)
  steps.push(mRebar, mForms, mPour);

  // ---------------------------------------------------------------- pour (+ free column)
  const pump = pumpSpot(ctx, hoseTarget(ctx, L), c, fr.backfill, fr.backfill, y1);
  const pr = pourLines(L, 'לקירות ICF (אגרגט עד 11 מ״מ)');
  const colM3 = boxVolume(colConcrete) * 1.05;
  steps.push({
    id: 'p6i-icf-pour',
    phase: 6,
    titleHe: 'יציקת קירות קומת הכניסה',
    materials: [...pr.lines.slice(0, 1), ...(free.length ? [line('בטון ב-30 לעמוד פנימי', colM3, 'מ״ק', 2)] : []), ...pr.lines.slice(1)],
    costILS: pr.cost + roundCost(colM3 * PRICES.concreteM3),
    remove: { tags: ['p6-mamad-machine', 'p6i-col-forms'] },
    parts: [
      ...liftParts('p6i-icf-pour', L, 'entrance', pump.origin),
      ...(free.length
        ? [
            ...formGhosts('p6i-icf-pour:col', colForms, 'p6i-col-ghost', [LV]),
            { id: 'p6i-icf-pour:col-concrete', shape: { kind: 'boxes', items: colConcrete }, material: 'concrete', tags: ['concrete', 'columns', LV], anim: { type: 'pour', delay: 1.6, duration: 2.4 } } as Part,
          ]
        : []),
      pumpPart('p6i-icf-pour:pump', pump, { tags: ['machine', 'pump', 'p6i-pump'], anim: { type: 'slide', from: slideIn(ctx, 10), duration: 1.3 } }),
      ...pourCrew('p6i-icf-pour:crew', B, pump.origin, ['p6i-pour-crew', LV]),
    ],
    camera: { bounds: boundsOf([...L.points, [pump.tip[0], pump.tip[2]]], -0.4, pump.tip[1] + 0.5, 1.0), azimuth: 150, polar: 52 },
    view: { xray: false, ghostTags: ['icf-eps-entrance', 'icf-webs'] },
  });

  // ---------------------------------------------------------------- roof slab, bearing on the ICF walls
  // The braces come off the day after the wall pour, before the roof shoring goes up.
  steps.push({ ...deck, remove: { tags: [...(deck.remove?.tags ?? []), 'p6-mamad-machine', 'p6i-pump', 'p6i-pour-crew', 'p6i-braces', 'p6i-col-ghost'] } }, rebar, roofPour);

  // ---------------------------------------------------------------- strip: the ICF shell stands
  const frI = structureFrame(M.ictx);
  const slabsM3 =
    frI.regions.lowerSlab.area * (frI.y.lowerTop - frI.y.lowerBottom) +
    frI.regions.ceiling.area * 0.25 +
    frI.regions.grade.area * (frI.y.gradeTop - frI.y.gradeBottom) +
    frI.regions.roof.area * (frI.y.roofTop - frI.y.roofBottom);
  const mamadM3 = fr.entranceWalls.cast.reduce((s, p) => s + (p.s1 - p.s0) * p.wall.thickness * (p.y1 - p.y0), 0);
  const shellM3 = M.lower.coreM3 + L.coreM3 + slabsM3 + mamadM3 + colM3;
  const deckM2 = frI.regions.ceiling.area + frI.regions.roof.area;
  steps.push({
    ...strip,
    materials: [
      line('משטחי טפסנות ופרופים לפירוק', deckM2, 'מ״ר', 0),
      line('בטון בשלד: ליבות ICF, ממ״ד, רצפות ותקרות', shellM3, 'מ״ק', 0),
      line('קירות ICF שנשארים עם הקלקר', M.lower.area + L.area, 'מ״ר', 0),
    ],
    costILS: roundCost(deckM2 * 18),
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Phase 7 · ICF parapets + shared partitions and blind frames
// ---------------------------------------------------------------------------

/** Wall pieces minus corner cuts (as p07's parapet copings, so the coping is the same). */
function copingRects(w: Wall, cuts: Array<[number, number]>): Rect[] {
  const L = wallFrame(w).length;
  let spans: Array<[number, number]> = [[0, L]];
  for (const [c0, c1] of cuts)
    spans = spans.flatMap(([a, b]): Array<[number, number]> => (c1 <= a || c0 >= b ? [[a, b]] : [[a, Math.max(a, c0)], [Math.min(b, c1), b]])).filter(([a, b]) => b - a > 0.03);
  return spans.map(([s0, s1]) => ({ s0, s1, y0: w.baseY, y1: w.baseY + w.height }));
}

export function phaseIcfMasonry(ctx: BuildContext): StepDef[] {
  const fr = structureFrame(ctx);
  const parapets = ctx.house.walls.filter((w) => w.role === 'parapet');
  const groups: Array<{ name: 'roof' | 'terrace'; walls: Wall[]; tag: string }> = [
    { name: 'roof', walls: parapets.filter((w) => w.level === 'roof'), tag: 'level:roof' },
    { name: 'terrace', walls: parapets.filter((w) => w.level !== 'roof'), tag: 'level:entrance' },
  ];
  const parts: Part[] = [];
  let area = 0;
  let blocks = 0;
  let kg = 0;
  let m3 = 0;
  let len = 0;
  const all: Vec2[] = [];
  let pump: PumpSpot | null = null;
  groups.forEach((g, gi) => {
    if (!g.walls.length) return;
    const y0 = Math.min(...g.walls.map((w) => w.baseY));
    const y1 = Math.max(...g.walls.map((w) => w.baseY + w.height));
    const L = icfLayout({ key: g.name, walls: g.walls, cols: [], openings: [], y0, y1, floorY: y0, doorY: y0, slabAbove: [], barBottom: y0 - 0.15, inside: ctx.footprint.house, lift: 2 });
    area += L.area;
    blocks += L.blocks;
    kg += L.rebarKg;
    m3 += L.coreM3;
    all.push(...L.points);
    const c = polygonCentroid(L.points);
    if (!pump && g.name === 'roof') pump = pumpSpot(ctx, hoseTarget(ctx, L), c, fr.backfill, fr.backfill, y1);
    const aim = pump?.origin ?? c;
    const dt = gi * 0.25;
    const tags = ['parapet', `icf-eps-${g.name}`, g.tag];
    parts.push(...courseParts(`p7i-icf-parapets:${g.name}`, L, tags, startCorner(L, aim), 0.1 + dt, 0.45));
    const rtags = ['rebar', 'icf-rebar', g.tag];
    parts.push(
      { id: `p7i-icf-parapets:${g.name}-v`, shape: { kind: 'rods', radius: 0.006, segments: 5, items: L.barsV }, material: 'rebar', tags: rtags, anim: { type: 'drop', from: [0, 1.0, 0], delay: 1.5 + dt, duration: 0.35, stagger: fit(0.8, L.barsV.length, 0.01), order: 'near', origin: aim, ease: 'out' } },
      { id: `p7i-icf-parapets:${g.name}-h`, shape: { kind: 'rods', radius: 0.006, segments: 5, items: L.barsH }, material: 'rebar', tags: rtags, anim: { type: 'rise', delay: 1.1 + dt, duration: 0.3, stagger: fit(0.6, L.barsH.length, 0.02), order: 'y' } },
    );
    L.lifts.forEach((items, k) =>
      parts.push({ id: `p7i-icf-parapets:${g.name}-pour${k}`, shape: { kind: 'boxes', items }, material: 'concrete', tags: ['concrete', 'parapet', 'icf-core', g.tag], edges: false, anim: { type: 'pour', delay: 2.7 + dt, duration: 0.6, stagger: fit(1.0, items.length, 0.02), order: 'near', origin: aim } }),
    );
    // Coping: the same cast cap as the block method's parapets (the finish on top is identical).
    const caps: BoxItem[] = [];
    for (const w of g.walls) {
      const f = wallFrame(w);
      len += f.length;
      for (const r of copingRects(w, cornerCuts(w, parapets.slice(0, parapets.indexOf(w))))) {
        const top = w.baseY + w.height;
        const b = rectBox(w, { s0: r.s0, s1: r.s1, y0: top, y1: top + 0.05 }, 0.04);
        caps.push({ at: b.at, size: b.size, rotY: f.rotY });
      }
    }
    parts.push({ id: `p7i-icf-parapets:${g.name}-coping`, shape: { kind: 'boxes', items: caps }, material: 'concrete', tags: ['parapet', 'concrete', g.tag], anim: { type: 'fade', delay: 4.3 + dt, duration: 0.5 } });
  });
  const p = pump as PumpSpot | null;
  if (p) parts.push(pumpPart('p7i-icf-parapets:pump', p, { tags: ['machine', 'pump', 'p7i-pump'], anim: { type: 'slide', from: slideIn(ctx, 10), duration: 1.3 } }));
  const pm3 = m3 * 1.05;
  const top = ctx.roof.floorY + 1.0;
  const parapetStep: StepDef = {
    id: 'p7i-icf-parapets',
    phase: 7,
    titleHe: 'מעקות ICF בגג ובמרפסת',
    materials: [
      line('תבניות ICF למעקות', blocks, 'יח׳', 0),
      line('בטון ב-30 למעקות', pm3, 'מ״ק', 1),
      line('ברזל זיון במעקות', kg / 1000, 'טון', 2),
      line('כיסוי בטון (קופינג)', len * 0.24 * 0.05, 'מ״ק', 1),
      line('קלקר (EPS) בתבניות', area * ICF.epsReal * 2, 'מ״ק', 1),
    ],
    costILS: roundCost(area * (ICF_RATES.formM2 + ICF_RATES.bracingM2 * 0.5) + (kg / 1000) * PRICES.rebarTon + pm3 * (PRICES.concreteM3 + ICF_RATES.mixExtraM3) + PRICES.pumpDay + len * 120),
    parts,
    camera: { bounds: boundsOf([...all, ...(p ? [[p.tip[0], p.tip[2]] as Vec2] : [])], ctx.roof.floorY - 0.4, top + 0.6, 1.2), azimuth: 35, polar: 50 },
    view: { xray: false },
  };
  const masonry = phaseMasonry(ctx);
  const [interior, blind] = pick(masonry, ['p7-blocks-interior', 'p7-blind-frames']);
  return [parapetStep, { ...interior, remove: { tags: [...(interior.remove?.tags ?? []), 'p7i-pump'] } }, blind];
}

