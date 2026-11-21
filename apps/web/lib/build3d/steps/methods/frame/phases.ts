/**
 * Phase builders for the framed methods (docs/build3d/METHODS.md § steel and timber). Phases
 * 0–5 (concrete podium), 9, 11–13 are the concrete builders unchanged; 6, 7, 8 and 10 are
 * composed here from picked concrete steps + the frame kit:
 *
 *   6  ground slab, ממ״ד walls (shared) → ממ״ד ceiling slab → base plates → wall panels → roof joists → deck → p6-strip-all
 *   7  lower-floor infill walls → partitions → parapets → p7-blind-frames
 *   8  tapered insulation (instead of the slope screed) → shared insulation, membrane, coat, equipment
 *   10 scaffolding → exterior boards + house wrap → mineral wool → gypsum boards → shared stone, render, scaffolding down
 */
import { pointInPolygon, polygonCentroid, wallFrame, wallPieces, wallPoint } from '../../../house/geometry';
import type { Vec2, Vec3, Wall } from '../../../house/types';
import type { CameraHint, Part, StepDef } from '../../../engine/types';
import type { BuildContext } from '../../context';
import type { PhaseBuilder } from '../../types';
import { PRICES, line, model, rebarKg, roundCost } from '../../kit';
import { faceInside, floorYOf, subtractAll, wallsOfLevel, type BoxItem, type Face, type Rect } from '../../envelope-kit';
import { boundsOf, fit, structureFrame, wallConcrete } from '../../structure-kit';
import { pick, phase } from '../compose';
import { phasePlan } from '../../p00-plan';
import { phaseSite } from '../../p01-site';
import { phaseEarthworks } from '../../p02-earthworks';
import { phaseFoundations } from '../../p03-foundations';
import { phaseLowerStructure } from '../../p04-lower-structure';
import { phaseLowerCeiling } from '../../p05-lower-ceiling';
import { phaseEntranceStructure } from '../../p06-entrance-structure';
import { phaseMasonry } from '../../p07-masonry';
import { phaseRoof } from '../../p08-roof';
import { phaseSystems } from '../../p09-systems';
import { phasePlaster } from '../../p10-plaster';
import { phaseFinishes } from '../../p11-finishes';
import { phaseLandscape } from '../../p12-landscape';
import { phaseHandover } from '../../p13-handover';
import { CB_T, CEMENT_BOARD, DRY_EMBED, FRESH_PLASTER, GYPSUM, OSB_COLORS, WRAP, WRAP_T, type FrameSpec } from './spec';
import {
  anchorParts,
  boardsOn,
  braceRods,
  cStud,
  emitPanel,
  emptyBuckets,
  framePosts,
  frameSet,
  groupAnim,
  groupPanels,
  memberBox,
  uTrack,
  zoneN,
  type Box,
  type Buckets,
  type FramedWall,
  type Panel,
  type Rod,
} from './walls';
import { cJoist, ceilingBoards, deckBoards, joists, mamadSlab, roofFrame } from './roof';

// ---------------------------------------------------------------------------
// The framed model (computed once per context and method)
// ---------------------------------------------------------------------------

interface FrameModel {
  entrance: FramedWall[];
  posts: FramedWall[];
  lower: FramedWall[];
  partLower: FramedWall[];
  partEntrance: FramedWall[];
  parRoof: FramedWall[];
  parTerrace: FramedWall[];
  /** Ids of every framed house wall (drywall vs plaster on concrete). */
  framedIds: Set<string>;
}

const models = new WeakMap<BuildContext, Map<string, FrameModel>>();

function frameModel(ctx: BuildContext, spec: FrameSpec): FrameModel {
  let m = models.get(ctx);
  if (!m) models.set(ctx, (m = new Map()));
  const hit = m.get(spec.method);
  if (hit) return hit;
  const walls = ctx.house.walls;
  const fr = structureFrame(ctx);
  const outsideOf = (polys: Vec2[][]) => (p: Vec2) => !polys.some((q) => q.length > 2 && pointInPolygon(p, q));
  const outE = outsideOf([ctx.footprint.entrance]);
  const outL = outsideOf([ctx.footprint.lower]);
  const outR = outsideOf([fr.slabs.roof?.outline ?? [], fr.slabs.terrace?.outline ?? []]);
  const entrance = frameSet(ctx, spec, walls.filter((w) => w.level === 'entrance' && w.role === 'exterior'), 'ext', outE, { sole: true, holds: true, straps: true });
  const posts = framePosts(ctx, spec, ctx.house.columns.filter((c) => c.level === 'entrance'), outE);
  const lower = frameSet(ctx, spec, walls.filter((w) => w.level === 'lower' && w.role === 'exterior' && w.material === 'block'), 'ext', outL, { sole: true, straps: true });
  const partLower = frameSet(ctx, spec, walls.filter((w) => w.level === 'lower' && w.role === 'interior' && w.material === 'block'), 'int', outL);
  const partEntrance = frameSet(ctx, spec, walls.filter((w) => w.level === 'entrance' && w.role === 'interior' && w.material === 'block'), 'int', outE);
  const pars = walls.filter((w) => w.role === 'parapet');
  const parAll = frameSet(ctx, spec, pars, 'par', outR, { spacing: spec.parapetSpacing, sole: true });
  const model: FrameModel = {
    entrance,
    posts,
    lower,
    partLower,
    partEntrance,
    parRoof: parAll.filter((f) => f.wall.level === 'roof'),
    parTerrace: parAll.filter((f) => f.wall.level !== 'roof'),
    framedIds: new Set([...entrance, ...lower, ...partLower, ...partEntrance, ...parAll].map((f) => f.wall.id)),
  };
  m.set(spec.method, model);
  return model;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ENT = 'level:entrance';
const id = (spec: FrameSpec, phaseNo: number, name: string) => `p${phaseNo}${spec.k}-${name}`;
const tracksId = (spec: FrameSpec) => (spec.method === 'steel' ? 'p6s-tracks' : 'p6t-sole-plates');
const area = (fws: FramedWall[]) => fws.reduce((s, f) => s + Math.max(0, f.area), 0);
const panelsOf = (fws: FramedWall[]) => fws.flatMap((f) => f.panels);

function wallBounds(fws: FramedWall[], y0: number, y1: number, grow = 1): CameraHint['bounds'] {
  return boundsOf(
    fws.flatMap((f) => [f.wall.a, f.wall.b]),
    y0,
    y1,
    grow,
  );
}

/** Parts of a bucket set: steel profiles as instanced C / U shapes, timber as boxes. */
function bucketParts(spec: FrameSpec, pid: string, b: Buckets, tags: string[], anim: Part['anim'], extra: Partial<Part> = {}): Part[] {
  const parts: Part[] = [];
  const mat = spec.frameMat;
  if (b.studs.length) parts.push({ id: `${pid}:studs`, shape: { kind: 'instances', of: cStud(spec.studW), items: b.studs }, material: mat, color: spec.frameColor, tags, anim, edges: false, ...extra });
  if (b.topTracks.length) parts.push({ id: `${pid}:tracks`, shape: { kind: 'instances', of: uTrack(spec.plateH, false), items: b.topTracks }, material: mat, color: spec.frameColor, tags, anim, edges: false, ...extra });
  if (b.baseTracks.length) parts.push({ id: `${pid}:base`, shape: { kind: 'instances', of: uTrack(spec.plateH, true), items: b.baseTracks }, material: mat, color: spec.soleColor, tags, anim, edges: false, ...extra });
  if (b.base.length) parts.push({ id: `${pid}:sole`, shape: { kind: 'boxes', items: b.base }, material: mat, color: spec.soleColor, tags, anim, ...extra });
  if (b.boxes.length) parts.push({ id: `${pid}:frame`, shape: { kind: 'boxes', items: b.boxes }, material: mat, color: spec.frameColor, tags, anim, edges: spec.method !== 'steel', ...extra });
  if (b.beams.length) parts.push({ id: `${pid}:beams`, shape: { kind: 'boxes', items: b.beams }, material: spec.beamMat, color: spec.beamColor, tags, anim, ...extra });
  if (b.straps.length) parts.push({ id: `${pid}:straps`, shape: { kind: 'rods', radius: 0.009, segments: 4, items: b.straps }, material: 'galvanized', color: spec.frameColor, tags, anim, edges: false, ...extra });
  return parts;
}

/** Timber: OSB sheets on the exterior face of every exterior / parapet panel (inside the wall). */
function osbBoxes(ctx: BuildContext, spec: FrameSpec, panels: Panel[]): Box[][] {
  const out: Box[][] = [[], []];
  if (!spec.osbT) return out;
  for (const p of panels) {
    const fw = p.fw;
    if (fw.sec.e === 0) continue;
    const [n0, n1] = zoneN(fw.wall, fw.sec.e, CB_T + WRAP_T, CB_T + WRAP_T + spec.osbT);
    const [a, b] = boardsOn(fw, solidRects(ctx, fw, p.s0, p.s1), n0, n1, 1.22, 2.44, 0.003, p.s0);
    out[0].push(...a);
    out[1].push(...b);
  }
  return out;
}

/** Solid face rects of a framed wall inside [s0, s1], without the 8 cm floor strips under doors. */
function solidRects(ctx: BuildContext, fw: FramedWall, s0 = fw.S0, s1 = fw.S1): Rect[] {
  const out: Rect[] = [];
  for (const p of wallPieces(fw.wall, ctx.house.openings, fw.floorY)) {
    if (p.y0 <= fw.wall.baseY + 0.01 && p.y1 - p.y0 < 0.12) continue;
    const a = Math.max(p.s0, s0);
    const b = Math.min(p.s1, s1);
    if (b - a > 0.03 && p.y1 - p.y0 > 0.03) out.push({ s0: a, s1: b, y0: p.y0, y1: p.y1 });
  }
  return out;
}

/** Panels raised group by group: frame (+ OSB for timber) and braces per group. */
function raiseParts(
  ctx: BuildContext,
  spec: FrameSpec,
  pid: string,
  groups: Panel[][],
  lvl: string,
  opts: { base: boolean; braces?: (p: Vec2) => number; t0?: number; dt?: number; tags?: string[] },
): { parts: Part[]; b: Buckets; braces: number; osbM2: number } {
  const parts: Part[] = [];
  const all = emptyBuckets();
  let braces = 0;
  let osbM2 = 0;
  groups.forEach((g, k) => {
    const b = emptyBuckets();
    for (const p of g) emitPanel(spec, p, b, { base: opts.base, frame: true });
    const anim = groupAnim(k, opts.t0 ?? 0.2, opts.dt ?? 0.55);
    const tags = [...(opts.tags ?? []), 'frame', `level:${lvl}`];
    parts.push(...bucketParts(spec, `${pid}:g${k + 1}`, b, tags, anim));
    const osb = osbBoxes(ctx, spec, g);
    osb.forEach((items, i) => {
      if (!items.length) return;
      osbM2 += items.reduce((s, x) => s + x.size[0] * x.size[1], 0);
      parts.push({ id: `${pid}:g${k + 1}:osb${i + 1}`, shape: { kind: 'boxes', items }, material: 'osb', color: OSB_COLORS[(i + k) % OSB_COLORS.length], tags: [...tags, 'osb'], anim });
    });
    if (opts.braces) {
      const rods: Rod[] = [];
      const feet: Box[] = [];
      for (const p of g) {
        const r = braceRods(p, opts.braces);
        rods.push(...r.rods);
        feet.push(...r.feet);
      }
      braces += rods.length;
      if (rods.length) {
        const ba = { type: 'fade' as const, delay: (anim.delay ?? 0) + 0.55, duration: 0.35 };
        const btags = ['formwork', 'braces', `${pid}-braces`, `level:${lvl}`];
        const steel = spec.method === 'steel';
        parts.push({ id: `${pid}:g${k + 1}:braces`, shape: { kind: 'rods', radius: steel ? 0.022 : 0.026, segments: 6, items: rods }, material: steel ? 'pipeBlue' : 'timber', tags: btags, anim: ba, edges: false });
        parts.push({ id: `${pid}:g${k + 1}:feet`, shape: { kind: 'boxes', items: feet }, material: 'timber', tags: btags, anim: ba });
      }
    }
    mergeBuckets(all, b);
  });
  return { parts, b: all, braces, osbM2 };
}

function mergeBuckets(into: Buckets, b: Buckets) {
  into.kg += b.kg;
  into.m3 += b.m3;
  for (const k of Object.keys(into.m) as Array<keyof Buckets['m']>) into.m[k] += b.m[k];
}

/** BOM line for the frame members of a step: steel kg / timber m³. */
const frameLine = (spec: FrameSpec, b: Buckets, what: string) =>
  spec.method === 'steel' ? line(`פרופילי פלדה מגולוונת: ${what}`, b.kg, 'ק״ג', 0) : line(`עץ מסגרת C24: ${what}`, b.m3 * 1.08, 'מ״ק', 2);

// ---------------------------------------------------------------------------
// Phase 6: ממ״ד ceiling, base plates, wall panels, roof joists, deck
// ---------------------------------------------------------------------------

function phase6(ctx: BuildContext, spec: FrameSpec): StepDef[] {
  const fr = structureFrame(ctx);
  const fm = frameModel(ctx, spec);
  const p6 = phaseEntranceStructure(ctx);
  const [gsPrep, gsPour, mRebar, mForms, mPour, strip] = pick(p6, ['p6-ground-slab-prep', 'p6-ground-slab-pour', 'p6-mamad-rebar', 'p6-mamad-forms', 'p6-mamad-pour', 'p6-strip-all']);
  // The concrete method clears the ground-slab pump and edge forms in its column steps (not used here).
  const mamadRebar: StepDef = { ...mRebar, remove: { tags: [...(mRebar.remove?.tags ?? []), 'p6-gs-machine', 'pour-tiles', 'p6-gs-edge-forms'] } };
  const entFp = ctx.footprint.entrance;
  const center = polygonCentroid(entFp);
  const floorAt = (p: Vec2) => fr.entranceFloorAt(p) ?? ctx.entrance.floorY - 0.08;

  // ------------------------------------------------ ממ״ד ceiling slab (cast in place)
  const ms = mamadSlab(ctx);
  const mid = id(spec, 6, 'mamad-roof');
  const msKg = rebarKg(10, ms.barM);
  const mamadRoof: StepDef = {
    id: mid,
    phase: 6,
    titleHe: 'תקרת בטון לממ״ד',
    materials: [
      line('בטון ב-30 לתקרת הממ״ד', ms.m3 * 1.04, 'מ״ק', 1),
      line('ברזל זיון לתקרת הממ״ד', msKg / 1000, 'טון', 2),
      line('טפסנות ותמיכות', ms.innerArea, 'מ״ר', 0),
      line('משאבת בטון', 1, 'יום', 0),
    ],
    costILS: roundCost(ms.m3 * 1.04 * PRICES.concreteM3 + (msKg / 1000) * PRICES.rebarTon + ms.area * PRICES.slabFormworkM2 + PRICES.pumpDay),
    remove: { tags: ['p6-mamad-ghost'] },
    parts: [
      { id: `${mid}:props`, shape: { kind: 'rods', radius: 0.024, segments: 6, items: ms.props }, material: 'steel', tags: ['props', 'formwork', `${mid}-forms`, ENT], anim: { type: 'rise', duration: 0.5, stagger: fit(0.9, ms.props.length, 0.08) }, edges: false },
      { id: `${mid}:heads`, shape: { kind: 'boxes', items: ms.heads }, material: 'timber', tags: ['props', 'formwork', `${mid}-forms`, ENT], anim: { type: 'drop', from: [0, 0.6, 0], delay: 0.8, duration: 0.4 } },
      { id: `${mid}:deck`, shape: { kind: 'boxes', items: ms.deck }, material: 'plywood', tags: ['formwork', `${mid}-forms`, ENT], anim: { type: 'drop', from: [0, 0.8, 0], delay: 1.2, duration: 0.5, ease: 'out' } },
      { id: `${mid}:bars`, shape: { kind: 'rods', radius: 0.006, segments: 5, items: ms.bars }, material: 'rebar', tags: ['rebar', 'slab-rebar', ENT], anim: { type: 'rise', delay: 1.8, duration: 0.4, stagger: fit(1.0, ms.bars.length, 0.02), order: 'x' } },
      { id: `${mid}:slab`, shape: { kind: 'extrude', outline: ms.outline, y0: ms.y0, y1: ms.y1 }, material: 'concrete', tags: ['concrete', 'slab', 'mamad', 'level:roof', ENT], anim: { type: 'pour', delay: 3.2, duration: 2.0, ease: 'inOut' } },
    ],
    camera: { bounds: boundsOf(ms.outline, -0.2, ms.y1 + 0.4, 2.2), azimuth: 150, polar: 46, zoom: 1.1 },
    view: { xray: true },
  };

  // ------------------------------------------------ base plates / tracks + anchors + hold-downs
  const entAll = [...fm.entrance, ...fm.posts];
  const baseB = emptyBuckets();
  const holds: Box[] = [];
  const bolts: Rod[] = [];
  for (const p of panelsOf(entAll)) {
    emitPanel(spec, p, baseB, { base: true, frame: false });
    anchorParts(p, holds, bolts);
  }
  const tid = tracksId(spec);
  const gate = ctx.lot.gate;
  const baseAnim = { type: 'sequence' as const, duration: 0.35, stagger: fit(3.2, baseB.baseTracks.length + baseB.base.length, 0.12), order: 'near' as const, origin: gate };
  const tParts: Part[] = bucketParts(spec, tid, baseB, ['frame', 'base-plate', ENT], baseAnim);
  if (spec.method === 'timber') {
    // Damp-proof strip under the treated sole plates (shows as a thin black edge).
    const dpc: BoxItem[] = baseB.base.map((x) => ({ at: [x.at[0], x.at[1] - x.size[1] / 2 + 0.0015, x.at[2]], size: [x.size[0], 0.003, x.size[2] + 0.014], rotY: x.rotY }));
    tParts.push({ id: `${tid}:dpc`, shape: { kind: 'boxes', items: dpc }, material: 'bitumen', tags: ['dpc', ENT], anim: { type: 'fade', duration: 0.6 }, edges: false });
  }
  tParts.push(
    { id: `${tid}:bolts`, shape: { kind: 'rods', radius: 0.008, segments: 5, items: bolts }, material: 'steel', tags: ['anchors', ENT], anim: { type: 'grow', delay: 3.3, duration: 0.3, stagger: fit(0.8, bolts.length, 0.01) }, edges: false },
    { id: `${tid}:holds`, shape: { kind: 'boxes', items: holds }, material: 'steel', color: '#59616A', tags: ['hold-downs', ENT], anim: { type: 'drop', from: [0, 0.4, 0], delay: 3.9, duration: 0.35, stagger: fit(0.9, holds.length, 0.03), order: 'near', origin: gate } },
  );
  const baseM = baseB.m.base;
  const tracks: StepDef = {
    id: tid,
    phase: 6,
    materials: [
      line(spec.he.base, baseM, 'מ׳', 0),
      line('ברגי עיגון כימיים', bolts.length - holds.length, 'יח׳', 0),
      line('מחברי עיגון (Hold-down)', holds.length, 'יח׳', 0),
      ...(spec.method === 'timber' ? [line('רצועת איטום מתחת לקורת הסף', baseM, 'מ׳', 0)] : []),
    ],
    costILS: roundCost(baseM * spec.rates.baseM + holds.length * 180),
    remove: { tags: ['p6-mamad-machine'] },
    parts: tParts,
    camera: { bounds: boundsOf(entFp, -0.3, 0.9, 0.8), azimuth: 28, polar: 46 },
    view: { xray: false },
  };

  // ------------------------------------------------ wall panels
  const wid = id(spec, 6, 'walls');
  const groups = groupPanels(entAll, 6, center, gate);
  const raised = raiseParts(ctx, spec, wid, groups, 'entrance', { base: false, braces: floorAt, tags: [] });
  const crewAt = (k: number): Vec3 => {
    const g = groups[Math.min(k, groups.length - 1)];
    const p = g[Math.floor(g.length / 2)];
    const q = wallPoint(p.fw.wall, (p.s0 + p.s1) / 2, -(p.fw.sec.e || 1) * (p.fw.wall.thickness / 2 + 0.9));
    return [q[0], floorAt(q), q[1]];
  };
  const crew: Part[] = [0, 3].map((k, i) =>
    model(`${wid}:crew-${i + 1}`, 'worker', crewAt(k), i ? 2.2 : 0.6, {
      tags: ['machine', `${wid}-crew`, ENT],
      shape: { kind: 'model', name: 'worker', seed: 61 + i },
      anim: { type: 'fade', delay: 0.2 + k * 0.5, duration: 0.4 },
    }),
  );
  const entArea = area(fm.entrance);
  const opCount = ctx.house.openings.filter((o) => o.level === 'entrance' && fm.entrance.some((f) => f.wall.id === o.wallId)).length;
  const walls: StepDef = {
    id: wid,
    phase: 6,
    materials: [
      frameLine(spec, raised.b, 'קירות חוץ ועמודים'),
      line('שטח קירות חוץ (נטו)', entArea, 'מ״ר', 0),
      line('פאנלים', panelsOf(entAll).length, 'יח׳', 0),
      line('משקופים (Headers) מעל פתחים', opCount, 'יח׳', 0),
      spec.method === 'steel' ? line('תמיכות זמניות', raised.braces, 'יח׳', 0) : line('לוחות OSB בעובי 11 מ״מ', raised.osbM2, 'מ״ר', 0),
    ],
    costILS: roundCost(entArea * spec.rates.wallM2),
    parts: [...raised.parts, ...crew],
    camera: { bounds: wallBounds(entAll, -0.2, 3.2, 0.6), azimuth: 34, polar: 54, zoom: 0.88 },
    view: { xray: false },
  };

  // ------------------------------------------------ roof joists
  const rf = roofFrame(ctx);
  const js = joists(ctx, spec);
  const jid = id(spec, 6, 'roof-joists');
  const steel = spec.method === 'steel';
  const roofOutline = fr.slabs.roof?.outline ?? entFp;
  const jTags = ['frame', 'roof-frame', 'level:roof'];
  const jParts: Part[] = [
    { id: `${jid}:girder`, shape: { kind: 'boxes', items: js.girder }, material: spec.beamMat, color: spec.beamColor, tags: jTags, anim: { type: 'drop', from: [0, 1.2, 0], duration: 0.6, ease: 'out' } },
    { id: `${jid}:rims`, shape: { kind: 'boxes', items: js.rims }, material: spec.frameMat, color: spec.frameColor, tags: jTags, anim: { type: 'rise', delay: 0.5, duration: 0.4, stagger: fit(0.9, js.rims.length, 0.06), order: 'near', origin: gate }, edges: !steel },
  ];
  if (steel) jParts.push({ id: `${jid}:joists`, shape: { kind: 'instances', of: cJoist(rf.depth, 0.05), items: js.cJoists }, material: spec.frameMat, color: spec.frameColor, tags: jTags, anim: { type: 'drop', from: [0, 0.8, 0], delay: 1.2, duration: 0.35, stagger: fit(3.0, js.cJoists.length, 0.08), order: 'z', ease: 'out' }, edges: false });
  else {
    const ja = { type: 'drop' as const, from: [0, 0.8, 0] as Vec3, delay: 1.2, duration: 0.35, stagger: fit(1.5, js.flanges.length, 0.04), order: 'z' as const, ease: 'out' as const };
    jParts.push(
      { id: `${jid}:flanges`, shape: { kind: 'boxes', items: js.flanges }, material: 'lumber', tags: jTags, anim: ja },
      { id: `${jid}:webs`, shape: { kind: 'boxes', items: js.webs }, material: 'osb', tags: jTags, anim: { ...ja, stagger: fit(1.5, js.webs.length, 0.04) } },
    );
  }
  jParts.push(
    { id: `${jid}:blocking`, shape: { kind: 'boxes', items: js.blocking }, material: spec.frameMat, color: spec.frameColor, tags: jTags, anim: { type: 'grow', delay: 4.3, duration: 0.3, stagger: fit(0.6, js.blocking.length, 0.02) }, edges: !steel },
    { id: `${jid}:hangers`, shape: { kind: 'boxes', items: js.hangers }, material: 'galvanized', tags: jTags, anim: { type: 'fade', delay: 4.5, duration: 0.4 }, edges: false },
  );
  const roofM2 = rf.framed.area;
  const jKg = js.joistM * 5.2 + js.rimM * 4.4 + js.blocking.length * 1.2;
  const jM3 = js.joistM * 0.0075 + js.rimM * rf.depth * 0.038 + js.blocking.length * 0.045 * rf.depth * spec.joistSpacing;
  const joistStep: StepDef = {
    id: jid,
    phase: 6,
    materials: [
      line(spec.he.joists, js.count, 'יח׳', 0),
      steel ? line('פרופילי פלדה מגולוונת: קורות גג', jKg, 'ק״ג', 0) : line('עץ מסגרת וקורות I: גג', jM3, 'מ״ק', 2),
      line(spec.he.beam, js.girderM, 'מ׳', 1),
      line('שטח גג מקורות', roofM2, 'מ״ר', 0),
    ],
    costILS: roundCost(roofM2 * spec.rates.joistM2),
    remove: { tags: [`${wid}-crew`] },
    parts: jParts,
    camera: { bounds: boundsOf(roofOutline, rf.y0 - 0.6, rf.y1 + 0.2, 0.6), azimuth: 30, polar: 36 },
    view: { xray: false },
  };

  // ------------------------------------------------ roof deck
  const dk = deckBoards(ctx, spec);
  const did = id(spec, 6, 'roof-deck');
  const dCenter = polygonCentroid(roofOutline);
  const dParts: Part[] = dk.boards
    .filter((b) => b.length)
    .map((items, i) => ({
      id: `${did}:boards${i + 1}`,
      shape: { kind: 'boxes' as const, items },
      material: spec.deckMat,
      color: spec.deckColors[i],
      tags: ['roof-deck', 'level:roof'],
      anim: { type: 'drop' as const, from: [0, 0.6, 0] as Vec3, duration: 0.35, stagger: fit(3.6, items.length, 0.12), order: 'near' as const, origin: dCenter, ease: 'out' as const },
    }));
  dParts.push({ id: `${did}:closures`, shape: { kind: 'boxes', items: dk.edges }, material: 'galvanized', tags: ['roof-deck', 'level:roof'], anim: { type: 'fade', delay: 4.0, duration: 0.5 }, edges: false });
  const deck: StepDef = {
    id: did,
    phase: 6,
    materials: [line(spec.he.deck, dk.area * 1.06, 'מ״ר', 0), line('פרופילי סגירת שוליים', roofOutline.reduce((s, p, i) => s + Math.hypot(roofOutline[(i + 1) % roofOutline.length][0] - p[0], roofOutline[(i + 1) % roofOutline.length][1] - p[1]), 0), 'מ׳', 0), line('ברגים ודבק', dk.area * 14, 'יח׳', 0)],
    costILS: roundCost(dk.area * spec.rates.deckM2),
    parts: dParts,
    camera: { bounds: boundsOf(roofOutline, rf.y0 - 0.4, rf.y1 + 0.2, 0.6), azimuth: 30, polar: 42 },
    view: { xray: false },
  };

  // ------------------------------------------------ the frame is up (shared step, own bill)
  const podiumM3 =
    wallConcrete(fr.lowerWalls.cast).m3 +
    fr.regions.lowerSlab.area * (fr.y.lowerTop - fr.y.lowerBottom) +
    fr.lowerCols.reduce((s, c) => s + c.size[0] * c.size[1] * c.height, 0) +
    fr.regions.ceiling.area * 0.25 +
    fr.regions.grade.area * (fr.y.gradeTop - fr.y.gradeBottom) +
    wallConcrete(fr.entranceWalls.cast).m3 +
    ms.m3;
  const frameSum = steel ? line('פלדה קלה בשלד: קירות, עמודים וגג', raised.b.kg + jKg, 'ק״ג', 0) : line('עץ בשלד: קירות, עמודים וגג', raised.b.m3 + jM3, 'מ״ק', 1);
  const stripAll: StepDef = {
    ...strip,
    materials: [line('תמיכות וטפסנות לפירוק', fr.regions.ceiling.area + ms.innerArea, 'מ״ר', 0), frameSum, line('בטון בשלד: קומה תחתונה, רצפות וממ״ד', podiumM3, 'מ״ק', 0)],
    costILS: roundCost((fr.regions.ceiling.area + ms.innerArea) * 18),
  };

  return [gsPrep, gsPour, mamadRebar, mForms, mPour, mamadRoof, tracks, walls, joistStep, deck, stripAll];
}

// ---------------------------------------------------------------------------
// Phase 7: lower-floor infill, partitions, parapets, blind frames
// ---------------------------------------------------------------------------

function phase7(ctx: BuildContext, spec: FrameSpec): StepDef[] {
  const fm = frameModel(ctx, spec);
  const gate = ctx.lot.gate;
  const steel = spec.method === 'steel';
  const lowerTop = ctx.lower.floorY + ctx.lower.ceilingHeight;
  const entTop = ctx.entrance.floorY + ctx.entrance.ceilingHeight;

  // ------------------------------------------------ lower infill
  const lid = id(spec, 7, 'lower-infill');
  const lc = polygonCentroid(ctx.footprint.lower);
  const lg = groupPanels(fm.lower, 3, lc, [lc[0], lc[1] - 10]);
  const lr = raiseParts(ctx, spec, lid, lg, 'lower', { base: true, t0: 0.3, dt: 1.1 });
  const lArea = area(fm.lower);
  const lowerInfill: StepDef = {
    id: lid,
    phase: 7,
    materials: [
      frameLine(spec, lr.b, 'קירות מילוי'),
      line('שטח קירות מילוי', lArea, 'מ״ר', 0),
      line(steel ? 'מסילות עליונות ותחתונות' : 'קורות סף וקורות עליונות', lr.b.m.base + lr.b.m.plate, 'מ׳', 0),
      ...(steel ? [] : [line('לוחות OSB בעובי 11 מ״מ', lr.osbM2, 'מ״ר', 0)]),
    ],
    costILS: roundCost(lArea * spec.rates.lowerM2),
    parts: lr.parts,
    camera: { bounds: wallBounds(fm.lower, ctx.lower.floorY - 0.2, lowerTop + 0.2, 1.2), azimuth: 200, polar: 64, zoom: 0.95 },
    view: { xray: false },
  };

  // ------------------------------------------------ partitions, both floors
  const pid = id(spec, 7, 'partitions');
  const lowC = polygonCentroid(ctx.footprint.lower);
  const entC = polygonCentroid(ctx.footprint.entrance);
  const pl = raiseParts(ctx, spec, `${pid}:lower`, groupPanels(fm.partLower, 2, lowC, gate), 'lower', { base: true, t0: 0.2, dt: 0.7, tags: ['partition'] });
  const pe = raiseParts(ctx, spec, `${pid}:entrance`, groupPanels(fm.partEntrance, 3, entC, gate), 'entrance', { base: true, t0: 1.8, dt: 0.8, tags: ['partition'] });
  const pArea = area([...fm.partLower, ...fm.partEntrance]);
  const pb = emptyBuckets();
  mergeBuckets(pb, pl.b);
  mergeBuckets(pb, pe.b);
  const doors = ctx.house.openings.filter((o) => [...fm.partLower, ...fm.partEntrance].some((f) => f.wall.id === o.wallId)).length;
  const partitions: StepDef = {
    id: pid,
    phase: 7,
    materials: [
      frameLine(spec, pb, 'מחיצות'),
      line('שטח מחיצות', pArea, 'מ״ר', 0),
      line(steel ? 'ניצבים C75 ומסילות U75' : 'ניצבי עץ 45×70', pb.m.stud + pb.m.plate + pb.m.base, 'מ׳', 0),
      line('פתחי דלתות עם משקוף עליון', doors, 'יח׳', 0),
    ],
    costILS: roundCost(pArea * spec.rates.partitionM2),
    parts: [...pl.parts, ...pe.parts],
    camera: { bounds: wallBounds([...fm.partLower, ...fm.partEntrance], ctx.lower.floorY, entTop, 1), polar: 62 },
    view: { xray: true, ghostAbove: entTop - 0.05 },
  };

  // ------------------------------------------------ parapets
  const rid = id(spec, 7, 'parapets');
  const pars = [...fm.parRoof, ...fm.parTerrace];
  const rc = polygonCentroid(ctx.footprint.entrance);
  const rr = raiseParts(ctx, spec, rid, groupPanels(pars, 3, rc, gate), 'roof', { base: true, t0: 0.2, dt: 0.9, tags: ['parapet'] });
  const parLen = pars.reduce((s, f) => s + (f.S1 - f.S0), 0);
  const parArea = area(pars);
  const parapets: StepDef = {
    id: rid,
    phase: 7,
    materials: [
      frameLine(spec, rr.b, 'מעקות'),
      line('אורך מעקות גג ומרפסת', parLen, 'מ׳', 0),
      line('ניצבים כל 40 ס״מ', rr.b.m.stud, 'מ׳', 0),
      ...(steel ? [] : [line('לוחות OSB בעובי 11 מ״מ', rr.osbM2, 'מ״ר', 0)]),
    ],
    costILS: roundCost(parArea * spec.rates.parapetM2),
    parts: rr.parts,
    camera: { bounds: wallBounds(pars, -0.3, ctx.roof.floorY + 1.3, 1.4), polar: 52 },
    view: { xray: false },
  };

  const p7 = phaseMasonry(ctx);
  return [lowerInfill, partitions, parapets, ...pick(p7, ['p7-blind-frames'])];
}

// ---------------------------------------------------------------------------
// Phase 8: tapered insulation instead of the slope screed
// ---------------------------------------------------------------------------

function phase8(ctx: BuildContext, spec: FrameSpec): StepDef[] {
  const p8 = phaseRoof(ctx);
  const [screed] = pick(p8, ['p8-roof-screed']);
  const tid = id(spec, 8, 'taper');
  const m2 = screed.materials.find((m) => m.unitHe === 'מ״ר')?.qty ?? 0;
  const vol = screed.materials[0]?.qty ?? 0;
  const taper: StepDef = {
    ...screed,
    id: tid,
    titleHe: 'בידוד משופע לניקוז',
    materials: [line('לוחות EPS משופעים (שיפוע 2%)', vol, 'מ״ק', 1), line('שטח גג', m2, 'מ״ר', 0), line('פתחי ניקוז', screed.materials[2]?.qty ?? 4, 'יח׳', 0)],
    costILS: roundCost(m2 * PRICES.roofInsulationM2),
    parts: screed.parts.map((p) => ({
      ...p,
      id: p.id.replace('p8-roof-screed', tid),
      ...(p.tags?.includes('screed') ? { material: 'insulation' as const, color: '#ECE8DF', tags: ['insulation', 'taper', 'level:roof'], edges: true } : {}),
    })),
  };
  return [taper, ...pick(p8, ['p8-roof-insulation', 'p8-roof-membrane', 'p8-roof-coat', 'p8-roof-equipment'])];
}

// ---------------------------------------------------------------------------
// Phase 10: exterior boards + wrap, mineral wool, gypsum boards
// ---------------------------------------------------------------------------

const FACES: Face[] = [1, -1];

function houseBounds(ctx: BuildContext, y0: number, y1: number, grow = 1): CameraHint['bounds'] {
  return boundsOf(ctx.footprint.house, y0, y1, grow);
}

/** Batts between the studs of a panel (openings, headers, sills, blocking left out). */
function batts(ctx: BuildContext, spec: FrameSpec, p: Panel, depthInt: number): Box[] {
  const fw = p.fw;
  const W = spec.studW;
  const [n0, n1] = fw.sec.stud;
  let bn: [number, number];
  if (fw.sec.e === 0) bn = [(n0 + n1) / 2 - depthInt / 2, (n0 + n1) / 2 + depthInt / 2];
  else bn = fw.sec.e > 0 ? [n0 + 0.012, n1 - 0.002] : [n0 + 0.002, n1 - 0.012];
  const yA = Math.min(...p.studs.map((s) => s.y0));
  const yB = Math.max(...p.studs.map((s) => s.y1));
  const cut: Rect[] = [];
  for (const m of p.members) if (m.kind === 'header' || m.kind === 'sill' || m.kind === 'beam' || (m.kind === 'block' && spec.method === 'timber')) cut.push({ s0: m.s0, s1: m.s1, y0: m.y0, y1: m.y1 });
  for (const s of p.studs) cut.push({ s0: s.s - W / 2, s1: s.s + W / 2, y0: s.y0, y1: s.y1 });
  const out: Box[] = [];
  for (const r0 of solidRects(ctx, fw, p.s0, p.s1)) {
    const r: Rect = { s0: r0.s0, s1: r0.s1, y0: Math.max(r0.y0, yA), y1: Math.min(r0.y1, yB) };
    if (r.y1 - r.y0 < 0.05) continue;
    for (const q of subtractAll(r, cut)) {
      if (q.s1 - q.s0 < 0.05 || q.y1 - q.y0 < 0.05) continue;
      const n = Math.max(1, Math.ceil((q.y1 - q.y0) / 1.25));
      const h = (q.y1 - q.y0) / n;
      for (let i = 0; i < n; i++) out.push(memberBox(fw, { s0: q.s0 + 0.004, s1: q.s1 - 0.004, y0: q.y0 + i * h + 0.005, y1: q.y0 + (i + 1) * h - 0.005 }, bn[0], bn[1]));
    }
  }
  return out;
}

/** Gypsum boards on one face at the interior-plaster skin position (25 mm, 10 mm inside the wall). */
function gypsumBoards(w: Wall, pieces: ReturnType<typeof wallPieces>, face: Face): Box[] {
  const f = wallFrame(w);
  const T = 0.025;
  const nc = face * (w.thickness / 2 + T / 2 - DRY_EMBED);
  const out: Box[] = [];
  for (const p of pieces) {
    const y0 = p.y0 + 0.003;
    const y1 = p.y1 - 0.004;
    const s0 = p.s0 + 0.004;
    const s1 = p.s1 - 0.004;
    if (y1 - y0 < 0.03 || s1 - s0 < 0.03) continue;
    for (let s = Math.floor(s0 / 1.2) * 1.2; s < s1 - 1e-6; s += 1.2) {
      const a = Math.max(s0, s);
      const b = Math.min(s1, s + 1.2);
      if (b - a < 0.02) continue;
      for (let y = y0; y < y1 - 1e-6; y += 2.6) {
        const yb = Math.min(y1, y + 2.6);
        if (yb - y < 0.02) continue;
        const c = wallPoint(w, (a + b) / 2, nc);
        out.push({ at: [c[0], (y + yb) / 2, c[1]], size: [b - a - 0.003, yb - y - 0.003, T], rotY: f.rotY });
      }
    }
  }
  return out;
}

/** Plaster skin (concrete walls), identical to p10-plaster-interior. */
function plasterSkin(w: Wall, pieces: ReturnType<typeof wallPieces>, face: Face): Box[] {
  const f = wallFrame(w);
  const T = 0.025;
  const out: Box[] = [];
  for (const p of pieces) {
    const y0 = p.y0 + 0.003;
    const y1 = p.y1 - 0.004;
    const s0 = p.s0 + 0.004;
    const s1 = p.s1 - 0.004;
    if (y1 - y0 < 0.03 || s1 - s0 < 0.03) continue;
    const c = wallPoint(w, (s0 + s1) / 2, face * (w.thickness / 2 + T / 2 - DRY_EMBED));
    out.push({ at: [c[0], (y0 + y1) / 2, c[1]], size: [s1 - s0, y1 - y0, T], rotY: f.rotY });
  }
  return out;
}

const boxArea = (items: Box[]) => items.reduce((s, b) => s + b.size[0] * b.size[1], 0);

function phase10(ctx: BuildContext, spec: FrameSpec): StepDef[] {
  const fm = frameModel(ctx, spec);
  const steel = spec.method === 'steel';
  const p10 = phasePlaster(ctx);
  const gate = ctx.lot.gate;
  const facadeView = { xray: false, ghostTags: ['scaffolding'] };

  // ------------------------------------------------ exterior boards + house wrap
  const sid = id(spec, 10, 'sheathing');
  const shell = [...fm.entrance, ...fm.posts.filter((p) => p.sec.e !== 0), ...fm.lower, ...fm.parRoof, ...fm.parTerrace];
  const wrap: Box[] = [];
  const boards: Box[][] = [[], []];
  for (const fw of shell) {
    if (fw.sec.e === 0) continue;
    const rects = solidRects(ctx, fw);
    const [w0, w1] = zoneN(fw.wall, fw.sec.e, CB_T, CB_T + WRAP_T);
    for (const r of rects) wrap.push(memberBox(fw, r, w0, w1));
    for (const face of fw.sec.boardFaces) {
      const [c0, c1] = zoneN(fw.wall, face, 0.0006, CB_T);
      const [a, b] = boardsOn(fw, rects, c0, c1, 1.2, 2.4, 0.004);
      boards[0].push(...a);
      boards[1].push(...b);
    }
  }
  const cbArea = boxArea(boards[0]) + boxArea(boards[1]);
  const wrapArea = boxArea(wrap);
  const sheathing: StepDef = {
    id: sid,
    phase: 10,
    materials: [
      line(steel ? 'לוחות צמנט לחוץ בעובי 12 מ״מ' : 'לוחות צמנט כבסיס לטיח, 12 מ״מ', cbArea, 'מ״ר', 0),
      line(steel ? 'יריעה חוסמת מים ונושמת' : 'יריעה חוסמת מים ונושמת מעל ה-OSB', wrapArea, 'מ״ר', 0),
      line('ברגים מגולוונים לחוץ', cbArea * 18, 'יח׳', 0),
      line('סרט שריון לחיבורי לוחות', cbArea * 1.4, 'מ׳', 0),
    ],
    costILS: roundCost(cbArea * spec.rates.sheathingM2),
    parts: [
      { id: `${sid}:wrap`, shape: { kind: 'boxes', items: wrap }, material: 'houseWrap', color: WRAP, tags: ['house-wrap', 'level:entrance'], anim: { type: 'rise', duration: 0.5, stagger: fit(1.6, wrap.length, 0.05), order: 'near', origin: gate } },
      ...boards.map((items, i) => ({
        id: `${sid}:boards${i + 1}`,
        shape: { kind: 'boxes' as const, items },
        material: 'cementBoard' as const,
        color: i ? '#B5B2AA' : CEMENT_BOARD,
        tags: ['cement-board', 'level:entrance'],
        anim: { type: 'sequence' as const, delay: 1.8, duration: 0.35, stagger: fit(3.2, items.length, 0.05), order: 'near' as const, origin: gate },
      })),
    ],
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, ctx.roof.floorY + 1.1, 0.6), polar: 64, azimuth: 32, zoom: 0.95 },
    view: facadeView,
  };

  // ------------------------------------------------ mineral wool
  const iid = id(spec, 10, 'insulation');
  const extBatts = [...fm.entrance, ...fm.lower].flatMap((f) => f.panels).flatMap((p) => batts(ctx, spec, p, 0.05));
  const intBatts = [...fm.partLower, ...fm.partEntrance].flatMap((f) => f.panels).flatMap((p) => batts(ctx, spec, p, 0.05));
  const extArea = boxArea(extBatts);
  const intArea = boxArea(intBatts);
  const ec = polygonCentroid(ctx.footprint.entrance);
  const insulation: StepDef = {
    id: iid,
    phase: 10,
    materials: [
      line(`${spec.he.wool}: קירות חוץ`, extArea, 'מ״ר', 0),
      line('צמר מינרלי 50 מ״מ: מחיצות (אקוסטיקה)', intArea, 'מ״ר', 0),
      line('לוחות בידוד (Batts) 60×120', (extArea + intArea) / 0.72, 'יח׳', 0),
    ],
    costILS: roundCost((extArea + intArea) * spec.rates.insulationM2),
    parts: [
      { id: `${iid}:ext`, shape: { kind: 'boxes', items: extBatts }, material: 'mineralWool', color: spec.woolColor, tags: ['wall-insulation', 'level:entrance'], anim: { type: 'sequence', duration: 0.3, stagger: fit(3.2, extBatts.length, 0.03), order: 'near', origin: ec }, edges: false },
      { id: `${iid}:int`, shape: { kind: 'boxes', items: intBatts }, material: 'mineralWool', color: steel ? '#C9B98A' : '#EBD27A', tags: ['wall-insulation', 'level:entrance'], anim: { type: 'sequence', delay: 2.6, duration: 0.3, stagger: fit(1.8, intBatts.length, 0.03), order: 'near', origin: ec }, edges: false },
    ],
    // Seen from outside through the exterior layers (ghosted): the batts read in every stud bay.
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, ctx.entrance.floorY + 3.1, 0.4), polar: 62, azimuth: 28, zoom: 0.92 },
    view: { xray: true, ghostAbove: ctx.roof.floorY - 0.3, ghostTags: ['scaffolding', 'cement-board', 'house-wrap', 'osb'] },
  };

  // ------------------------------------------------ gypsum boards (+ plaster on the concrete walls)
  const gid = id(spec, 10, 'drywall');
  const dParts: Part[] = [];
  let gArea = 0;
  let plArea = 0;
  (['lower', 'entrance'] as const).forEach((lvl, li) => {
    const fp = ctx.footprint[lvl];
    const gy: Box[] = [];
    const pl: Box[] = [];
    for (const w of wallsOfLevel(ctx, lvl)) {
      if (w.role === 'fence' || w.role === 'site-retaining' || w.role === 'parapet') continue;
      const pieces = wallPieces(w, ctx.house.openings, floorYOf(ctx, lvl));
      for (const face of FACES) {
        if (!faceInside(w, face, fp)) continue;
        if (fm.framedIds.has(w.id)) gy.push(...gypsumBoards(w, pieces, face));
        else pl.push(...plasterSkin(w, pieces, face));
      }
    }
    gArea += boxArea(gy);
    plArea += boxArea(pl);
    const a = { type: 'rise' as const, delay: li * 1.6, duration: 0.45, stagger: fit(1.4, gy.length, 0.02), order: 'near' as const, origin: polygonCentroid(fp) };
    if (gy.length) dParts.push({ id: `${gid}:${lvl}`, shape: { kind: 'boxes', items: gy }, material: 'gypsum', color: GYPSUM, tags: ['plaster-interior', 'drywall', `level:${lvl}`], anim: a, edges: false });
    if (pl.length) dParts.push({ id: `${gid}:plaster-${lvl}`, shape: { kind: 'boxes', items: pl }, material: 'plaster', color: FRESH_PLASTER, tags: ['plaster-interior', `level:${lvl}`], anim: { ...a, stagger: fit(1.0, pl.length, 0.03) }, edges: false });
  });
  // Posts: interior faces get gypsum that stays (p11-paint covers walls only).
  const postB: Box[] = [];
  for (const fw of fm.posts) for (const face of FACES) if (faceInside(fw.wall, face, ctx.footprint.entrance)) postB.push(...gypsumBoards(fw.wall, wallPieces(fw.wall, [], ctx.entrance.floorY), face));
  if (postB.length) dParts.push({ id: `${gid}:posts`, shape: { kind: 'boxes', items: postB }, material: 'gypsum', color: '#EEEBE4', tags: ['drywall-post', ENT], anim: { type: 'fade', delay: 2.4, duration: 0.5 }, edges: false });
  const ceil = ceilingBoards(ctx);
  dParts.push({ id: `${gid}:ceiling`, shape: { kind: 'boxes', items: ceil.items }, material: 'gypsum', color: '#ECE9E2', tags: ['ceiling-boards', ENT], anim: { type: 'fade', delay: 3.2, duration: 0.8 }, edges: false });
  const drywall: StepDef = {
    id: gid,
    phase: 10,
    materials: [
      line('לוחות גבס לקירות (שכבה כפולה, ירוק בחדרים רטובים)', gArea, 'מ״ר', 0),
      line('תקרת גבס מתחת לקורות הגג', ceil.area, 'מ״ר', 0),
      line('טיח על קירות הבטון (ממ״ד וקומה תחתונה)', plArea, 'מ״ר', 0),
      line('סרט, שפכטל וברגי גבס', gArea + ceil.area, 'מ״ר', 0),
    ],
    costILS: roundCost((gArea + ceil.area) * spec.rates.drywallM2 + plArea * PRICES.plasterInteriorM2),
    remove: { tags: ['mep-in-wall'] },
    parts: dParts,
    // Low, through the ghosted exterior layers and wool: the boards on the inner faces read; the new
    // ceiling boards (never ghosted while new) stay nearly edge-on.
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, ctx.entrance.floorY + 3.1, 0.6), polar: 66, azimuth: 205, zoom: 0.95 },
    view: { xray: true, ghostAbove: ctx.roof.floorY - 0.3, ghostTags: ['scaffolding', 'cement-board', 'house-wrap', 'osb', 'wall-insulation'] },
  };

  return [
    ...pick(p10, ['p10-scaffolding']),
    sheathing,
    insulation,
    drywall,
    ...pick(p10, ['p10-stone-cladding', 'p10-plaster-exterior', 'p10-scaffolding-down']),
  ];
}

// ---------------------------------------------------------------------------
// The method's phase list
// ---------------------------------------------------------------------------

export function framePhases(spec: FrameSpec): PhaseBuilder[] {
  return [
    phasePlan,
    phaseSite,
    phaseEarthworks,
    phaseFoundations,
    phaseLowerStructure,
    phaseLowerCeiling,
    phase(`${spec.method}EntranceFrame`, (ctx) => phase6(ctx, spec)),
    phase(`${spec.method}Infill`, (ctx) => phase7(ctx, spec)),
    phase(`${spec.method}Roof`, (ctx) => phase8(ctx, spec)),
    phaseSystems,
    phase(`${spec.method}Envelope`, (ctx) => phase10(ctx, spec)),
    phaseFinishes,
    phaseLandscape,
    phaseHandover,
  ];
}

