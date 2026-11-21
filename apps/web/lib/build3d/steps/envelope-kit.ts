/**
 * Shared helpers for the envelope & systems phases (7 masonry, 8 roof, 9 systems,
 * 10 plaster & cladding): block laying with running bond, lintel rectangles, wall
 * skins (plaster / stone), nearest-wall lookup, Manhattan routing, roof cell grid
 * with a slope toward drains. Pure (no three.js).
 */
import {
  bbox2,
  clipPolygonToRect,
  dist2,
  distanceToSegment,
  lerp2,
  offsetPolygon,
  pieceBox,
  pointInPolygon,
  polygonArea,
  rng,
  wallFrame,
  wallPieces,
  wallPoint,
  type WallPiece,
} from '../house/geometry';
import type { Opening, Vec2, Vec3, Wall } from '../house/types';
import type { BuildContext } from './context';

export type Lvl = 'lower' | 'entrance';
export interface BoxItem {
  at: Vec3;
  size: Vec3;
  rotY: number;
}
export interface Rect {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

export const floorYOf = (ctx: BuildContext, lvl: Lvl) => (lvl === 'lower' ? ctx.lower.floorY : ctx.entrance.floorY);
/** Underside of the slab above a level (m rel. ±0.00). */
export const ceilingYOf = (ctx: BuildContext, lvl: Lvl) => floorYOf(ctx, lvl) + (lvl === 'lower' ? ctx.lower.ceilingHeight : ctx.entrance.ceilingHeight);
export const wallsOfLevel = (ctx: BuildContext, lvl: Lvl | 'roof') => ctx.house.walls.filter((w) => w.level === lvl);
export const opsOfWall = (ctx: BuildContext, w: Wall) => ctx.house.openings.filter((o) => o.wallId === w.id);
export const levelFloor = (ctx: BuildContext, lvl: Wall['level']) => (lvl === 'lower' ? ctx.lower.floorY : lvl === 'entrance' ? ctx.entrance.floorY : ctx.roof.floorY);
export const levelTag = (lvl: string) => `level:${lvl}`;

// ---------------------------------------------------------------------------
// Rect arithmetic in wall coordinates
// ---------------------------------------------------------------------------

export function subtractRect(r: Rect, ex: Rect): Rect[] {
  if (ex.s0 >= r.s1 || ex.s1 <= r.s0 || ex.y0 >= r.y1 || ex.y1 <= r.y0) return [r];
  const out: Rect[] = [];
  if (ex.y0 > r.y0) out.push({ s0: r.s0, s1: r.s1, y0: r.y0, y1: ex.y0 });
  if (ex.y1 < r.y1) out.push({ s0: r.s0, s1: r.s1, y0: ex.y1, y1: r.y1 });
  const ya = Math.max(r.y0, ex.y0);
  const yb = Math.min(r.y1, ex.y1);
  if (ex.s0 > r.s0) out.push({ s0: r.s0, s1: ex.s0, y0: ya, y1: yb });
  if (ex.s1 < r.s1) out.push({ s0: ex.s1, s1: r.s1, y0: ya, y1: yb });
  return out;
}

export function subtractAll(r: Rect, exs: Rect[]): Rect[] {
  let cur = [r];
  for (const ex of exs) cur = cur.flatMap((c) => subtractRect(c, ex));
  return cur;
}

export const rectBox = (wall: Wall, r: Rect, extraT = 0) => pieceBox(wall, r as WallPiece, extraT);

// ---------------------------------------------------------------------------
// Lintels + block laying
// ---------------------------------------------------------------------------

export const LINTEL_H = 0.2;
export const LINTEL_BEARING = 0.2;
export const BLOCK_L = 0.4;
export const BLOCK_H = 0.2;
const GAP = 0.006;

/** Lintel rectangles (bearing 20 cm each side) over every opening of a wall. */
export function lintelRects(wall: Wall, ops: Opening[], floorY: number): Rect[] {
  const L = wallFrame(wall).length;
  const top = wall.baseY + wall.height;
  return ops
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      s0: Math.max(0, o.offset - o.width / 2 - LINTEL_BEARING),
      s1: Math.min(L, o.offset + o.width / 2 + LINTEL_BEARING),
      y0: floorY + o.head,
      y1: Math.min(top, floorY + o.head + LINTEL_H),
    }))
    .filter((r) => r.y1 - r.y0 > 0.04 && r.s1 - r.s0 > 0.1);
}

export interface BlockLayout {
  items: BoxItem[];
  /** Face area of the wall actually laid (m²). */
  area: number;
  courses: number;
}

/**
 * Lays blocks (0.4 × 0.2 face, running bond) on a wall. Openings stay open; with
 * `leaveLintels` the zones over openings are left empty for the concrete lintels
 * (blocks next to them are cut around the lintel). `trim` removes wall-length
 * intervals owned by another wall (corner overlaps).
 */
export function layBlocks(wall: Wall, ops: Opening[], floorY: number, opts: { leaveLintels?: boolean; trim?: Array<[number, number]> } = {}): BlockLayout {
  const frame = wallFrame(wall);
  const lintels = opts.leaveLintels ? lintelRects(wall, ops, floorY) : [];
  const trims: Rect[] = (opts.trim ?? []).map(([s0, s1]) => ({ s0, s1, y0: -1e9, y1: 1e9 }));
  const items: BoxItem[] = [];
  let area = 0;
  let courses = 0;
  const top = wall.baseY + wall.height;
  for (const piece of wallPieces(wall, ops, floorY)) {
    const isHead = piece.y0 > wall.baseY + 0.01;
    // Courses over an opening start on top of its lintel.
    const anchor = isHead && opts.leaveLintels ? piece.y0 + LINTEL_H : piece.y0;
    for (let k = 0; anchor + BLOCK_H * k < piece.y1 - 0.03; k++) {
      const y0 = anchor + BLOCK_H * k;
      const y1 = Math.min(y0 + BLOCK_H, piece.y1, top);
      if (y1 - y0 < 0.04) continue;
      courses = Math.max(courses, k + 1);
      const off = k % 2 ? BLOCK_L / 2 : 0;
      const edges: number[] = [piece.s0];
      for (let e = piece.s0 + off; e < piece.s1 - 0.02; e += BLOCK_L) if (e > piece.s0 + 0.03) edges.push(e);
      edges.push(piece.s1);
      for (let i = 0; i < edges.length - 1; i++) {
        const base: Rect = { s0: edges[i], s1: edges[i + 1], y0, y1 };
        if (base.s1 - base.s0 < 0.03) continue;
        for (const r of subtractAll(base, [...lintels, ...trims])) {
          if (r.s1 - r.s0 < 0.03 || r.y1 - r.y0 < 0.03) continue;
          const b = rectBox(wall, { s0: r.s0 + GAP / 2, s1: r.s1 - GAP / 2, y0: r.y0 + GAP / 2, y1: r.y1 - GAP / 2 });
          items.push({ at: b.at, size: b.size, rotY: frame.rotY });
          area += (r.s1 - r.s0) * (r.y1 - r.y0);
        }
      }
    }
  }
  return { items, area, courses };
}

/** s-intervals of a wall footprint already owned by earlier walls (L-corners that overlap). */
export function cornerCuts(wall: Wall, earlier: Wall[]): Array<[number, number]> {
  const f = wallFrame(wall);
  const half = wall.thickness / 2;
  const out: Array<[number, number]> = [];
  const rectOf = (w: Wall) => {
    const h = w.thickness / 2;
    const fx = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]);
    return fx
      ? { x0: Math.min(w.a[0], w.b[0]), x1: Math.max(w.a[0], w.b[0]), z0: Math.min(w.a[1], w.b[1]) - h, z1: Math.max(w.a[1], w.b[1]) + h }
      : { x0: Math.min(w.a[0], w.b[0]) - h, x1: Math.max(w.a[0], w.b[0]) + h, z0: Math.min(w.a[1], w.b[1]), z1: Math.max(w.a[1], w.b[1]) };
  };
  const me = rectOf(wall);
  for (const o of earlier) {
    if (o.level !== wall.level) continue;
    const r = rectOf(o);
    const ox0 = Math.max(me.x0, r.x0);
    const ox1 = Math.min(me.x1, r.x1);
    const oz0 = Math.max(me.z0, r.z0);
    const oz1 = Math.min(me.z1, r.z1);
    if (ox1 - ox0 < 0.02 || oz1 - oz0 < 0.02) continue;
    // Project the overlap onto the wall axis.
    const sa = (ox0 - wall.a[0]) * f.dir[0] + (oz0 - wall.a[1]) * f.dir[1];
    const sb = (ox1 - wall.a[0]) * f.dir[0] + (oz1 - wall.a[1]) * f.dir[1];
    const s0 = Math.min(sa, sb);
    const s1 = Math.max(sa, sb);
    // Only cut overlaps at the ends; the wall keeps its own body.
    if (s1 - s0 < wall.thickness + 0.05 && (s0 < half + 0.05 || s1 > f.length - half - 0.05)) out.push([Math.max(0, s0), Math.min(f.length, s1)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wall skins (plaster / stone / paint)
// ---------------------------------------------------------------------------

export type Face = 1 | -1;

/** Unit normal pointing out of the given face of a wall. */
export function faceNormal(wall: Wall, face: Face): Vec2 {
  const n = wallFrame(wall).normal;
  return [n[0] * face, n[1] * face];
}

/** True if the point 25 cm beyond a face of the wall lies inside the given outline. */
export function faceInside(wall: Wall, face: Face, outline: Vec2[]): boolean {
  const n = faceNormal(wall, face);
  const m = wallFrame(wall).mid;
  const p: Vec2 = [m[0] + n[0] * (wall.thickness / 2 + 0.25), m[1] + n[1] * (wall.thickness / 2 + 0.25)];
  return pointInPolygon(p, outline);
}

export interface SkinOpts {
  thickness: number;
  /** How much of the skin sinks into the wall (avoids coplanar faces). */
  embed?: number;
  yMin?: number;
  yMax?: number;
  /** Stop short of the piece ends (keeps reveals clean). */
  endGap?: number;
}

/** Thin boxes covering one face of a wall, one per solid wall piece (openings stay open). */
export function skinBoxes(wall: Wall, ops: Opening[], floorY: number, face: Face, o: SkinOpts): BoxItem[] {
  const f = wallFrame(wall);
  const embed = o.embed ?? 0.01;
  const gap = o.endGap ?? 0.004;
  const out: BoxItem[] = [];
  for (const p of wallPieces(wall, ops, floorY)) {
    const y0 = Math.max(p.y0, o.yMin ?? -1e9) + 0.003;
    const y1 = Math.min(p.y1, o.yMax ?? 1e9) - 0.004;
    const s0 = p.s0 + gap;
    const s1 = p.s1 - gap;
    if (y1 - y0 < 0.03 || s1 - s0 < 0.03) continue;
    const c = wallPoint(wall, (s0 + s1) / 2, face * (wall.thickness / 2 + o.thickness / 2 - embed));
    out.push({ at: [c[0], (y0 + y1) / 2, c[1]], size: [s1 - s0, y1 - y0, o.thickness], rotY: f.rotY });
  }
  return out;
}

export const boxesArea = (items: BoxItem[]) => items.reduce((s, b) => s + b.size[0] * b.size[1], 0);

/**
 * Jerusalem-stone cladding stones for one face: coursed (varying heights 12–24 cm),
 * random lengths 25–55 cm, 8 mm joints. Returns stones split into `variants`
 * groups for slight color variation.
 */
export function stoneBoxes(wall: Wall, ops: Opening[], floorY: number, face: Face, seed: number, variants: number, yMin: number, yMax: number): BoxItem[][] {
  const f = wallFrame(wall);
  const rand = rng(seed);
  const groups: BoxItem[][] = Array.from({ length: variants }, () => []);
  const T = 0.04;
  const joint = 0.008;
  const heights = [0.14, 0.2, 0.17, 0.24, 0.14, 0.2];
  const pieces = wallPieces(wall, ops, floorY);
  // Courses are global per wall so stones line up across pieces.
  let y = Math.max(wall.baseY, yMin);
  const rows: Array<[number, number]> = [];
  let hi = Math.floor(rand() * heights.length);
  while (y < Math.min(wall.baseY + wall.height, yMax) - 0.03) {
    const h = heights[hi++ % heights.length];
    rows.push([y, Math.min(y + h, wall.baseY + wall.height, yMax)]);
    y += h;
  }
  for (const [ry0, ry1] of rows) {
    for (const p of pieces) {
      const a = Math.max(p.y0, ry0);
      const b = Math.min(p.y1, ry1);
      if (b - a < 0.04) continue;
      let s = p.s0 + 0.004;
      while (s < p.s1 - 0.03) {
        const len = Math.min(0.25 + rand() * 0.3, p.s1 - 0.004 - s);
        const s1 = len < 0.12 ? p.s1 - 0.004 : s + len;
        const c = wallPoint(wall, (s + s1 - joint) / 2, face * (wall.thickness / 2 + T / 2 - 0.004));
        groups[Math.floor(rand() * variants)].push({
          at: [c[0], (a + b) / 2, c[1]],
          size: [s1 - s - joint, b - a - joint, T],
          rotY: f.rotY,
        });
        s = s1;
      }
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Nearest wall + routing
// ---------------------------------------------------------------------------

export interface WallHit {
  wall: Wall;
  /** Distance along the wall from a. */
  s: number;
  foot: Vec2;
  /** Side of the wall the query point is on. */
  side: Face;
  dist: number;
  /** Direction along the wall and outward face normal on `side`. */
  dir: Vec2;
  out: Vec2;
}

export function nearestWall(walls: Wall[], p: Vec2, minLen = 0.3): WallHit {
  let best: WallHit | null = null;
  for (const w of walls) {
    const f = wallFrame(w);
    if (f.length < minLen) continue;
    const t = Math.max(0, Math.min(f.length, (p[0] - w.a[0]) * f.dir[0] + (p[1] - w.a[1]) * f.dir[1]));
    const foot: Vec2 = [w.a[0] + f.dir[0] * t, w.a[1] + f.dir[1] * t];
    const d = dist2(foot, p);
    if (best && d >= best.dist) continue;
    const side: Face = (p[0] - foot[0]) * f.normal[0] + (p[1] - foot[1]) * f.normal[1] >= 0 ? 1 : -1;
    best = { wall: w, s: t, foot, side, dist: d, dir: f.dir, out: [f.normal[0] * side, f.normal[1] * side] };
  }
  if (!best) throw new Error('no walls');
  return best;
}

/** Point on the visible surface of the wall hit, `off` meters proud of the face. */
export function surfacePoint(h: WallHit, off: number, along = 0): Vec2 {
  const d = h.wall.thickness / 2 + off;
  return [h.foot[0] + h.out[0] * d + h.dir[0] * along, h.foot[1] + h.out[1] * d + h.dir[1] * along];
}

const segCross = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
  const r: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const s: Vec2 = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return false;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 0.02 && t < 0.98 && u > 0 && u < 1;
};

/** L-shaped route a → b choosing the leg order that crosses fewer walls. */
export function manhattan(a: Vec2, b: Vec2, walls: Wall[]): Vec2[] {
  if (Math.abs(a[0] - b[0]) < 0.02 || Math.abs(a[1] - b[1]) < 0.02) return [a, b];
  const c1: Vec2 = [b[0], a[1]];
  const c2: Vec2 = [a[0], b[1]];
  const cost = (c: Vec2) => walls.reduce((n, w) => n + (segCross(a, c, w.a, w.b) ? 1 : 0) + (segCross(c, b, w.a, w.b) ? 1 : 0), 0);
  return cost(c1) <= cost(c2) ? [a, c1, b] : [a, c2, b];
}

export const routeLength = (pts: Vec2[]) => pts.reduce((s, p, i) => (i ? s + dist2(pts[i - 1], p) : 0), 0);

/** Lifts a plan route to 3D at a constant height. */
export const lift = (pts: Vec2[], y: number): Vec3[] => pts.map((p) => [p[0], y, p[1]] as Vec3);

/** Box items for a rectangular duct following a plan route (legs extended by half width at bends). */
export function ductBoxes(route: Vec2[], w: number, h: number, yMid: number): BoxItem[] {
  const out: BoxItem[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const len = dist2(a, b);
    if (len < 0.05) continue;
    const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
    const ext = i > 0 ? w / 2 : 0;
    const ext2 = i < route.length - 2 ? w / 2 : 0;
    const c = lerp2(a, b, 0.5);
    const shift = (ext2 - ext) / 2;
    const cx = c[0] + (alongX ? Math.sign(b[0] - a[0]) * shift : 0);
    const cz = c[1] + (alongX ? 0 : Math.sign(b[1] - a[1]) * shift);
    out.push({ at: [cx, yMid, cz], size: alongX ? [len + ext + ext2, h, w] : [w, h, len + ext + ext2], rotY: 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Room perimeter helpers
// ---------------------------------------------------------------------------

/** Points on a room's walls (polygon = inner faces) every `step` m, with edge direction and inward normal. */
export function ringSamples(poly: Vec2[], step: number, start = 0.45): Array<{ p: Vec2; dir: Vec2; inward: Vec2; edge: number; len: number; t: number }> {
  const out: Array<{ p: Vec2; dir: Vec2; inward: Vec2; edge: number; len: number; t: number }> = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const len = dist2(a, b);
    if (len < 0.9) continue;
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let inward: Vec2 = [dir[1], -dir[0]];
    const mid = lerp2(a, b, 0.5);
    if (!pointInPolygon([mid[0] + inward[0] * 0.1, mid[1] + inward[1] * 0.1], poly)) inward = [-inward[0], -inward[1]];
    const count = Math.max(1, Math.round((len - 2 * start) / step) + 1);
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? len / 2 : start + ((len - 2 * start) * k) / (count - 1);
      out.push({ p: [a[0] + dir[0] * t, a[1] + dir[1] * t], dir, inward, edge: i, len, t });
    }
  }
  return out;
}

export const insetRing = (poly: Vec2[], d: number) => offsetPolygon(poly, -d);

/** Is a point (m from any opening of this level's walls)? Used to keep boxes off door gaps. */
export function nearOpening(ctx: BuildContext, p: Vec2, lvl: Lvl, r: number): boolean {
  for (const o of ctx.house.openings) {
    if (o.level !== lvl) continue;
    const w = ctx.house.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const c = wallPoint(w, o.offset);
    const f = wallFrame(w);
    const along = Math.abs((p[0] - c[0]) * f.dir[0] + (p[1] - c[1]) * f.dir[1]);
    const across = Math.abs((p[0] - c[0]) * f.normal[0] + (p[1] - c[1]) * f.normal[1]);
    if (along < o.width / 2 + r && across < w.thickness / 2 + 0.3) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Roof: cell grid with a slope toward drains
// ---------------------------------------------------------------------------

export interface RoofCell {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Top of the slope screed at the cell center (m). */
  top: number;
}

export const SCREED_MIN = 0.04;
export const ROOF_FALL = 0.03;
export const INSUL_T = 0.06;
export const MEMBRANE_T = 0.012;
export const COAT_T = 0.016;

export interface RoofModel {
  slabTop: number;
  outline: Vec2[];
  /** Roof area inside the parapets. */
  inner: Vec2[];
  drains: Vec2[];
  cells: RoofCell[];
  area: number;
  /** Top of the slope screed at (x, z). */
  screedTop(x: number, z: number): number;
  /** Top of the finished roof (membrane / white coat) at (x, z). */
  surface(x: number, z: number): number;
}

const roofCache = new WeakMap<BuildContext, RoofModel>();

export function roofModel(ctx: BuildContext): RoofModel {
  const hit = roofCache.get(ctx);
  if (hit) return hit;
  const slab = ctx.house.slabs.find((s) => s.role === 'roof') ?? ctx.house.slabs[0];
  const outline = slab.outline;
  const slabTop = slab.topY;
  const inner = offsetPolygon(outline, -0.2);
  const wanted: Vec2[] = [
    [1.0, 4.5],
    [1.0, 12.8],
    [9.9, 7.2],
    [8.4, 14.6],
  ];
  const drains = wanted.map((w) => {
    if (pointInPolygon(w, inner)) return w;
    // Nearest point on the inner ring if the wish lands outside.
    let best = inner[0];
    let bd = Infinity;
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i];
      const b = inner[(i + 1) % inner.length];
      const d = distanceToSegment(w, a, b);
      if (d < bd) {
        bd = d;
        best = lerp2(a, b, 0.5);
      }
    }
    return best;
  });
  const dmin = (x: number, z: number) => drains.reduce((m, d) => Math.min(m, Math.hypot(x - d[0], z - d[1])), Infinity);
  const screedTop = (x: number, z: number) => slabTop + SCREED_MIN + ROOF_FALL * dmin(x, z);
  const surface = (x: number, z: number) => screedTop(x, z) + INSUL_T + MEMBRANE_T + COAT_T;

  const bb = bbox2(inner);
  const C = 0.4;
  const cells: RoofCell[] = [];
  for (let x = bb.min[0]; x < bb.max[0]; x += C) {
    for (let z = bb.min[1]; z < bb.max[1]; z += C) {
      const clip = clipPolygonToRect(inner, [x, z], [x + C, z + C]);
      if (clip.length < 3 || polygonArea(clip) < 0.01) continue;
      const b = bbox2(clip);
      if (b.max[0] - b.min[0] < 0.03 || b.max[1] - b.min[1] < 0.03) continue;
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[1] + b.max[1]) / 2;
      cells.push({ x0: b.min[0], x1: b.max[0], z0: b.min[1], z1: b.max[1], top: screedTop(cx, cz) });
    }
  }
  const model: RoofModel = { slabTop, outline, inner, drains, cells, area: polygonArea(inner), screedTop, surface };
  roofCache.set(ctx, model);
  return model;
}

