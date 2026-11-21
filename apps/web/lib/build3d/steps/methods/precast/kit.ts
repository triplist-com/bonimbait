/**
 * Precast kit: the wall-panel plan (one panel per wall run, openings cast in), hollow-core plank layout,
 * the mobile crane's stand + hook poses, push-pull props. Pure geometry (no three.js), computed once per
 * context so phases 4, 6, 7 and 10 all use the same panel joints.
 */
import { angleOfDir, dist2, pointInPolygon, polygonCentroid, sampleGrid, wallFrame, wallPieces } from '../../../house/geometry';
import type { Column, Wall } from '../../../house/types';
import type { Part, Vec2, Vec3 } from '../../../engine/types';
import type { BuildContext } from '../../context';
import { cornerCuts, levelFloor } from '../../envelope-kit';
import { Region, divide, pumpSpot, structureFrame, type BoxItem, type PumpSpot, type RodItem } from '../../structure-kit';
import { craneBoomFor, CRANE_PIVOT } from '../../../models/crane';

/** Precast concrete as delivered: light grey, factory-smooth (cured look from the first frame). */
export const PRECAST_GREY = '#CBCDCF';
export const HOLLOW_GREY = '#C3C5C8';

/** 2026 ILS rates (ex-VAT) from docs/build3d/methods-research.md. */
export const PRECAST_RATES = {
  panelM2: 900, // wall panel supplied + erected, crane share included (research sheet ~1,150 for small runs; this house has long repeated runs)
  craneDay: 6000, // 80-100 t mobile crane incl. operator + rigger
  hollowM2: 340, // 20 cm hollow-core supplied + laid, crane share included (research 410 with crane billed separately)
  toppingM2: 130, // mesh + 5 cm topping concrete
  mamadModule: 95000, // approved precast ממ״ד module, delivered and set
  parapetM2: 600, // precast parapet units, set by a small crane
  groutM: 70, // grout / connection pockets
  sealantM: 60, // joint backer + sealant
  panelConcreteM3: 2300, // used only for the bill line, not for cost
} as const;

export const PANEL_MAX = 3.9;
export const PANEL_GAP = 0.004;

export interface PanelBox {
  at: Vec3;
  size: Vec3;
  rotY: number;
}

export interface Panel {
  id: string;
  wall: Wall;
  level: 'lower' | 'entrance';
  s0: number;
  s1: number;
  /** Boxes around the cast-in openings (full wall thickness). */
  boxes: PanelBox[];
  center: Vec2;
  /** Net face area (m²) and concrete volume (m³). */
  m2: number;
  m3: number;
  /** Top and bottom of the panel (m). */
  y0: number;
  y1: number;
  /** Unit direction along the wall and the wall's normal. */
  dir: Vec2;
}

export interface PrecastPlan {
  lower: Panel[];
  entrance: Panel[];
  mamadWalls: Wall[];
  parapets: Wall[];
  /** Joint positions (between neighbouring panels of a wall) for grout and sealant. */
  joints: Array<{ wall: Wall; s: number; y0: number; y1: number; level: 'lower' | 'entrance' }>;
}

const plans = new WeakMap<BuildContext, PrecastPlan>();

const isPanelWall = (w: Wall) =>
  (w.level === 'lower' || w.level === 'entrance') &&
  ((w.role === 'exterior' && (w.material === 'block' || w.material === 'concrete')) || (w.role === 'interior' && w.material === 'concrete'));

export function precastPlan(ctx: BuildContext): PrecastPlan {
  const hit = plans.get(ctx);
  if (hit) return hit;
  const walls = ctx.house.walls;
  const out: PrecastPlan = {
    lower: [],
    entrance: [],
    mamadWalls: walls.filter((w) => w.level === 'entrance' && w.role === 'mamad'),
    parapets: walls.filter((w) => w.role === 'parapet'),
    joints: [],
  };
  for (const lvl of ['lower', 'entrance'] as const) {
    const set = walls.filter((w) => w.level === lvl && isPanelWall(w));
    set.forEach((w, wi) => {
      const earlier = set.slice(0, wi);
      const L = wallFrame(w).length;
      let spans: Array<[number, number]> = [[0, L]];
      for (const [c0, c1] of cornerCuts(w, earlier)) {
        spans = spans.flatMap(([a, b]) =>
          c1 <= a || c0 >= b ? [[a, b] as [number, number]] : [[a, Math.max(a, c0)] as [number, number], [Math.min(b, c1), b] as [number, number]],
        );
        spans = spans.filter(([a, b]) => b - a > 0.03);
      }
      const ops = ctx.house.openings
        .filter((o) => o.wallId === w.id)
        .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as [number, number]);
      const pieces = wallPieces(w, ctx.house.openings, levelFloor(ctx, lvl)).filter((p) => !(p.y0 <= w.baseY + 0.01 && p.y1 - p.y0 < 0.12));
      const yBase = lvl === 'lower' ? ctx.y.lowerBeamTop : w.baseY;
      const f = wallFrame(w);
      let k = 0;
      for (const [a, b] of spans) {
        // Cut positions: even division, moved out of openings so a window never straddles a joint.
        const n = Math.max(1, Math.ceil((b - a) / PANEL_MAX - 1e-6));
        const cuts = divide(a, b, (b - a) / n);
        const snapped = cuts.map((c, i) => {
          if (i === 0 || i === cuts.length - 1) return c;
          const o = ops.find(([o0, o1]) => c > o0 + 0.01 && c < o1 - 0.01);
          if (!o) return c;
          return c - o[0] < o[1] - c ? o[0] : o[1];
        });
        const uniq = snapped.filter((c, i) => i === 0 || c - snapped[i - 1] > 0.3);
        if (uniq[uniq.length - 1] !== b) uniq[uniq.length - 1] = b;
        for (let i = 0; i < uniq.length - 1; i++) {
          const p0 = uniq[i];
          const p1 = uniq[i + 1];
          const gap0 = i === 0 ? 0 : PANEL_GAP / 2;
          const gap1 = i === uniq.length - 2 ? 0 : PANEL_GAP / 2;
          const boxes: PanelBox[] = [];
          let m2 = 0;
          let yLo = Infinity;
          let yHi = -Infinity;
          for (const pc of pieces) {
            const s0 = Math.max(pc.s0, p0 + gap0);
            const s1 = Math.min(pc.s1, p1 - gap1);
            if (s1 - s0 < 0.02) continue;
            const y0 = pc.y0 <= w.baseY + 0.01 ? yBase : pc.y0;
            const cx = w.a[0] + f.dir[0] * ((s0 + s1) / 2);
            const cz = w.a[1] + f.dir[1] * ((s0 + s1) / 2);
            boxes.push({ at: [cx, (y0 + pc.y1) / 2, cz], size: [s1 - s0, pc.y1 - y0, w.thickness], rotY: f.rotY });
            m2 += (s1 - s0) * (pc.y1 - y0);
            yLo = Math.min(yLo, y0);
            yHi = Math.max(yHi, pc.y1);
          }
          if (!boxes.length) continue;
          const mid = (p0 + p1) / 2;
          (lvl === 'lower' ? out.lower : out.entrance).push({
            id: `${w.id}-${k++}`,
            wall: w,
            level: lvl,
            s0: p0,
            s1: p1,
            boxes,
            center: [w.a[0] + f.dir[0] * mid, w.a[1] + f.dir[1] * mid],
            m2,
            m3: m2 * w.thickness,
            y0: yLo,
            y1: yHi,
            dir: f.dir,
          });
          if (i > 0) out.joints.push({ wall: w, s: p0, y0: yLo, y1: yHi, level: lvl });
        }
      }
    });
  }
  plans.set(ctx, out);
  return out;
}

/** Columns that ride with the panels (precast columns inside the wall lines). */
export function columnItems(ctx: BuildContext, level: 'lower' | 'entrance'): { items: BoxItem[]; m3: number } {
  const cols: Column[] = ctx.house.columns.filter((c) => c.level === level);
  let m3 = 0;
  const items = cols.map((c) => {
    const y0 = level === 'lower' ? Math.min(c.baseY, ctx.y.lowerBeamTop) : c.baseY;
    const y1 = c.baseY + c.height - 0.002;
    m3 += c.size[0] * c.size[1] * (y1 - y0);
    return { at: [c.center[0], (y0 + y1) / 2, c.center[1]] as Vec3, size: [c.size[0], y1 - y0, c.size[1]] as Vec3, rotY: c.rotation ?? 0 };
  });
  return { items, m3 };
}

// ---------------------------------------------------------------------------
// Hollow-core planks
// ---------------------------------------------------------------------------

export interface PlankPlan {
  planks: Array<{ x0: number; x1: number; z0: number; z1: number }>;
  /** Core holes visible at the free (outer) ends. */
  holes: BoxItem[];
  m2: number;
}

/** x of bearing walls running along Z on a level (deduped), where plank runs are cut. */
function bearingXs(ctx: BuildContext, level: 'lower' | 'entrance'): number[] {
  const xs: number[] = [];
  for (const w of ctx.house.walls) {
    if (w.level !== level || w.role === 'parapet' || w.role === 'retaining') continue;
    const dx = Math.abs(w.b[0] - w.a[0]);
    const dz = Math.abs(w.b[1] - w.a[1]);
    if (dz < 2.4 || dx > 0.05) continue;
    const x = w.a[0];
    if (xs.every((q) => Math.abs(q - x) > 0.9)) xs.push(x);
  }
  return xs;
}

/**
 * Planks 1.2 m wide, running along X between bearing walls, over a slab region.
 * `y0` is the plank underside at a point; planks are 20 cm thick.
 */
export function plankPlan(ctx: BuildContext, reg: Region, level: 'lower' | 'entrance', y0: (p: Vec2) => number): PlankPlan {
  const base = reg.refined(bearingXs(ctx, level), []);
  const tiles = base.tiles([60, 1.2], [reg.xs[0], reg.zs[0]]).filter((t) => t.x1 - t.x0 > 0.15 && t.z1 - t.z0 > 0.15);
  const planks = tiles.map((t) => ({ x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 }));
  const holes: BoxItem[] = [];
  for (const t of planks) {
    const zc = (t.z0 + t.z1) / 2;
    const yb = y0([(t.x0 + t.x1) / 2, zc]);
    const n = Math.max(1, Math.round((t.z1 - t.z0) / 0.24));
    const pitch = (t.z1 - t.z0) / n;
    for (const [x, dir] of [
      [t.x0, -1],
      [t.x1, 1],
    ] as const) {
      if (reg.contains([x + dir * 0.06, zc])) continue;
      for (let i = 0; i < n; i++) holes.push({ at: [x + dir * 0.002, yb + 0.1, t.z0 + pitch * (i + 0.5)], size: [0.006, 0.11, Math.min(0.15, pitch * 0.62)] });
    }
  }
  const m2 = planks.reduce((s, t) => s + (t.x1 - t.x0) * (t.z1 - t.z0), 0);
  return { planks, holes, m2 };
}

// ---------------------------------------------------------------------------
// Mobile crane: stand + hook poses
// ---------------------------------------------------------------------------

export interface CraneStand {
  at: Vec3;
  rotY: number;
  dir: Vec2;
  /** Turret pivot (world XZ). */
  pivot: Vec2;
  /** Slide-in offset for the arrival animation. */
  slideIn: Vec3;
}

const stands = new WeakMap<BuildContext, CraneStand>();

/** Pump trucks of the shared pours the crane must not collide with (deterministic: same calls as the steps). */
export function sharedPumpSpots(ctx: BuildContext): PumpSpot[] {
  const fr = structureFrame(ctx);
  const out: PumpSpot[] = [];
  const lowC = polygonCentroid(ctx.footprint.lower);
  out.push(pumpSpot(ctx, fr.regions.lowerSlab, lowC, fr.backfill, fr.backfill, fr.y.lowerTop));
  const gradeOutline = fr.regions.grade.shapes().flatMap((s) => s.outline);
  if (gradeOutline.length) out.push(pumpSpot(ctx, fr.regions.grade, polygonCentroid(gradeOutline), fr.backfill, fr.backfill, fr.y.gradeTop));
  const ceil = fr.regions.ceiling.shapes().flatMap((s) => s.outline);
  if (ceil.length) out.push(pumpSpot(ctx, fr.regions.ceiling, polygonCentroid(ceil), fr.backfill, fr.backfill, (p) => fr.y.entranceTop(p)));
  const roof = fr.regions.roof.shapes().flatMap((s) => s.outline);
  if (roof.length) out.push(pumpSpot(ctx, fr.regions.roof, polygonCentroid(roof), fr.backfill, fr.backfill, fr.y.roofTop));
  return out;
}

export function craneStand(ctx: BuildContext): CraneStand {
  const hit = stands.get(ctx);
  if (hit) return hit;
  const fr = structureFrame(ctx);
  const houseReg = Region.of([ctx.footprint.house]);
  const c0 = polygonCentroid(ctx.footprint.house);
  const base = pumpSpot(ctx, houseReg, c0, fr.backfill, fr.backfill, 0);
  const dir: Vec2 = [Math.cos(base.rotY), -Math.sin(base.rotY)];
  const pumps = sharedPumpSpots(ctx);
  const inLot0 = pointInPolygon([base.at[0], base.at[2]], ctx.lot.boundary);
  const free = (c: Vec2) => pumps.every((p) => dist2(c, [p.at[0], p.at[2]]) > 10.5);
  const valid = (c: Vec2) => {
    if (pointInPolygon(c, ctx.footprint.house)) return false;
    const gy = sampleGrid(fr.backfill, c[0], c[1]);
    if (Math.abs(gy - base.at[1]) > 0.8) return false;
    // The whole carrier (11 m) stays on the same side of the lot line as the base spot.
    for (const s of [-5.4, 0, 5.4]) {
      const q: Vec2 = [c[0] + dir[0] * s, c[1] + dir[1] * s];
      if (pointInPolygon(q, ctx.lot.boundary) !== inLot0) return false;
      if (pointInPolygon(q, ctx.footprint.house)) return false;
    }
    return true;
  };
  let pick: Vec2 = [base.at[0], base.at[2]];
  if (!free(pick)) {
    // Slide along the kerb until clear of every pump spot, then keep the nearest valid stand.
    const cands = [-12, 12, -16, 16, -20, 20, -26, 26, 32, -32].map((d): Vec2 => [base.at[0] + dir[0] * d, base.at[2] + dir[1] * d]);
    const ok = cands.find((c) => free(c) && valid(c));
    if (ok) pick = ok;
  }
  const gy = sampleGrid(fr.backfill, pick[0], pick[1]);
  const inward = ctx.lot.street.inward;
  const s: CraneStand = {
    at: [pick[0], gy, pick[1]],
    rotY: base.rotY,
    dir,
    pivot: [pick[0] + dir[0] * CRANE_PIVOT[0], pick[1] + dir[1] * CRANE_PIVOT[0]],
    slideIn: [-inward[0] * 12, 0, -inward[1] * 12],
  };
  stands.set(ctx, s);
  return s;
}

/** Hook pose (truck space) for a world point. */
export function hookPose(st: CraneStand, world: Vec3): number[] {
  const wx = world[0] - st.at[0];
  const wz = world[2] - st.at[2];
  const lx = wx * st.dir[0] + wz * st.dir[1];
  const lz = -wx * st.dir[1] + wz * st.dir[0];
  return [lx, world[1] - st.at[1], lz];
}

/** Horizontal reach (m) from the turret to a point. */
export const reachTo = (st: CraneStand, p: Vec2) => dist2(st.pivot, p);

export function craneBoomLength(st: CraneStand, world: Vec3): number {
  const pose = hookPose(st, world);
  return craneBoomFor(Math.hypot(pose[0] - CRANE_PIVOT[0], pose[2]), pose[1]).length;
}

/** The crane model part, with the hook hanging at `hook` (world). */
export function cranePart(id: string, st: CraneStand, hook: Vec3, extra: Partial<Part> = {}): Part {
  return {
    id,
    shape: { kind: 'model', name: 'crane', pose: hookPose(st, hook) },
    material: 'white',
    position: st.at,
    rotationY: st.rotY,
    ...extra,
    tags: ['model', 'machine', 'crane', ...(extra.tags ?? [])],
  };
}

// ---------------------------------------------------------------------------
// Push-pull props
// ---------------------------------------------------------------------------

/** Inclined props (two per panel) on the inner face; returns rods + base plates. */
export function propsFor(
  ctx: BuildContext,
  panels: Panel[],
  footY: (p: Vec2) => number,
  attachY: number,
  reach: number,
): { rods: RodItem[]; plates: BoxItem[] } {
  const rods: RodItem[] = [];
  const plates: BoxItem[] = [];
  for (const p of panels) {
    const w = p.wall;
    const f = wallFrame(w);
    const len = p.s1 - p.s0;
    const sideOf = (s: number, n: number): Vec2 => [w.a[0] + f.dir[0] * s + f.normal[0] * n, w.a[1] + f.dir[1] * s + f.normal[1] * n];
    const probe = sideOf((p.s0 + p.s1) / 2, 0.9);
    const fp = ctx.footprint[p.level];
    const inside = pointInPolygon(probe, fp);
    const probeOpp = sideOf((p.s0 + p.s1) / 2, -0.9);
    const sign = inside ? 1 : pointInPolygon(probeOpp, fp) ? -1 : dist2(probe, polygonCentroid(fp)) < dist2(probeOpp, polygonCentroid(fp)) ? 1 : -1;
    const n = len > 2.2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const s = n === 1 ? (p.s0 + p.s1) / 2 : p.s0 + len * (i ? 0.78 : 0.22);
      const top = sideOf(s, sign * (w.thickness / 2));
      const foot = sideOf(s, sign * (w.thickness / 2 + reach));
      const fy = footY(foot);
      rods.push({ a: [foot[0], fy, foot[1]], b: [top[0], attachY, top[1]] });
      plates.push({ at: [foot[0], fy + 0.02, foot[1]], size: [0.4, 0.04, 0.4], rotY: angleOfDir(f.dir) });
    }
  }
  return { rods, plates };
}

/** Piece shape for a panel (one merged mesh so the panel drops as one). */
export function panelShape(p: Panel): Part['shape'] {
  return { kind: 'merge', shapes: p.boxes.map((b) => ({ kind: 'box' as const, size: b.size, at: b.at, rotY: b.rotY })) };
}

export const totalM2 = (ps: Panel[]) => ps.reduce((s, p) => s + p.m2, 0);
export const totalM3 = (ps: Panel[]) => ps.reduce((s, p) => s + p.m3, 0);
