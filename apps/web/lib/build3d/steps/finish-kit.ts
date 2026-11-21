/**
 * Shared helpers for the finishing phases (11 finishes, 12 landscaping, 13 handover):
 * opening geometry, wall-face skins, room tiling, fixture transforms, small part builders.
 * Pure (no three.js).
 */
import {
  angleOfDir,
  bbox2,
  clipPolygonToRect,
  dist2,
  distanceToSegment,
  levelOf,
  pointInPolygon,
  polygonArea,
  wallFrame,
  type WallFrame,
} from '../house/geometry';
import type { Fixture, Level, LevelId, Opening, OpeningKind, Room, RoomKind, Vec2, Vec3, Wall } from '../house/types';
import type { Anim, MaterialKey, Part, Shape, TerrainGrid } from '../engine/types';
import type { BuildContext } from './context';

export type BoxItem = { at: Vec3; size: Vec3; rotY?: number; rot?: Vec3 };

/** Storey walls only (no parapets / site walls / fences). */
export const STOREY_ROLES = new Set<Wall['role']>(['exterior', 'interior', 'retaining', 'mamad']);

export const lvlTag = (l: LevelId | 'site') => `level:${l === 'roof' ? 'roof' : l}`;

// ---------------------------------------------------------------------------
// Wall frame helpers
// ---------------------------------------------------------------------------

/**
 * Swing-side normal: n = (-uz, ux) (the convention of Opening.swingSide in types.ts).
 * NOTE: it is the OPPOSITE of wallFrame().normal.
 */
export const swingNormal = (f: WallFrame): Vec2 => [-f.dir[1], f.dir[0]];

/** Point on the wall at distance s from `a`, shifted `n` along the swing-side normal. */
export function wallPt(w: Wall, f: WallFrame, s: number, n = 0): Vec2 {
  const sn = swingNormal(f);
  return [w.a[0] + f.dir[0] * s + sn[0] * n, w.a[1] + f.dir[1] * s + sn[1] * n];
}

/** Box in wall coordinates (s along the wall, n across it, absolute y). */
export function wbox(w: Wall, f: WallFrame, s: number, y0: number, y1: number, along: number, depth: number, n = 0): BoxItem {
  const c = wallPt(w, f, s, n);
  return { at: [c[0], (y0 + y1) / 2, c[1]], size: [along, y1 - y0, depth], rotY: f.rotY };
}

export interface WallInfo {
  wall: Wall;
  f: WallFrame;
  level: Level | undefined;
  floorY: number;
}

export function wallInfos(ctx: BuildContext, filter: (w: Wall) => boolean = (w) => STOREY_ROLES.has(w.role)): WallInfo[] {
  return ctx.house.walls.filter(filter).map((wall) => {
    const level = wall.level === 'site' ? undefined : levelOf(ctx.house, wall.level);
    return { wall, f: wallFrame(wall), level, floorY: level?.floorY ?? 0 };
  });
}

export interface OpeningGeo {
  o: Opening;
  wall: Wall;
  f: WallFrame;
  floorY: number;
  /** Absolute sill / head heights. */
  y0: number;
  y1: number;
  w: number;
  h: number;
  /** Opening center on the wall centerline. */
  c: Vec2;
}

export function openingGeos(ctx: BuildContext, kinds?: OpeningKind[]): OpeningGeo[] {
  const byId = new Map(ctx.house.walls.map((w) => [w.id, w]));
  const out: OpeningGeo[] = [];
  for (const o of ctx.house.openings) {
    if (kinds && !kinds.includes(o.kind)) continue;
    const wall = byId.get(o.wallId);
    if (!wall) continue;
    const f = wallFrame(wall);
    const floorY = levelOf(ctx.house, o.level).floorY;
    const y0 = floorY + o.sill;
    const y1 = Math.min(wall.baseY + wall.height, floorY + o.head);
    out.push({ o, wall, f, floorY, y0, y1, w: o.width, h: y1 - y0, c: wallPt(wall, f, o.offset) });
  }
  return out;
}

export function roomsOf(ctx: BuildContext, level: LevelId, kinds?: RoomKind[], exclude: RoomKind[] = []): Room[] {
  return ctx.house.rooms.filter((r) => r.level === level && (!kinds || kinds.includes(r.kind)) && !exclude.includes(r.kind));
}

/** Side (+1/-1 along the swing normal) whose probe point lies inside a room of one of `kinds`; 0 if none. */
export function sideInRoom(ctx: BuildContext, wall: Wall, f: WallFrame, s: number, kinds: RoomKind[] | null): 0 | 1 | -1 {
  if (wall.level === 'site') return 0;
  const rooms = roomsOf(ctx, wall.level, kinds ?? undefined);
  const probe = wall.thickness / 2 + 0.12;
  const pa = wallPt(wall, f, s, probe);
  const pb = wallPt(wall, f, s, -probe);
  const inA = rooms.some((r) => pointInPolygon(pa, r.polygon));
  const inB = rooms.some((r) => pointInPolygon(pb, r.polygon));
  if (inA && !inB) return 1;
  if (inB && !inA) return -1;
  return 0;
}

/**
 * Runs [s0, s1] along a wall face (side +1/-1) that border a room (not a terrace, shaft or
 * the outside). Sampled every 10 cm, ends of runs snapped to the sample grid.
 */
export function faceRuns(
  ctx: BuildContext,
  wall: Wall,
  f: WallFrame,
  side: 1 | -1,
  kinds: RoomKind[] | null,
  exclude: RoomKind[] = ['terrace'],
  extraPolys: Vec2[][] = [],
): Array<[number, number]> {
  if (wall.level === 'site') return [];
  const polys = [...roomsOf(ctx, wall.level, kinds ?? undefined, exclude).map((r) => r.polygon), ...extraPolys];
  const probe = wall.thickness / 2 + 0.1;
  const step = 0.1;
  const n = Math.max(1, Math.ceil(f.length / step));
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    const s = Math.min(f.length, (i + 0.5) * step);
    const p = wallPt(wall, f, s, side * probe);
    const inside = polys.some((q) => pointInPolygon(p, q));
    if (inside && start < 0) start = i * step;
    if ((!inside || i === n - 1) && start >= 0) {
      const end = inside ? f.length : i * step;
      if (end - start > 0.08) out.push([start, Math.min(end, f.length)]);
      start = -1;
    }
  }
  return out;
}

/** Splits [s0,s1] by the openings of `wall` that intersect the vertical band y0..y1 (returns solid sub-runs). */
export function subtractOpenings(
  geos: OpeningGeo[],
  wall: Wall,
  run: [number, number],
  y0: number,
  y1: number,
): Array<[number, number]> {
  const cuts = geos
    .filter((g) => g.wall.id === wall.id && g.y0 < y1 - 0.02 && g.y1 > y0 + 0.02)
    .map((g) => [g.o.offset - g.w / 2, g.o.offset + g.w / 2] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let s = run[0];
  for (const c of cuts) {
    if (c[1] <= s) continue;
    if (c[0] >= run[1]) break;
    if (c[0] > s + 0.02) out.push([s, Math.min(c[0], run[1])]);
    s = Math.max(s, c[1]);
  }
  if (run[1] > s + 0.02) out.push([s, run[1]]);
  return out;
}

/** True if p is next to / inside a window or glazed opening of the same level (cabinets must skip it). */
export function nearWindow(geos: OpeningGeo[], level: LevelId, p: Vec2, margin = 0.12): boolean {
  for (const g of geos) {
    if (g.o.level !== level || g.o.kind === 'door' || g.o.kind === 'opening') continue;
    if (g.y0 > 2.0) continue;
    const dx = p[0] - g.c[0];
    const dz = p[1] - g.c[1];
    const along = dx * g.f.dir[0] + dz * g.f.dir[1];
    const across = -dx * g.f.dir[1] + dz * g.f.dir[0];
    if (Math.abs(along) < g.w / 2 + margin && Math.abs(across) < g.wall.thickness / 2 + 0.7) return true;
  }
  return false;
}

/** Distance from p to the nearest storey wall face of a level. */
export function distToWall(ctx: BuildContext, level: LevelId, p: Vec2): number {
  let d = Infinity;
  for (const w of ctx.house.walls) {
    if (w.level !== level || !STOREY_ROLES.has(w.role)) continue;
    d = Math.min(d, distanceToSegment(p, w.a, w.b) - w.thickness / 2);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Tiling
// ---------------------------------------------------------------------------

export interface TileOpts {
  /** Grout / board gap (m) subtracted from the tile size. */
  gap?: number;
  /** Running-bond shift per row as a fraction of the tile length (0 = stack bond). */
  bond?: number;
  /** Random per-row shift (parquet). */
  random?: (() => number) | null;
  /** Skip pieces smaller than this (m). */
  minPiece?: number;
  /** Anchor the grid here instead of the polygon bbox corner. */
  anchor?: Vec2;
}

export interface TilePiece {
  at: Vec2;
  size: Vec2;
  /** Row / column index (for checkerboards). */
  i: number;
  j: number;
}

/** Tiles a polygon with axis-aligned pieces (rows along X). Edge tiles are cut to the outline. */
export function tilePolygon(poly: Vec2[], tile: Vec2, opts: TileOpts = {}): TilePiece[] {
  const { gap = 0.006, bond = 0.5, random = null, minPiece = 0.04 } = opts;
  const b = bbox2(poly);
  const ax = opts.anchor ?? b.min;
  const out: TilePiece[] = [];
  const rows = Math.ceil((b.max[1] - ax[1]) / tile[1]);
  for (let j = 0; j < rows; j++) {
    const z0 = ax[1] + j * tile[1];
    const z1 = z0 + tile[1];
    const shift = random ? random() * tile[0] : (j % 2) * bond * tile[0];
    const cols = Math.ceil((b.max[0] - ax[0] + tile[0]) / tile[0]) + 1;
    for (let i = -1; i < cols; i++) {
      const x0 = ax[0] + i * tile[0] - shift;
      const x1 = x0 + tile[0];
      if (x1 < b.min[0] || x0 > b.max[0]) continue;
      const clip = clipPolygonToRect(poly, [x0, z0], [x1, z1]);
      if (clip.length < 3) continue;
      const cb = bbox2(clip);
      const w = cb.max[0] - cb.min[0];
      const d = cb.max[1] - cb.min[1];
      if (w < minPiece || d < minPiece) continue;
      out.push({
        at: [(cb.min[0] + cb.max[0]) / 2, (cb.min[1] + cb.max[1]) / 2],
        size: [Math.max(0.01, w - gap), Math.max(0.01, d - gap)],
        i,
        j,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** World position of a point given in fixture-local (x = width axis, z = front axis) coordinates. */
export function fixturePt(f: Fixture, lx: number, lz: number): Vec2 {
  const c = Math.cos(f.rotation);
  const s = Math.sin(f.rotation);
  return [f.center[0] + lx * c + lz * s, f.center[1] - lx * s + lz * c];
}

export function fixtureY(ctx: BuildContext, f: Fixture): number {
  if (f.y !== undefined) return f.y;
  if (f.level === 'site') return 0;
  return levelOf(ctx.house, f.level).floorY;
}

/**
 * Model part for a fixture. Models face +X with their length along Z, fixtures face +Z with their
 * width along X, so the model is rotated by rotation - 90 degrees and sized [depth, natural, width].
 */
export function fixtureModel(
  ctx: BuildContext,
  f: Fixture,
  name: Extract<Shape, { kind: 'model' }>['name'],
  id: string,
  extra: Partial<Part> = {},
  opts: { height?: number; yOffset?: number; square?: number } = {},
): Part {
  const y = fixtureY(ctx, f) + (opts.yOffset ?? 0);
  const size: Vec3 = opts.square ? [opts.square, opts.height ?? 0, opts.square] : [f.size[1], opts.height ?? 0, f.size[0]];
  return {
    id,
    shape: { kind: 'model', name, size },
    material: 'white',
    position: [f.center[0], y, f.center[1]],
    rotationY: f.rotation - Math.PI / 2,
    tags: ['model', lvlTag(f.level), ...(extra.tags ?? [])],
    ...extra,
  } as Part;
}

// ---------------------------------------------------------------------------
// Part builders
// ---------------------------------------------------------------------------

export function boxesPart(
  id: string,
  items: BoxItem[],
  material: MaterialKey,
  tags: string[],
  anim?: Anim | Part['anim'],
  extra: Partial<Part> = {},
): Part {
  return { id, shape: { kind: 'boxes', items }, material, tags, anim, ...extra } as Part;
}

/** Instance stagger so a part of n items finishes in ~`total` seconds. */
export const stagger = (n: number, total = 3.2, max = 0.14) => Math.min(max, total / Math.max(1, n));

/** Camera bounds of the whole house between two heights. */
export function houseBounds(ctx: BuildContext, yMin: number, yMax: number, grow = 1.2): { min: Vec3; max: Vec3 } {
  const b = bbox2(ctx.footprint.house);
  return { min: [b.min[0] - grow, yMin, b.min[1] - grow], max: [b.max[0] + grow, yMax, b.max[1] + grow] };
}

export function polyBounds(poly: Vec2[], yMin: number, yMax: number, grow = 0.5): { min: Vec3; max: Vec3 } {
  const b = bbox2(poly);
  return { min: [b.min[0] - grow, yMin, b.min[1] - grow], max: [b.max[0] + grow, yMax, b.max[1] + grow] };
}

export function sum<T>(xs: T[], f: (x: T) => number): number {
  return xs.reduce((s, x) => s + f(x), 0);
}

export const areaOf = (rooms: Room[]) => sum(rooms, (r) => polygonArea(r.polygon));

/** Finished ground height at p (default the finished grid). */
export function groundAt(ctx: BuildContext, p: Vec2, grid: TerrainGrid = ctx.terrain.finished): number {
  return ctx.heightAt(p[0], p[1], grid);
}

export { angleOfDir, dist2 };
