/**
 * Phase 9 · מערכות — first-fix installations placed from the house model:
 *  - plumbing: a manifold on the shaft wall, red/blue supply lines hung under the slab to
 *    each wet room and dropped down the wall surface to every fixture (tubes);
 *  - drainage: gray pipes in the floor build-up from every fixture to a stack in the shaft
 *    (vertical line to the sewer connection), a second stack for the on-grade south zone;
 *  - electrical: boxes on room walls (outlets, switches), conduits up to the slab, a
 *    ceiling box per room, a main panel in the entry and a trunk + riser to each room;
 *  - AC: ducts along the corridor ceilings, branches to the served rooms, grilles.
 * Wall-mounted items carry `mep-in-wall` (removed by p10-plaster-interior), floor drains
 * `mep-under-floor` (removed by p11-flooring), ducts `duct`.
 */
import { angleOfDir, bbox2, dist2, distanceToSegment, lerp2, pointInPolygon, polygonArea, polygonCentroid } from '../house/geometry';
import type { Fixture, FixtureKind, Room } from '../house/types';
import type { CameraHint, Part, PrimitiveShape, StepDef, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { PRICES, line, roundCost } from './kit';
import {
  ceilingYOf,
  ductBoxes,
  floorYOf,
  lift,
  manhattan,
  nearestWall,
  nearOpening,
  ringSamples,
  routeLength,
  surfacePoint,
  wallsOfLevel,
  type BoxItem,
  type Lvl,
  type WallHit,
} from './envelope-kit';

const LEVELS: Lvl[] = ['lower', 'entrance'];
const clean = (pts: Vec3[]): Vec3[] => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 0.012);
const tube = (points: Vec3[], radius: number, bend = 0.08): PrimitiveShape => ({ kind: 'tube', points: clean(points), radius, bend, radialSegments: 6 });

function houseBounds(ctx: BuildContext, y0: number, y1: number): CameraHint['bounds'] {
  const b = bbox2(ctx.footprint.house);
  return { min: [b.min[0] - 1, y0, b.min[1] - 1], max: [b.max[0] + 1, y1, b.max[1] + 1] };
}

const roomOf = (ctx: BuildContext, f: Fixture): Room | undefined => {
  const rooms = ctx.house.rooms.filter((r) => r.level === f.level);
  return rooms.find((r) => pointInPolygon(f.center, r.polygon)) ?? rooms.reduce<Room | undefined>((b, r) => (!b || dist2(f.center, r.labelAt) < dist2(f.center, b.labelAt) ? r : b), undefined);
};

/** Plumbing shaft: the box formed by the E-SH* walls (fallback: middle of the house). */
function shaftCenter(ctx: BuildContext): Vec2 {
  const sh = ctx.house.walls.filter((w) => w.id.startsWith('E-SH'));
  if (!sh.length) return polygonCentroid(ctx.footprint.house);
  const b = bbox2(sh.flatMap((w) => [w.a, w.b]));
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
}

const sewerStart = (ctx: BuildContext): Vec2 => {
  const wet = ctx.house.rooms.filter((r) => r.level === 'lower' && ['bath', 'wc', 'laundry', 'kitchen'].includes(r.kind));
  return wet.length ? polygonCentroid(wet[0].polygon) : polygonCentroid(ctx.footprint.lower);
};

// ---------------------------------------------------------------------------
// Water fixtures
// ---------------------------------------------------------------------------

interface WaterPoint {
  fixture: Fixture;
  room: Room | undefined;
  hot: boolean;
  /** Supply stub height above the level floor. */
  h: number;
  hit: WallHit;
}

const WATER: Partial<Record<FixtureKind, { hot: boolean; h: number }>> = {
  toilet: { hot: false, h: 0.25 },
  sink: { hot: true, h: 0.55 },
  shower: { hot: true, h: 1.15 },
  bathtub: { hot: true, h: 0.6 },
  washer: { hot: false, h: 0.95 },
};

function waterPoints(ctx: BuildContext, lvl: Lvl): WaterPoint[] {
  const walls = wallsOfLevel(ctx, lvl);
  const fx = ctx.house.fixtures.filter((f) => f.level === lvl);
  const out: WaterPoint[] = [];
  const add = (f: Fixture, hot: boolean, h: number) => {
    const hit = nearestWall(walls, f.center);
    out.push({ fixture: f, room: roomOf(ctx, f), hot, h, hit });
  };
  for (const f of fx) {
    const spec = WATER[f.kind];
    if (spec) add(f, spec.hot, spec.h);
  }
  // Kitchen sink: the counter run next to a window (fallback: the first counter).
  const counters = fx.filter((f) => f.kind === 'kitchen-counter');
  if (counters.length) {
    const score = (f: Fixture) => {
      const hit = nearestWall(walls, f.center);
      const near = ctx.house.openings.some((o) => o.wallId === hit.wall.id && o.kind === 'window' && Math.abs(o.offset - hit.s) < o.width / 2 + 0.6);
      return (near ? 0 : 10) + hit.dist;
    };
    const sink = counters.reduce((b, f) => (score(f) < score(b) ? f : b), counters[0]);
    add(sink, true, 0.85);
  }
  return out;
}

/** Wall hit adjusted so the manifold sits on the side facing the wet rooms. */
function manifoldHit(ctx: BuildContext, lvl: Lvl, toward: Vec2): WallHit {
  const walls = wallsOfLevel(ctx, lvl);
  const h = nearestWall(walls, shaftCenter(ctx), 0.9);
  const side = ((toward[0] - h.foot[0]) * h.out[0] * h.side + (toward[1] - h.foot[1]) * h.out[1] * h.side >= 0 ? 1 : -1) as 1 | -1;
  const flip = side === h.side ? 1 : -1;
  const wallLen = Math.hypot(h.wall.b[0] - h.wall.a[0], h.wall.b[1] - h.wall.a[1]);
  const s = Math.max(0.35, Math.min(wallLen - 0.35, h.s));
  const dir = h.dir;
  return {
    ...h,
    s,
    foot: [h.wall.a[0] + dir[0] * s, h.wall.a[1] + dir[1] * s],
    side: (h.side * flip) as 1 | -1,
    out: [h.out[0] * flip, h.out[1] * flip],
  };
}

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

export function phaseSystems(ctx: BuildContext): StepDef[] {
  return [plumbing(ctx), drainage(ctx), electrical(ctx), airConditioning(ctx)];
}

// ----------------------------------------------------------------- plumbing
function plumbing(ctx: BuildContext): StepDef {
  const parts: Part[] = [];
  let points = 0;
  let pipeLen = 0;
  let delay = 0;
  for (const lvl of LEVELS) {
    const wps = waterPoints(ctx, lvl);
    if (!wps.length) continue;
    const walls = wallsOfLevel(ctx, lvl);
    const fl = floorYOf(ctx, lvl);
    const ceil = ceilingYOf(ctx, lvl);
    const yHot = ceil - 0.2;
    const yCold = ceil - 0.27;
    const centroid = polygonCentroid(wps.map((w) => w.fixture.center));
    const mh = manifoldHit(ctx, lvl, centroid);
    const M = surfacePoint(mh, 0.05);
    const yM = fl + 1.45;
    const along = (p: Vec2, d: number): Vec2 => [p[0] + mh.dir[0] * d, p[1] + mh.dir[1] * d];

    // Manifold: backing plate, red/blue headers, valves.
    const plate = surfacePoint(mh, 0.015);
    parts.push({
      id: `p9-plumbing:manifold-plate-${lvl}`,
      shape: { kind: 'box', size: [0.62, 0.34, 0.03], at: [plate[0], yM, plate[1]], rotY: angleOfDir(mh.dir) },
      material: 'galvanized',
      tags: ['mep-in-wall', 'manifold', `level:${lvl}`],
      anim: { type: 'drop', from: [0, 0.8, 0], delay, duration: 0.6, ease: 'bounce' },
    });
    const header = (yy: number, mat: 'pipeRed' | 'pipeBlue'): Part => ({
      id: `p9-plumbing:manifold-${mat}-${lvl}`,
      shape: {
        kind: 'merge',
        shapes: [
          { kind: 'rod', a: [along(M, -0.25)[0], yy, along(M, -0.25)[1]], b: [along(M, 0.25)[0], yy, along(M, 0.25)[1]], radius: 0.018, segments: 8 },
          ...[-0.2, -0.1, 0, 0.1, 0.2].map<PrimitiveShape>((d) => {
            const q = along(M, d);
            const o: Vec2 = [mh.out[0] * 0.07, mh.out[1] * 0.07];
            return { kind: 'rod', a: [q[0], yy, q[1]], b: [q[0] + o[0], yy, q[1] + o[1]], radius: 0.012, segments: 6 };
          }),
        ],
      },
      material: mat,
      tags: ['mep-in-wall', 'manifold', `level:${lvl}`],
      edges: false,
      anim: { type: 'fade', delay: delay + 0.4, duration: 0.5 },
    });
    parts.push(header(yM + 0.07, 'pipeRed'), header(yM - 0.07, 'pipeBlue'));

    // Group fixtures by room; each room gets a branch off the trunk.
    const rooms = new Map<string, WaterPoint[]>();
    for (const w of wps) {
      const k = w.room?.id ?? 'x';
      rooms.set(k, [...(rooms.get(k) ?? []), w]);
    }
    let idx = 0;
    for (const [rid, list] of Array.from(rooms.entries())) {
      const drops = list.map((w) => {
        const sClamped = Math.max(0.25, Math.min(Math.hypot(w.hit.wall.b[0] - w.hit.wall.a[0], w.hit.wall.b[1] - w.hit.wall.a[1]) - 0.25, w.hit.s));
        const hit: WallHit = { ...w.hit, s: sClamped, foot: [w.hit.wall.a[0] + w.hit.dir[0] * sClamped, w.hit.wall.a[1] + w.hit.dir[1] * sClamped] };
        return { w, hit, P: surfacePoint(hit, 0.02) };
      });
      const B = polygonCentroid(drops.map((d) => d.P));
      const trunk = manhattan(M, B, walls);
      const hotShapes: PrimitiveShape[] = [];
      const coldShapes: PrimitiveShape[] = [];
      const build = (yTrunk: number, start: Vec2, dd: number, hot: boolean, shapes: PrimitiveShape[]) => {
        let first = true;
        const riser: Vec3[] = [[start[0], yM + (hot ? 0.07 : -0.07), start[1]], [start[0], yTrunk, start[1]]];
        for (const d of drops) {
          if (hot && !d.w.hot) continue;
          const P = [d.P[0] + d.hit.dir[0] * dd, d.P[1] + d.hit.dir[1] * dd] as Vec2;
          const branch = manhattan(B, P, walls);
          const path: Vec3[] = [...riser, ...lift(trunk.slice(1), yTrunk), ...lift(branch.slice(1), yTrunk)];
          const stub: Vec2 = [P[0] + d.hit.out[0] * 0.1, P[1] + d.hit.out[1] * 0.1];
          path.push([P[0], fl + d.w.h, P[1]], [stub[0], fl + d.w.h, stub[1]]);
          shapes.push(tube(path, 0.0125));
          pipeLen += (first ? routeLength(trunk) : 0) + routeLength(branch) + (yTrunk - fl - d.w.h);
          first = false;
          points++;
        }
      };
      build(yHot, M, 0.03, true, hotShapes);
      build(yCold, [M[0], M[1]], -0.03, false, coldShapes);
      if (hotShapes.length)
        parts.push({
          id: `p9-plumbing:hot-${lvl}-${rid}`,
          shape: { kind: 'merge', shapes: hotShapes },
          material: 'pipeRed',
          tags: ['mep-in-wall', 'plumbing', 'supply-hot', `level:${lvl}`],
          edges: false,
          anim: { type: 'fade', delay: delay + 1.0 + idx * 0.45, duration: 0.7 },
        });
      parts.push({
        id: `p9-plumbing:cold-${lvl}-${rid}`,
        shape: { kind: 'merge', shapes: coldShapes },
        material: 'pipeBlue',
        tags: ['mep-in-wall', 'plumbing', 'supply-cold', `level:${lvl}`],
        edges: false,
        anim: { type: 'fade', delay: delay + 1.1 + idx * 0.45, duration: 0.7 },
      });
      idx++;
    }
    delay += 1.4 + idx * 0.45;
  }
  return {
    id: 'p9-plumbing',
    phase: 9,
    titleHe: 'אינסטלציה: מים חמים וקרים',
    materials: [
      line('צינורות מים (חמים וקרים)', pipeLen, 'מ׳', 0),
      line('נקודות מים', points, 'יח׳', 0),
      line('מנדף מים (קולקטור)', 2, 'יח׳', 0),
    ],
    costILS: roundCost(points * PRICES.plumbingPoint * 0.6),
    parts,
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, ctx.entrance.floorY + 3.1), polar: 58 },
    view: { xray: true, ghostAbove: ctx.roof.floorY - 0.3 },
  };
}

// ----------------------------------------------------------------- drainage
function drainage(ctx: BuildContext): StepDef {
  const parts: Part[] = [];
  let pipeLen = 0;
  let count = 0;
  const lowerWalls = wallsOfLevel(ctx, 'lower');
  const S0 = shaftCenter(ctx);
  // Stack sits on the surface of the lower wall nearest the shaft; same XZ on the entrance floor (inside the shaft).
  const sh = nearestWall(lowerWalls, S0, 0.9);
  const S = surfacePoint(sh, 0.07);
  const yLowerPipe = floorYOf(ctx, 'lower') - 0.03;
  const yEntPipe = floorYOf(ctx, 'entrance') - 0.03;
  const start = sewerStart(ctx);
  const y0 = ctx.y.lowerBeamTop - 0.32;

  const radiusOf = (k: FixtureKind) => (k === 'toilet' ? 0.055 : k === 'washer' || k === 'shower' || k === 'bathtub' ? 0.04 : 0.032);
  const drainFixtures = (lvl: Lvl) => ctx.house.fixtures.filter((f) => f.level === lvl && (WATER[f.kind] || f.kind === 'kitchen-counter'));

  // Kitchen: only the sink counter drains (same pick as the supply).
  const sinkCounter = (lvl: Lvl) => waterPoints(ctx, lvl).find((w) => w.fixture.kind === 'kitchen-counter')?.fixture;

  type Run = { lvl: Lvl; f: Fixture; to: Vec2; y: number };
  const runs: Run[] = [];
  const southPoints: Vec2[] = [];
  for (const lvl of LEVELS) {
    const sc = sinkCounter(lvl);
    for (const f of drainFixtures(lvl)) {
      if (f.kind === 'kitchen-counter' && f !== sc) continue;
      const north = lvl === 'lower' || pointInPolygon(f.center, ctx.footprint.lower);
      if (!north) southPoints.push(f.center);
      runs.push({ lvl, f, to: S, y: lvl === 'lower' ? yLowerPipe : yEntPipe });
    }
  }
  // South (on-grade) zone: a second stack on the nearest entrance wall.
  let S2: Vec2 | null = null;
  if (southPoints.length) {
    const c = polygonCentroid(southPoints);
    const h2 = nearestWall(wallsOfLevel(ctx, 'entrance'), c, 0.9);
    S2 = surfacePoint(h2, 0.07);
  }
  for (const r of runs) {
    const north = r.lvl === 'lower' || pointInPolygon(r.f.center, ctx.footprint.lower);
    if (!north && S2) r.to = S2;
  }

  const byLevel = (lvl: Lvl) => runs.filter((r) => r.lvl === lvl);
  let delay = 0;
  for (const lvl of LEVELS) {
    const list = byLevel(lvl);
    if (!list.length) continue;
    const walls = wallsOfLevel(ctx, lvl);
    // One merged part per stack target so the pipes appear as a group.
    const targets = new Map<string, Run[]>();
    for (const r of list) targets.set(`${r.to[0].toFixed(2)},${r.to[1].toFixed(2)}`, [...(targets.get(`${r.to[0].toFixed(2)},${r.to[1].toFixed(2)}`) ?? []), r]);
    let k = 0;
    for (const group of Array.from(targets.values())) {
      const shapes: PrimitiveShape[] = [];
      for (const r of group) {
        const route = manhattan(r.f.center, r.to, walls);
        shapes.push(tube(lift(route, r.y), radiusOf(r.f.kind), 0.2));
        // Floor drain body at the fixture.
        shapes.push({ kind: 'cylinder', radius: radiusOf(r.f.kind) + 0.012, height: 0.05, at: [r.f.center[0], r.y - 0.02, r.f.center[1]], segments: 10 });
        pipeLen += routeLength(route);
        count++;
      }
      parts.push({
        id: `p9-drainage:floor-${lvl}-${k++}`,
        shape: { kind: 'merge', shapes },
        material: 'drain',
        tags: ['mep-under-floor', 'drainage', `level:${lvl}`],
        edges: false,
        anim: { type: 'fade', delay: delay + 0.3, duration: 0.8 },
      });
    }
    delay += 1.2;
  }
  // Vertical stack through the shaft down to the sewer connection (+ vent to the roof).
  const yTop = yEntPipe;
  parts.push({
    id: 'p9-drainage:stack',
    shape: { kind: 'merge', shapes: [tube([[S[0], yTop, S[1]], [S[0], yLowerPipe, S[1]]], 0.06, 0.1)] },
    material: 'drain',
    tags: ['mep-in-wall', 'drainage', 'level:entrance'],
    edges: false,
    anim: { type: 'rise', delay: 0.2, duration: 1.2 },
  });
  parts.push({
    id: 'p9-drainage:sewer-link',
    shape: { kind: 'merge', shapes: [tube([[S[0], yLowerPipe, S[1]], [S[0], y0, S[1]], ...lift(manhattan(S, start, wallsOfLevel(ctx, 'lower')).slice(1), y0)], 0.075, 0.25)] },
    material: 'drain',
    tags: ['mep-under-floor', 'drainage', 'level:lower'],
    edges: false,
    anim: { type: 'fade', delay: 1.4, duration: 0.6 },
  });
  parts.push({
    id: 'p9-drainage:vent',
    shape: { kind: 'merge', shapes: [tube([[S[0], yTop, S[1]], [S[0], ctx.roof.floorY + 0.75, S[1]]], 0.04, 0.1), { kind: 'cylinder', radius: 0.06, height: 0.05, at: [S[0], ctx.roof.floorY + 0.75, S[1]], segments: 10 }] },
    material: 'drain',
    tags: ['drainage', 'vent', 'level:roof'],
    edges: false,
    anim: { type: 'rise', delay: 0.6, duration: 1.2 },
  });
  if (S2) {
    parts.push({
      id: 'p9-drainage:stack-south',
      shape: { kind: 'merge', shapes: [tube([[S2[0], yEntPipe, S2[1]], [S2[0], ctx.y.platform + 0.35, S2[1]]], 0.06, 0.1)] },
      material: 'drain',
      tags: ['mep-in-wall', 'drainage', 'level:entrance'],
      edges: false,
      anim: { type: 'rise', delay: 0.8, duration: 0.8 },
    });
  }
  return {
    id: 'p9-drainage',
    phase: 9,
    titleHe: 'ניקוז ושפכים',
    materials: [
      line('צינורות ביוב ושפכים (קוטר 50–110)', pipeLen + (yTop - y0) + 2, 'מ׳', 0),
      line('נקודות ניקוז', count, 'יח׳', 0),
      line('קו אוורור לגג', 1, 'יח׳', 0),
    ],
    costILS: roundCost(count * PRICES.plumbingPoint * 0.5),
    parts,
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY - 0.3, ctx.roof.floorY + 1), polar: 58 },
    view: { xray: true, ghostAbove: ctx.roof.floorY - 0.3 },
  };
}

// ----------------------------------------------------------------- electrical
function electrical(ctx: BuildContext): StepDef {
  const parts: Part[] = [];
  const rooms = ctx.house.rooms.filter((r) => r.kind !== 'terrace');
  let outlets = 0;
  let switches = 0;
  let lights = 0;
  let conduitLen = 0;

  // Main panel in the entry room, on the wall farthest from the front door.
  const entry = rooms.find((r) => r.kind === 'entry') ?? rooms.find((r) => r.level === 'entrance') ?? rooms[0];
  const door = ctx.house.openings.find((o) => o.kind === 'entry-door');
  const doorWall = door ? ctx.house.walls.find((w) => w.id === door.wallId) : undefined;
  const doorPos: Vec2 = doorWall ? [doorWall.a[0] + ((doorWall.b[0] - doorWall.a[0]) * door!.offset) / Math.max(0.01, dist2(doorWall.a, doorWall.b)), doorWall.a[1] + ((doorWall.b[1] - doorWall.a[1]) * door!.offset) / Math.max(0.01, dist2(doorWall.a, doorWall.b))] : entry.labelAt;
  const eSamples = ringSamples(entry.polygon, 0.5, 0.25);
  const pick = eSamples.reduce((b, s) => (dist2(s.p, doorPos) > dist2(b.p, doorPos) ? s : b), eSamples[0]);
  const panelAt: Vec2 = [pick.p[0] + pick.inward[0] * 0.075, pick.p[1] + pick.inward[1] * 0.075];
  const ceilE = ceilingYOf(ctx, 'entrance');
  const flE = floorYOf(ctx, 'entrance');
  parts.push({
    id: 'p9-electrical:panel',
    shape: { kind: 'merge', shapes: [{ kind: 'box', size: [0.5, 0.7, 0.14], at: [panelAt[0], flE + 1.5, panelAt[1]], rotY: angleOfDir(pick.dir) }] },
    material: 'white',
    tags: ['electrical-panel', 'level:entrance'],
    anim: { type: 'drop', from: [0, 1.2, 0], duration: 0.7, ease: 'bounce' },
  });
  const panelTop: Vec2 = [panelAt[0] + pick.inward[0] * 0.07, panelAt[1] + pick.inward[1] * 0.07];

  // Shaft riser connects the floors.
  const sh = nearestWall(wallsOfLevel(ctx, 'lower'), shaftCenter(ctx), 0.9);
  const R = surfacePoint(sh, 0.12);
  const ceilL = ceilingYOf(ctx, 'lower');

  const boxes: Record<Lvl, BoxItem[]> = { lower: [], entrance: [] };
  const conduitShapes: Record<Lvl, PrimitiveShape[]> = { lower: [], entrance: [] };

  for (const lvl of LEVELS) {
    const fl = floorYOf(ctx, lvl);
    const ceil = ceilingYOf(ctx, lvl);
    const walls = wallsOfLevel(ctx, lvl);
    const trunkY = ceil - 0.1;
    const root: Vec2 = lvl === 'entrance' ? panelTop : R;
    if (lvl === 'entrance') {
      // panel -> up to the ceiling; riser down through the shaft to the lower floor
      conduitShapes[lvl].push(tube([[panelTop[0], flE + 1.85, panelTop[1]], [panelTop[0], trunkY, panelTop[1]]], 0.016));
      const rt = manhattan(panelTop, R, walls);
      conduitShapes[lvl].push(tube([[panelTop[0], trunkY, panelTop[1]], ...lift(rt.slice(1), trunkY), [R[0], ceilL - 0.1, R[1]]], 0.02, 0.1));
      conduitLen += routeLength(rt) + (trunkY - ceilL);
    }
    for (const room of rooms.filter((r) => r.level === lvl)) {
      const ringOk = ringSamples(room.polygon, 2.6, 0.5).filter((s) => !nearOpening(ctx, s.p, lvl, 0.35));
      const ceilBoxAt: Vec2 = room.labelAt;
      const drops: Array<{ p: Vec2; yBox: number }> = [];
      ringOk.forEach((s, i) => {
        const p: Vec2 = [s.p[0] + s.inward[0] * 0.02, s.p[1] + s.inward[1] * 0.02];
        boxes[lvl].push({ at: [p[0], fl + 0.3, p[1]], size: [0.08, 0.08, 0.04], rotY: angleOfDir(s.dir) });
        drops.push({ p: [s.p[0] + s.inward[0] * 0.045, s.p[1] + s.inward[1] * 0.045], yBox: fl + 0.3 });
        outlets++;
        void i;
      });
      // Switches beside the door(s) of this room.
      for (const o of ctx.house.openings.filter((x) => x.level === lvl && (x.kind === 'door' || x.kind === 'entry-door' || x.kind === 'mamad-door'))) {
        const w = walls.find((x) => x.id === o.wallId);
        if (!w) continue;
        const L = dist2(w.a, w.b);
        const dir: Vec2 = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
        const c: Vec2 = [w.a[0] + dir[0] * o.offset, w.a[1] + dir[1] * o.offset];
        const nrm: Vec2 = [dir[1], -dir[0]];
        // The room is on whichever side of the wall its polygon covers.
        for (const side of [1, -1]) {
          const q: Vec2 = [c[0] + nrm[0] * side * (w.thickness / 2 + 0.3), c[1] + nrm[1] * side * (w.thickness / 2 + 0.3)];
          if (!pointInPolygon(q, room.polygon)) continue;
          const sw: Vec2 = [c[0] + dir[0] * (o.width / 2 + 0.2) + nrm[0] * side * (w.thickness / 2 + 0.02), c[1] + dir[1] * (o.width / 2 + 0.2) + nrm[1] * side * (w.thickness / 2 + 0.02)];
          boxes[lvl].push({ at: [sw[0], fl + 1.2, sw[1]], size: [0.08, 0.08, 0.04], rotY: Math.atan2(-dir[1], dir[0]) });
          drops.push({ p: [sw[0] + nrm[0] * side * 0.025, sw[1] + nrm[1] * side * 0.025], yBox: fl + 1.2 });
          switches++;
        }
      }
      // Ceiling box + conduits from every wall box up to the slab and across to it.
      boxes[lvl].push({ at: [ceilBoxAt[0], ceil - 0.03, ceilBoxAt[1]], size: [0.1, 0.06, 0.1], rotY: 0 });
      lights++;
      for (const d of drops) {
        const leg = manhattan(d.p, ceilBoxAt, walls);
        const path: Vec3[] = [[d.p[0], d.yBox, d.p[1]], ...lift(leg, ceil - 0.14), [ceilBoxAt[0], ceil - 0.05, ceilBoxAt[1]]];
        conduitShapes[lvl].push(tube(path, 0.0115, 0.05));
        conduitLen += ceil - 0.14 - d.yBox + routeLength(leg);
      }
      // Trunk from the panel/riser to this room's ceiling box.
      const rt = manhattan(root, ceilBoxAt, walls);
      conduitShapes[lvl].push(tube([[root[0], trunkY, root[1]], ...lift(rt.slice(1), trunkY), [ceilBoxAt[0], ceil - 0.05, ceilBoxAt[1]]], 0.016, 0.1));
      conduitLen += routeLength(rt);
    }
  }
  let delay = 0.8;
  for (const lvl of LEVELS) {
    if (boxes[lvl].length)
      parts.push({
        id: `p9-electrical:boxes-${lvl}`,
        shape: { kind: 'boxes', items: boxes[lvl] },
        material: 'white',
        tags: ['mep-in-wall', 'electrical', `level:${lvl}`],
        anim: { type: 'sequence', delay, stagger: 0.02, duration: 0.3, order: 'near', origin: panelAt },
      });
    parts.push({
      id: `p9-electrical:conduits-${lvl}`,
      shape: { kind: 'merge', shapes: conduitShapes[lvl] },
      material: 'conduit',
      tags: ['mep-in-wall', 'electrical', 'conduit', `level:${lvl}`],
      edges: false,
      anim: { type: 'fade', delay: delay + 0.6, duration: 1.2 },
    });
    delay += 1.6;
  }
  const points = outlets + switches + lights;
  return {
    id: 'p9-electrical',
    phase: 9,
    titleHe: 'חשמל ותקשורת',
    materials: [
      line('נקודות חשמל (שקעים, מפסקים, תאורה)', points, 'יח׳', 0),
      line('צינורות שרשור', conduitLen, 'מ׳', 0),
      line('לוח חשמל ראשי', 1, 'יח׳', 0),
    ],
    costILS: roundCost(points * PRICES.electricalPoint + 9000),
    parts,
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, ctx.entrance.floorY + ceilE), polar: 58 },
    view: { xray: true, ghostAbove: ctx.roof.floorY - 0.3 },
  };
}

// ----------------------------------------------------------------- air conditioning
function airConditioning(ctx: BuildContext): StepDef {
  const parts: Part[] = [];
  let ductLen = 0;
  let grilles = 0;
  const SERVED = new Set(['living', 'dining', 'bedroom', 'master', 'family', 'kitchen']);
  let delay = 0;
  for (const lvl of LEVELS) {
    const ceil = ceilingYOf(ctx, lvl);
    const walls = wallsOfLevel(ctx, lvl);
    const halls = ctx.house.rooms.filter((r) => r.level === lvl && r.kind === 'hall');
    if (!halls.length) continue;
    // Main duct per corridor: along the long axis of its bounding box.
    const mains: Array<[Vec2, Vec2]> = halls.map((h) => {
      const b = bbox2(h.polygon);
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[1] + b.max[1]) / 2;
      return b.max[0] - b.min[0] >= b.max[1] - b.min[1]
        ? ([[b.min[0] + 0.15, cz], [b.max[0] - 0.15, cz]] as [Vec2, Vec2])
        : ([[cx, b.min[1] + 0.15], [cx, b.max[1] - 0.15]] as [Vec2, Vec2]);
    });
    const mainBoxes: BoxItem[] = [];
    mains.forEach(([a, b]) => {
      mainBoxes.push(...ductBoxes([a, b], 0.34, 0.24, ceil - 0.15));
      ductLen += dist2(a, b);
    });
    // Fan-coil unit at the start of each main duct.
    const fcu: BoxItem[] = mains.map(([a, b]) => {
      const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
      return { at: [a[0], ceil - 0.15, a[1]], size: alongX ? [0.9, 0.3, 0.5] : [0.5, 0.3, 0.9], rotY: 0 };
    });
    parts.push(
      {
        id: `p9-ac:main-${lvl}`,
        shape: { kind: 'boxes', items: mainBoxes },
        material: 'galvanized',
        tags: ['duct', 'duct-main', `level:${lvl}`],
        anim: { type: 'sequence', delay, stagger: 0.25, duration: 0.5, order: 'x' },
      },
      {
        id: `p9-ac:fcu-${lvl}`,
        shape: { kind: 'boxes', items: fcu },
        material: 'white',
        tags: ['duct', 'duct-fcu', `level:${lvl}`],
        anim: { type: 'drop', from: [0, 0.8, 0], delay, duration: 0.6, ease: 'bounce' },
      },
    );
    // Branches to each served room + grilles.
    const branchBoxes: BoxItem[] = [];
    const grilleBoxes: BoxItem[] = [];
    for (const room of ctx.house.rooms.filter((r) => r.level === lvl && SERVED.has(r.kind))) {
      const T = room.labelAt;
      // Closest point on any main duct.
      let src: Vec2 = mains[0][0];
      let bd = Infinity;
      for (const [a, b] of mains) {
        const t = Math.max(0, Math.min(1, ((T[0] - a[0]) * (b[0] - a[0]) + (T[1] - a[1]) * (b[1] - a[1])) / Math.max(1e-6, (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
        const q = lerp2(a, b, t);
        const d = distanceToSegment(T, a, b);
        if (d < bd) {
          bd = d;
          src = q;
        }
      }
      const route = manhattan(src, T, walls);
      branchBoxes.push(...ductBoxes(route, 0.22, 0.17, ceil - 0.12));
      ductLen += routeLength(route);
      const n = polygonArea(room.polygon) > 18 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const g: Vec2 = i === 0 ? T : [T[0] + 1.4, T[1] + 0.9];
        if (i && !pointInPolygon(g, room.polygon)) continue;
        grilleBoxes.push({ at: [g[0], ceil - 0.012, g[1]], size: [0.6, 0.025, 0.2], rotY: 0 });
        grilles++;
      }
    }
    parts.push(
      {
        id: `p9-ac:branches-${lvl}`,
        shape: { kind: 'boxes', items: branchBoxes },
        material: 'galvanized',
        tags: ['duct', 'duct-branch', `level:${lvl}`],
        anim: { type: 'sequence', delay: delay + 1.0, stagger: 0.12, duration: 0.4, order: 'near', origin: mains[0][0] },
      },
      {
        id: `p9-ac:grilles-${lvl}`,
        shape: { kind: 'boxes', items: grilleBoxes },
        material: 'white',
        tags: ['duct', 'grille', `level:${lvl}`],
        anim: { type: 'grow', delay: delay + 2.0, stagger: 0.15, duration: 0.35, ease: 'back' },
      },
    );
    delay += 2.4;
  }
  const units = Math.max(1, parts.filter((p) => p.id.startsWith('p9-ac:fcu')).length);
  return {
    id: 'p9-ac',
    phase: 9,
    titleHe: 'מיזוג אוויר',
    materials: [
      line('תעלות מיזוג מגולוונות', ductLen, 'מ׳', 0),
      line('מפזרים (גרילים)', grilles, 'יח׳', 0),
      line('יחידות מאייד (פאן-קויל)', units + 1, 'יח׳', 0),
    ],
    costILS: roundCost(units * 3.5 * PRICES.acSystemPerTon + grilles * 350),
    parts,
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, ctx.entrance.floorY + 3.1), polar: 58 },
    view: { xray: true, ghostAbove: ctx.roof.floorY - 0.3 },
  };
}

