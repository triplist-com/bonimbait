/**
 * Structure kit (phases 4–6, author A): exact rectilinear regions (walls, slabs, decks),
 * wall formwork, two-layer wall meshes, column cages/forms, slab rebar grids, props +
 * H20 beam fields, pour tiles that sweep from the pump hose, and pump-truck placement.
 * Pure geometry (no three.js); every repeated item is returned as instanced items.
 */
import {
  add2,
  angleOfDir,
  dist2,
  distanceOutside,
  distanceToSegment,
  mapGrid,
  pointInPolygon,
  polygonSignedArea,
  sampleGrid,
  scale2,
  sub2,
  wallFrame,
  wallPieces,
} from '../house/geometry';
import type { Column, Opening, Slab, TerrainGrid, Wall } from '../house/types';
import type { Anim, CameraHint, MaterialKey, Part, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { rebarKg } from './kit';
import { siteLayout } from './p01-site';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Plywood face thickness (m). */
export const PLY = 0.021;
/** Gap between neighbouring panels/sheets so joints read as lines. */
export const JOINT = 0.004;
/** Concrete cover to bar centerlines (m). */
export const COVER = 0.045;
/** H20 timber formwork beam (width × height). */
export const H20: Vec2 = [0.08, 0.2];

/** Extra 2026 rates this phase needs that the content price book does not list (ILS, ex-VAT). */
export const STRUCT_RATES = {
  backfillM3: 75, // selected fill, placed and compacted in layers
  drainPipeM: 95, // perforated drain pipe in a gravel bed + filter fabric
  polySheetM2: 7, // 0.3 mm polyethylene sheet with laps
  voidFormerM2: 60, // cardboard/EPS void formers ("ארגזי קלקר")
  trowelM2: 14, // power-trowel finish
  curingLump: 1800, // a week of wetting + hoses + sprinklers
  ceilingBox: 45, // ceiling box + conduit share, per point
  sleeve: 120, // plumbing sleeve through a slab/wall
  mamadFrames: 3500, // blast door/window steel frames + vent sleeves (set in the wall)
} as const;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export type BoxItem = { at: Vec3; size: Vec3; rotY?: number };
export type RodItem = { a: Vec3; b: Vec3; r?: number };

export const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
  [Math.min(x0, x1), Math.min(z0, z1)],
  [Math.max(x0, x1), Math.min(z0, z1)],
  [Math.max(x0, x1), Math.max(z0, z1)],
  [Math.min(x0, x1), Math.max(z0, z1)],
];

/** Corners of a wall-like box (centerline a→b, thickness t), grown by `grow` on every side. */
export function wallRect(w: { a: Vec2; b: Vec2; thickness: number }, grow = 0, s0 = 0, s1?: number): Vec2[] {
  const f = wallFrame(w);
  const e = s1 ?? f.length;
  const h = w.thickness / 2 + grow;
  const p = (s: number, n: number): Vec2 => [w.a[0] + f.dir[0] * s + f.normal[0] * n, w.a[1] + f.dir[1] * s + f.normal[1] * n];
  return [p(s0 - grow, -h), p(e + grow, -h), p(e + grow, h), p(s0 - grow, h)];
}

/** Corners of a column footprint (rotation about +Y like the house model). */
export function columnRect(c: Column, grow = 0): Vec2[] {
  const hx = c.size[0] / 2 + grow;
  const hz = c.size[1] / 2 + grow;
  const r = c.rotation ?? 0;
  const cs = Math.cos(r);
  const sn = Math.sin(r);
  return (
    [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ] as Vec2[]
  ).map(([x, z]) => [c.center[0] + x * cs + z * sn, c.center[1] - x * sn + z * cs] as Vec2);
}

export const boxVolume = (items: BoxItem[]) => items.reduce((s, b) => s + b.size[0] * b.size[1] * b.size[2], 0);
export const rodLength = (items: RodItem[]) =>
  items.reduce((s, r) => s + Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]), 0);

/** A box between two XZ points (along its length), y0..y1, `w` wide. */
export function boxAlong(p0: Vec2, p1: Vec2, w: number, y0: number, y1: number): BoxItem {
  const d = sub2(p1, p0);
  const L = Math.hypot(d[0], d[1]);
  return {
    at: [(p0[0] + p1[0]) / 2, (y0 + y1) / 2, (p0[1] + p1[1]) / 2],
    size: [Math.max(1e-3, L), Math.max(1e-3, y1 - y0), w],
    rotY: angleOfDir(L > 1e-9 ? [d[0] / L, d[1] / L] : [1, 0]),
  };
}

/** Even division of [s0, s1] into pieces no longer than `max`. */
export function divide(s0: number, s1: number, max: number): number[] {
  const n = Math.max(1, Math.ceil((s1 - s0) / max - 1e-6));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(s0 + ((s1 - s0) * i) / n);
  return out;
}

/** Positions from s0 to s1 at ≤ `spacing`, ends included (inset by `inset`). */
export function spaced(s0: number, s1: number, spacing: number, inset = 0): number[] {
  const a = s0 + inset;
  const b = s1 - inset;
  if (b - a < 1e-6) return [(s0 + s1) / 2];
  return divide(a, b, spacing);
}

/** Bounds helper for camera hints. */
export function boundsOf(points: Vec2[], y0: number, y1: number, grow = 1): CameraHint['bounds'] {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p[0]);
    z0 = Math.min(z0, p[1]);
    x1 = Math.max(x1, p[0]);
    z1 = Math.max(z1, p[1]);
  }
  return { min: [x0 - grow, y0, z0 - grow], max: [x1 + grow, y1, z1 + grow] };
}

/** Stagger so N items finish within `total` seconds. */
export const fit = (total: number, n: number, max = 0.25) => Math.min(max, total / Math.max(1, n));

// ---------------------------------------------------------------------------
// Rectilinear region (exact, coordinate-compressed)
// ---------------------------------------------------------------------------

export interface FaceEdge {
  /** Start / end (XZ). The solid is on the side opposite to `n`. */
  a: Vec2;
  b: Vec2;
  /** Unit direction a → b. */
  u: Vec2;
  /** Outward unit normal (away from the solid). */
  n: Vec2;
  len: number;
  /** Corner type at a / b (true = convex, i.e. the solid stops there). */
  convexA: boolean;
  convexB: boolean;
}

export interface Rect2 {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

function uniq(vals: number[], tol = 1e-4): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

const lowerIndex = (arr: number[], v: number) => {
  let lo = 0;
  let hi = arr.length - 2;
  if (v < arr[0] || v > arr[arr.length - 1]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/**
 * Union of `add` polygons minus `sub` polygons, rasterized EXACTLY on the grid of
 * their own vertex coordinates (axis-aligned shapes come out exact; others are
 * stair-stepped at their vertex lines). Used for walls, slabs and decks.
 */
export class Region {
  readonly xs: number[];
  readonly zs: number[];
  readonly nx: number;
  readonly nz: number;
  private cell: Uint8Array;

  private constructor(xs: number[], zs: number[], cell: Uint8Array) {
    this.xs = xs;
    this.zs = zs;
    this.nx = xs.length - 1;
    this.nz = zs.length - 1;
    this.cell = cell;
  }

  static of(add: Vec2[][], sub: Vec2[][] = [], extraX: number[] = [], extraZ: number[] = []): Region {
    const pts = [...add.flat(), ...sub.flat()];
    const xs = uniq([...pts.map((p) => p[0]), ...extraX]);
    const zs = uniq([...pts.map((p) => p[1]), ...extraZ]);
    const nx = Math.max(0, xs.length - 1);
    const nz = Math.max(0, zs.length - 1);
    const cell = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      const z = (zs[j] + zs[j + 1]) / 2;
      for (let i = 0; i < nx; i++) {
        const x = (xs[i] + xs[i + 1]) / 2;
        const p: Vec2 = [x, z];
        if (add.some((poly) => pointInPolygon(p, poly)) && !sub.some((poly) => pointInPolygon(p, poly))) cell[j * nx + i] = 1;
      }
    }
    return new Region(xs, zs, cell);
  }

  /** Same region re-gridded with extra cut lines (for tiling). */
  refined(extraX: number[], extraZ: number[]): Region {
    const xs = uniq([...this.xs, ...extraX.filter((x) => x > this.xs[0] && x < this.xs[this.nx])]);
    const zs = uniq([...this.zs, ...extraZ.filter((z) => z > this.zs[0] && z < this.zs[this.nz])]);
    const cell = new Uint8Array((xs.length - 1) * (zs.length - 1));
    for (let j = 0; j < zs.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++)
        if (this.contains([(xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2])) cell[j * (xs.length - 1) + i] = 1;
    return new Region(xs, zs, cell);
  }

  at(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.cell[j * this.nx + i] === 1;
  }

  contains(p: Vec2): boolean {
    const i = lowerIndex(this.xs, p[0]);
    const j = lowerIndex(this.zs, p[1]);
    return i >= 0 && j >= 0 && this.at(i, j);
  }

  get area(): number {
    let a = 0;
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) if (this.at(i, j)) a += (this.xs[i + 1] - this.xs[i]) * (this.zs[j + 1] - this.zs[j]);
    return a;
  }

  get empty(): boolean {
    return this.cell.every((c) => c === 0);
  }

  /** Inside cells merged into horizontal runs (one rect per run). */
  rects(): Rect2[] {
    const out: Rect2[] = [];
    for (let j = 0; j < this.nz; j++) {
      let i = 0;
      while (i < this.nx) {
        if (!this.at(i, j)) {
          i++;
          continue;
        }
        const i0 = i;
        while (i < this.nx && this.at(i, j)) i++;
        out.push({ x0: this.xs[i0], z0: this.zs[j], x1: this.xs[i], z1: this.zs[j + 1] });
      }
    }
    return out;
  }

  /** Tiles no larger than `size` on a lattice anchored at `origin` (cells cut by the region's own lines). */
  tiles(size: number | Vec2, origin: Vec2 = [0, 0]): Rect2[] {
    const [sx, sz] = typeof size === 'number' ? [size, size] : size;
    const lat = (o: number, s: number, lo: number, hi: number) => {
      const out: number[] = [];
      for (let v = o + Math.ceil((lo - o) / s) * s; v < hi; v += s) out.push(v);
      return out;
    };
    const r = this.refined(lat(origin[0], sx, this.xs[0], this.xs[this.nx]), lat(origin[1], sz, this.zs[0], this.zs[this.nz]));
    const out: Rect2[] = [];
    for (let j = 0; j < r.nz; j++)
      for (let i = 0; i < r.nx; i++) if (r.at(i, j)) out.push({ x0: r.xs[i], z0: r.zs[j], x1: r.xs[i + 1], z1: r.zs[j + 1] });
    return out;
  }

  /** Inside intervals of an axis-aligned line: along X at z = c ('x'), or along Z at x = c ('z'). */
  intervals(axis: 'x' | 'z', c: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    if (axis === 'x') {
      const j = lowerIndex(this.zs, c);
      if (j < 0) return out;
      let i = 0;
      while (i < this.nx) {
        if (!this.at(i, j)) {
          i++;
          continue;
        }
        const i0 = i;
        while (i < this.nx && this.at(i, j)) i++;
        out.push([this.xs[i0], this.xs[i]]);
      }
    } else {
      const i = lowerIndex(this.xs, c);
      if (i < 0) return out;
      let j = 0;
      while (j < this.nz) {
        if (!this.at(i, j)) {
          j++;
          continue;
        }
        const j0 = j;
        while (j < this.nz && this.at(i, j)) j++;
        out.push([this.zs[j0], this.zs[j]]);
      }
    }
    return out;
  }

  /** Boundary faces (merged collinear) with outward normals and corner types. */
  edges(): FaceEdge[] {
    const raw: Array<{ a: Vec2; b: Vec2; n: Vec2 }> = [];
    // Vertical lines x = xs[i]: boundary between cells (i-1, j) and (i, j).
    for (let i = 0; i <= this.nx; i++) {
      let run: { z0: number; z1: number; s: number } | null = null;
      const flush = () => {
        if (!run) return;
        const x = this.xs[i];
        // s = +1: solid on the left (i-1) → normal +X; edge runs u = (n_z, -n_x) = (0, -1).
        if (run.s > 0) raw.push({ a: [x, run.z1], b: [x, run.z0], n: [1, 0] });
        else raw.push({ a: [x, run.z0], b: [x, run.z1], n: [-1, 0] });
        run = null;
      };
      for (let j = 0; j < this.nz; j++) {
        const l = this.at(i - 1, j);
        const r = this.at(i, j);
        const s = l === r ? 0 : l ? 1 : -1;
        if (s !== 0 && run && run.s === s) run.z1 = this.zs[j + 1];
        else {
          flush();
          if (s !== 0) run = { z0: this.zs[j], z1: this.zs[j + 1], s };
        }
      }
      flush();
    }
    for (let j = 0; j <= this.nz; j++) {
      let run: { x0: number; x1: number; s: number } | null = null;
      const flush = () => {
        if (!run) return;
        const z = this.zs[j];
        // s = +1: solid below (j-1) → normal +Z; u = (1, 0).
        if (run.s > 0) raw.push({ a: [run.x0, z], b: [run.x1, z], n: [0, 1] });
        else raw.push({ a: [run.x1, z], b: [run.x0, z], n: [0, -1] });
        run = null;
      };
      for (let i = 0; i < this.nx; i++) {
        const lo = this.at(i, j - 1);
        const hi = this.at(i, j);
        const s = lo === hi ? 0 : lo ? 1 : -1;
        if (s !== 0 && run && run.s === s) run.x1 = this.xs[i + 1];
        else {
          flush();
          if (s !== 0) run = { x0: this.xs[i], x1: this.xs[i + 1], s };
        }
      }
      flush();
    }
    const eps = 1e-3;
    return raw.map(({ a, b, n }) => {
      const len = dist2(a, b);
      const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      // Concave if, just beyond the end on the OUTWARD side, the region is solid.
      const solidBeyond = (p: Vec2, dir: Vec2) => this.contains([p[0] + dir[0] * eps + n[0] * eps, p[1] + dir[1] * eps + n[1] * eps]);
      return {
        a,
        b,
        u,
        n,
        len,
        convexA: !solidBeyond(a, [-u[0], -u[1]]),
        convexB: !solidBeyond(b, u),
      };
    });
  }

  /** Closed rings (outer rings and holes, by winding) for extrusion. */
  shapes(): Array<{ outline: Vec2[]; holes: Vec2[][] }> {
    const edges = this.edges();
    const key = (p: Vec2) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
    const byStart = new Map<string, number[]>();
    edges.forEach((e, i) => {
      const k = key(e.a);
      const l = byStart.get(k);
      if (l) l.push(i);
      else byStart.set(k, [i]);
    });
    const used = new Uint8Array(edges.length);
    const rings: Vec2[][] = [];
    for (let s = 0; s < edges.length; s++) {
      if (used[s]) continue;
      const ring: Vec2[] = [];
      let i = s;
      for (let guard = 0; guard < edges.length + 1; guard++) {
        used[i] = 1;
        ring.push(edges[i].a);
        const next = (byStart.get(key(edges[i].b)) ?? []).find((k) => !used[k]);
        if (next === undefined) break;
        i = next;
      }
      if (ring.length >= 3) rings.push(ring);
    }
    if (!rings.length) return [];
    // Outer rings share the winding of the largest ring.
    const big = rings.reduce((b, r) => (Math.abs(polygonSignedArea(r)) > Math.abs(polygonSignedArea(b)) ? r : b), rings[0]);
    const sign = Math.sign(polygonSignedArea(big));
    const outers = rings.filter((r) => Math.sign(polygonSignedArea(r)) === sign);
    const holes = rings.filter((r) => Math.sign(polygonSignedArea(r)) !== sign);
    return outers.map((o) => ({ outline: o, holes: holes.filter((h) => pointInPolygon(h[0], o) || pointInPolygon(lerpMid(h), o)) }));
  }
}

const lerpMid = (r: Vec2[]): Vec2 => [(r[0][0] + r[1][0]) / 2 + 1e-4, (r[0][1] + r[1][1]) / 2 + 1e-4];

/** Band [d0, d1] outside a face edge, with corner-aware ends (no overlaps at corners). */
export function bandRange(e: FaceEdge, d0: number, d1: number): [number, number] {
  const s0 = e.convexA ? -d0 : d0;
  const s1 = e.len + (e.convexB ? d1 : -d1);
  return [s0, s1];
}

/** World box of a band piece s0..s1 (along the edge) × d0..d1 (outward) × y0..y1. */
export function bandBox(e: FaceEdge, s0: number, s1: number, d0: number, d1: number, y0: number, y1: number): BoxItem {
  const c = add2(add2(e.a, scale2(e.u, (s0 + s1) / 2)), scale2(e.n, (d0 + d1) / 2));
  return { at: [c[0], (y0 + y1) / 2, c[1]], size: [Math.max(1e-3, s1 - s0), Math.max(1e-3, y1 - y0), Math.max(1e-3, d1 - d0)], rotY: angleOfDir(e.u) };
}

/** Point on an edge: s along, d outward. */
export const edgePoint = (e: FaceEdge, s: number, d: number): Vec2 => add2(add2(e.a, scale2(e.u, s)), scale2(e.n, d));

// ---------------------------------------------------------------------------
// Walls: pieces, concrete, rebar, formwork
// ---------------------------------------------------------------------------

export interface WallBox {
  wall: Wall;
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

/**
 * Splits concrete walls into pieces cast WITH the walls (every piece of a wall that
 * stands on the floor, incl. its lintels; `yBase` lowers the floor-standing pieces'
 * bottom, e.g. to the grade-beam top) and BEAMS: walls that are one full-width
 * opening (only a head piece hangs from the slab) → cast with that slab.
 */
export function concretePieces(walls: Wall[], openings: Opening[], floorY: (w: Wall) => number, yBase?: (w: Wall) => number) {
  const cast: WallBox[] = [];
  const beams: WallBox[] = [];
  for (const w of walls) {
    // Drop finish-level "sills" under doors/vitrines (the slab/screed zone, < 12 cm).
    const ps = wallPieces(w, openings, floorY(w)).filter((p) => !(p.y0 <= w.baseY + 0.01 && p.y1 - p.y0 < 0.12));
    const standing = ps.some((p) => p.y0 <= w.baseY + 0.01);
    for (const p of ps) {
      const onFloor = p.y0 <= w.baseY + 0.01;
      const box = { wall: w, s0: p.s0, s1: p.s1, y0: onFloor && yBase ? yBase(w) : p.y0, y1: p.y1 };
      (standing ? cast : beams).push(box);
    }
  }
  return { cast, beams };
}

export const pieceRect = (b: WallBox, grow = 0) => wallRect(b.wall, grow, b.s0, b.s1);

export function pieceItem(b: WallBox): BoxItem {
  const f = wallFrame(b.wall);
  const c = add2(b.wall.a, scale2(f.dir, (b.s0 + b.s1) / 2));
  return { at: [c[0], (b.y0 + b.y1) / 2, c[1]], size: [b.s1 - b.s0, b.y1 - b.y0, b.wall.thickness], rotY: f.rotY };
}

/** Concrete of wall pieces: seamless extrusions per height band (same y0/y1) + boxes for the rest. */
export function wallConcrete(pieces: WallBox[]): { extrudes: Array<{ outline: Vec2[]; holes: Vec2[][]; y0: number; y1: number }>; boxes: BoxItem[]; m3: number } {
  const bands = new Map<string, WallBox[]>();
  for (const p of pieces) {
    const k = `${p.y0.toFixed(3)}|${p.y1.toFixed(3)}`;
    const l = bands.get(k);
    if (l) l.push(p);
    else bands.set(k, [p]);
  }
  const extrudes: Array<{ outline: Vec2[]; holes: Vec2[][]; y0: number; y1: number }> = [];
  const boxes: BoxItem[] = [];
  let m3 = 0;
  for (const list of Array.from(bands.values())) {
    const axis = list.every((p) => {
      const f = wallFrame(p.wall);
      return Math.abs(f.dir[0]) < 1e-3 || Math.abs(f.dir[1]) < 1e-3;
    });
    m3 += list.reduce((s, p) => s + (p.s1 - p.s0) * p.wall.thickness * (p.y1 - p.y0), 0);
    if (list.length > 1 && axis) {
      const reg = Region.of(list.map((p) => pieceRect(p)));
      for (const sh of reg.shapes()) extrudes.push({ ...sh, y0: list[0].y0, y1: list[0].y1 });
    } else boxes.push(...list.map(pieceItem));
  }
  return { extrudes, boxes, m3 };
}

/** Does any polygon cover point p (XZ)? */
export const covered = (p: Vec2, polys: Vec2[][]) => polys.some((q) => pointInPolygon(p, q));

/**
 * Two-layer wall mesh in each piece: vertical bars (with starters `starter` m above the
 * top where a slab will cover them) and horizontal bars, at `spacing`.
 */
export function wallMesh(
  pieces: WallBox[],
  opts: { spacing: number; cover?: number; starter?: number; slabAbove?: Vec2[][]; dV?: number; dH?: number },
): { v: RodItem[]; h: RodItem[]; ties: RodItem[]; kg: number } {
  const cover = opts.cover ?? COVER;
  const v: RodItem[] = [];
  const h: RodItem[] = [];
  const ties: RodItem[] = [];
  for (const p of pieces) {
    const f = wallFrame(p.wall);
    const off = p.wall.thickness / 2 - cover;
    if (off <= 0.01) continue;
    const ss = spaced(p.s0, p.s1, opts.spacing, cover);
    const ys = spaced(p.y0, p.y1, opts.spacing, cover + 0.03);
    for (const side of [-1, 1]) {
      const n = side * off;
      for (const s of ss) {
        const c = add2(add2(p.wall.a, scale2(f.dir, s)), scale2(f.normal, n));
        const top = opts.starter && opts.slabAbove && covered(c, opts.slabAbove) ? p.y1 + opts.starter : p.y1 - cover;
        v.push({ a: [c[0], p.y0 + 0.002, c[1]], b: [c[0], top, c[1]] });
      }
      // Horizontals sit just inside the verticals.
      const nh = side * (off - 0.014);
      const a = add2(add2(p.wall.a, scale2(f.dir, p.s0 + cover * 0.6)), scale2(f.normal, nh));
      const b = add2(add2(p.wall.a, scale2(f.dir, p.s1 - cover * 0.6)), scale2(f.normal, nh));
      for (const y of ys) h.push({ a: [a[0], y, a[1]], b: [b[0], y, b[1]] });
    }
    // S-ties linking the two layers on a coarse grid.
    for (let i = 1; i < ss.length - 1; i += 3)
      for (let k = 1; k < ys.length - 1; k += 3) {
        const c0 = add2(add2(p.wall.a, scale2(f.dir, ss[i])), scale2(f.normal, -off - 0.006));
        const c1 = add2(add2(p.wall.a, scale2(f.dir, ss[i])), scale2(f.normal, off + 0.006));
        ties.push({ a: [c0[0], ys[k], c0[1]], b: [c1[0], ys[k], c1[1]] });
      }
  }
  const kg = rebarKg(opts.dV ?? 14, rodLength(v)) + rebarKg(opts.dH ?? 12, rodLength(h)) + rebarKg(8, rodLength(ties) + ties.length * 0.15);
  return { v, h, ties, kg };
}

/** Wall formwork: plywood panels, vertical studs, horizontal walers (both sides), ties + wing nuts, braces. */
export interface WallForms {
  ply: BoxItem[];
  studs: BoxItem[];
  walers: BoxItem[];
  ties: RodItem[];
  nuts: BoxItem[];
  braces: RodItem[];
  feet: BoxItem[];
  m2: number;
}

export function wallForms(
  pieces: WallBox[],
  y0: number,
  y1: number,
  opts: {
    /** Where push-pull braces may stand: returns the floor height at p, or null. */
    floorAt: (p: Vec2) => number | null;
    panelW?: number;
    clear?: number;
  },
): WallForms {
  const ext = Region.of(pieces.map((p) => pieceRect(p)));
  const out: WallForms = { ply: [], studs: [], walers: [], ties: [], nuts: [], braces: [], feet: [], m2: 0 };
  const gap = opts.clear ?? 0.006;
  const STUD: Vec2 = [0.05, 0.1]; // along face × depth
  const WAL: Vec2 = [0.12, 0.08]; // height × depth (double channel)
  const dPly0 = gap;
  const dPly1 = gap + PLY;
  const dStud1 = dPly1 + STUD[1];
  const dWal1 = dStud1 + WAL[1];
  const fy0 = y0 - 0.02;
  const fy1 = y1 + 0.06;
  const H = fy1 - fy0;
  const rows = H > 3.1 ? [fy0, fy0 + 2.7, fy1] : [fy0, fy1];
  const walerAt = (nAxisX: boolean) => {
    const ys = H > 2.2 ? [fy0 + 0.35, fy0 + H / 2, fy1 - 0.35] : [fy0 + 0.3, fy1 - 0.3];
    return ys.map((y) => y + (nAxisX ? 0 : 0.14));
  };
  for (const e of ext.edges()) {
    const [ps0, ps1] = bandRange(e, dPly0, dPly1);
    if (ps1 - ps0 < 0.05) continue;
    out.m2 += e.len * (y1 - y0);
    // Panels.
    const cols = divide(ps0, ps1, opts.panelW ?? 1.2);
    for (let i = 0; i < cols.length - 1; i++)
      for (let r = 0; r < rows.length - 1; r++)
        out.ply.push(bandBox(e, cols[i] + JOINT / 2, cols[i + 1] - JOINT / 2, dPly0, dPly1, rows[r] + JOINT / 2, rows[r + 1] - JOINT / 2));
    // Studs.
    const [ss0, ss1] = bandRange(e, dPly1, dStud1);
    for (const s of spaced(ss0, ss1, 0.42, STUD[0] / 2 + 0.03)) out.studs.push(bandBox(e, s - STUD[0] / 2, s + STUD[0] / 2, dPly1, dStud1, fy0 + 0.02, fy1 - 0.02));
    // Walers (heights alternate by face axis so crossing corners never intersect).
    const [ws0, ws1] = bandRange(e, dStud1, dWal1);
    const nAxisX = Math.abs(e.n[0]) > 0.5;
    for (const y of walerAt(nAxisX)) out.walers.push(bandBox(e, ws0 - (e.convexA ? 0.12 : 0), ws1 + (e.convexB ? 0.12 : 0), dStud1, dWal1, y - WAL[0] / 2, y + WAL[0] / 2));
    // Braces on faces with a floor in front of them.
    if (e.len > 0.6) {
      const reach = Math.min(1.8, (y1 - y0) * 0.6);
      for (const s of spaced(0, e.len, 2.2, Math.min(0.6, e.len / 2))) {
        const foot = edgePoint(e, s, dWal1 + reach);
        const fh = opts.floorAt(foot);
        if (fh === null || ext.contains(foot)) continue;
        const top = edgePoint(e, s, dWal1 + 0.03);
        const yt = fy0 + H * 0.72;
        out.braces.push({ a: [foot[0], fh + 0.04, foot[1]], b: [top[0], yt, top[1]] });
        const mid = edgePoint(e, s, dWal1 + reach * 0.55);
        out.braces.push({ a: [mid[0], fh + 0.04, mid[1]], b: [top[0], fy0 + H * 0.3, top[1]] });
        out.feet.push({ at: [foot[0], fh + 0.012, foot[1]], size: [0.22, 0.024, 0.14], rotY: angleOfDir(e.u) });
      }
    }
  }
  // Ties through each wall piece at the waler heights.
  for (const p of pieces) {
    const f = wallFrame(p.wall);
    const nAxisX = Math.abs(f.normal[0]) > 0.5;
    const len = p.s1 - p.s0;
    if (len < 0.25) continue;
    const half = p.wall.thickness / 2 + dWal1 + 0.05;
    for (const s of spaced(p.s0, p.s1, 0.95, Math.min(0.35, len / 2)))
      for (const y of walerAt(nAxisX)) {
        if (y < p.y0 + 0.08 || y > p.y1 - 0.08) continue;
        const c = add2(p.wall.a, scale2(f.dir, s));
        const pa = add2(c, scale2(f.normal, -half));
        const pb = add2(c, scale2(f.normal, half));
        out.ties.push({ a: [pa[0], y, pa[1]], b: [pb[0], y, pb[1]] });
        for (const q of [-1, 1]) {
          const w = add2(c, scale2(f.normal, q * (half - 0.02)));
          out.nuts.push({ at: [w[0], y, w[1]], size: [0.1, 0.1, 0.03], rotY: f.rotY });
        }
      }
  }
  return out;
}

/** Instanced parts of a WallForms set (formwork-tagged). */
export function wallFormParts(id: string, f: WallForms, tags: string[], t0 = 0, exit?: Part['exit']): Part[] {
  const base = ['formwork', ...tags];
  const parts: Part[] = [
    {
      id: `${id}:ply`,
      shape: { kind: 'boxes', items: f.ply },
      material: 'plywood',
      tags: base,
      anim: { type: 'drop', from: [0, 1.4, 0], delay: t0, duration: 0.55, stagger: fit(2.2, f.ply.length, 0.1), order: 'x', ease: 'out' },
      exit,
    },
    {
      id: `${id}:studs`,
      shape: { kind: 'boxes', items: f.studs },
      material: 'timber',
      tags: base,
      anim: { type: 'rise', delay: t0 + 1.0, duration: 0.4, stagger: fit(1.4, f.studs.length, 0.05), order: 'x' },
      exit,
    },
    {
      id: `${id}:walers`,
      shape: { kind: 'boxes', items: f.walers },
      material: 'steel',
      tags: base,
      anim: { type: 'drop', from: [0, 0.8, 0], delay: t0 + 2.0, duration: 0.5, stagger: fit(1.0, f.walers.length, 0.06), order: 'y', ease: 'out' },
      exit,
    },
  ];
  if (f.ties.length)
    parts.push(
      {
        id: `${id}:ties`,
        shape: { kind: 'rods', radius: 0.008, segments: 5, items: f.ties },
        material: 'steel',
        tags: base,
        anim: { type: 'grow', delay: t0 + 2.6, duration: 0.3, stagger: fit(0.9, f.ties.length, 0.04), order: 'x' },
        exit,
      },
      {
        id: `${id}:nuts`,
        shape: { kind: 'boxes', items: f.nuts },
        material: 'galvanized',
        tags: base,
        edges: false,
        anim: { type: 'grow', delay: t0 + 2.9, duration: 0.25, stagger: fit(0.8, f.nuts.length, 0.03), order: 'x' },
        exit,
      },
    );
  if (f.braces.length)
    parts.push(
      {
        id: `${id}:braces`,
        shape: { kind: 'rods', radius: 0.022, segments: 8, items: f.braces },
        material: 'pipeBlue',
        tags: base,
        anim: { type: 'rise', delay: t0 + 3.1, duration: 0.5, stagger: fit(0.8, f.braces.length, 0.06), order: 'x' },
        exit,
      },
      {
        id: `${id}:feet`,
        shape: { kind: 'boxes', items: f.feet },
        material: 'steel',
        tags: base,
        anim: { type: 'fade', delay: t0 + 3.1, duration: 0.4 },
        exit,
      },
    );
  return parts;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export interface ColumnSet {
  bars: RodItem[];
  ties: RodItem[];
  kg: number;
}

/** Column cages: corner + intermediate verticals, closed ties every `pitch` (denser at ends). */
export function columnCages(cols: Column[], y0: number | ((c: Column) => number), y1: number | ((c: Column) => number), slabAbove: Vec2[][], starter = 0.18): ColumnSet {
  const bars: RodItem[] = [];
  const ties: RodItem[] = [];
  for (const c of cols) {
    const b0 = typeof y0 === 'number' ? y0 : y0(c);
    const b1 = typeof y1 === 'number' ? y1 : y1(c);
    const r = c.rotation ?? 0;
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    const loc = (x: number, z: number): Vec2 => [c.center[0] + x * cs + z * sn, c.center[1] - x * sn + z * cs];
    const hx = c.size[0] / 2 - 0.04;
    const hz = c.size[1] / 2 - 0.04;
    const xsB = spaced(-hx, hx, 0.2);
    const zsB = spaced(-hz, hz, 0.2);
    const ring: Vec2[] = [];
    for (const x of xsB) ring.push([x, -hz], [x, hz]);
    for (const z of zsB.slice(1, -1)) ring.push([-hx, z], [hx, z]);
    for (const [x, z] of ring) {
      const p = loc(x, z);
      const top = covered(p, slabAbove) ? b1 + starter : b1 - 0.04;
      bars.push({ a: [p[0], b0 + 0.003, p[1]], b: [p[0], top, p[1]] });
    }
    // Ties: 10 cm in the end zones, 20 cm in the middle.
    const ys: number[] = [];
    for (let y = b0 + 0.06; y < b1 - 0.04; ) {
      ys.push(y);
      y += y - b0 < 0.5 || b1 - y < 0.6 ? 0.1 : 0.2;
    }
    const tx = hx + 0.012;
    const tz = hz + 0.012;
    const corners = [loc(-tx, -tz), loc(tx, -tz), loc(tx, tz), loc(-tx, tz)];
    for (const y of ys)
      for (let k = 0; k < 4; k++) {
        const a = corners[k];
        const b = corners[(k + 1) % 4];
        ties.push({ a: [a[0], y, a[1]], b: [b[0], y, b[1]] });
      }
  }
  const kg = rebarKg(14, rodLength(bars)) + rebarKg(8, rodLength(ties));
  return { bars, ties, kg };
}

/** Plywood column boxes + steel clamps + two push-pull braces each. */
export function columnForms(cols: Column[], y0: (c: Column) => number, y1: (c: Column) => number, floorAt: (p: Vec2) => number | null, toward: Vec2) {
  const ply: BoxItem[] = [];
  const clamps: BoxItem[] = [];
  const braces: RodItem[] = [];
  let m2 = 0;
  for (const c of cols) {
    const b0 = y0(c) - 0.01;
    const b1 = y1(c) + 0.05;
    const r = c.rotation ?? 0;
    const [sx, sz] = c.size;
    m2 += 2 * (sx + sz) * (y1(c) - y0(c));
    const g = 0.004;
    const at = (x: number, z: number, y: number): Vec3 => [c.center[0] + x * Math.cos(r) + z * Math.sin(r), y, c.center[1] - x * Math.sin(r) + z * Math.cos(r)];
    const ym = (b0 + b1) / 2;
    const H = b1 - b0;
    // Boards: X faces span the full width incl. the Z boards' thickness.
    ply.push({ at: at(0, -(sz / 2 + g + PLY / 2), ym), size: [sx + 2 * (g + PLY), H, PLY], rotY: r });
    ply.push({ at: at(0, sz / 2 + g + PLY / 2, ym), size: [sx + 2 * (g + PLY), H, PLY], rotY: r });
    ply.push({ at: at(-(sx / 2 + g + PLY / 2), 0, ym), size: [PLY, H, sz + 2 * g - 0.002], rotY: r });
    ply.push({ at: at(sx / 2 + g + PLY / 2, 0, ym), size: [PLY, H, sz + 2 * g - 0.002], rotY: r });
    // Clamps (closed steel frames) every ~0.55 m.
    const o = g + PLY;
    const cw = 0.05;
    for (const y of spaced(b0 + 0.25, b1 - 0.2, 0.55)) {
      clamps.push({ at: at(0, -(sz / 2 + o + cw / 2), y), size: [sx + 2 * (o + cw) + 0.1, 0.07, cw], rotY: r });
      clamps.push({ at: at(0, sz / 2 + o + cw / 2, y), size: [sx + 2 * (o + cw) + 0.1, 0.07, cw], rotY: r });
      clamps.push({ at: at(-(sx / 2 + o + cw / 2), 0, y), size: [cw, 0.07, sz + 2 * o], rotY: r });
      clamps.push({ at: at(sx / 2 + o + cw / 2, 0, y), size: [cw, 0.07, sz + 2 * o], rotY: r });
    }
    // Two braces toward the floor interior (perpendicular directions).
    const d = sub2(toward, c.center);
    const dirs: Vec2[] = Math.abs(d[0]) > Math.abs(d[1]) ? [[Math.sign(d[0]) || 1, 0], [0, Math.sign(d[1]) || 1]] : [[0, Math.sign(d[1]) || 1], [Math.sign(d[0]) || 1, 0]];
    for (const dir of dirs) {
      const reach = Math.min(1.7, H * 0.55);
      const half = (Math.abs(dir[0]) > 0.5 ? sx : sz) / 2 + o + cw;
      const foot = add2(c.center, scale2(dir, half + reach));
      const fh = floorAt(foot);
      if (fh === null) continue;
      const top = add2(c.center, scale2(dir, half));
      braces.push({ a: [foot[0], fh + 0.03, foot[1]], b: [top[0], b0 + H * 0.7, top[1]] });
    }
  }
  return { ply, clamps, braces, m2 };
}

// ---------------------------------------------------------------------------
// Slabs: rebar grids, props + H20 beams, deck sheets, edge forms
// ---------------------------------------------------------------------------

/** Bars both directions inside a region at height y (X bars at y, Z bars at y + dy). */
export function slabGrid(reg: Region, y: number, spacing: number, opts: { cover?: number; dy?: number; zFirst?: boolean; phase?: number } = {}): { x: RodItem[]; z: RodItem[] } {
  const cover = opts.cover ?? 0.04;
  const dy = opts.dy ?? 0.014;
  const ph = opts.phase ?? 0;
  const x0 = reg.xs[0];
  const x1 = reg.xs[reg.nx];
  const z0 = reg.zs[0];
  const z1 = reg.zs[reg.nz];
  const xBars: RodItem[] = [];
  const zBars: RodItem[] = [];
  const yx = opts.zFirst ? y + dy : y;
  const yz = opts.zFirst ? y : y + dy;
  for (let z = z0 + cover + ph; z <= z1 - cover + 1e-6; z += spacing)
    for (const [a, b] of reg.intervals('x', z)) if (b - a > 2 * cover + 0.1) xBars.push({ a: [a + cover, yx, z], b: [b - cover, yx, z] });
  for (let x = x0 + cover + ph; x <= x1 - cover + 1e-6; x += spacing)
    for (const [a, b] of reg.intervals('z', x)) if (b - a > 2 * cover + 0.1) zBars.push({ a: [x, yz, a + cover], b: [x, yz, b - cover] });
  return { x: xBars, z: zBars };
}

/** Grid points inside a region (cell centers of a `step` lattice, inset from faces). */
export function gridPoints(reg: Region, step: Vec2, inset: number, origin: Vec2 = [0, 0]): Vec2[] {
  const out: Vec2[] = [];
  const x0 = reg.xs[0];
  const z0 = reg.zs[0];
  const x1 = reg.xs[reg.nx];
  const z1 = reg.zs[reg.nz];
  for (let x = origin[0] + Math.ceil((x0 + inset - origin[0]) / step[0]) * step[0]; x <= x1 - inset; x += step[0])
    for (let z = origin[1] + Math.ceil((z0 + inset - origin[1]) / step[1]) * step[1]; z <= z1 - inset; z += step[1]) {
      const p: Vec2 = [x, z];
      if (!reg.contains(p)) continue;
      const ok = [
        [inset, 0],
        [-inset, 0],
        [0, inset],
        [0, -inset],
      ].every(([dx, dz]) => reg.contains([x + dx, z + dz]));
      if (ok) out.push(p);
    }
  return out;
}

export interface DeckField {
  /** Steel props (outer tube, inner tube, base plates, head forks). */
  outer: RodItem[];
  inner: RodItem[];
  plates: BoxItem[];
  heads: BoxItem[];
  collars: BoxItem[];
  primaries: BoxItem[];
  secondaries: BoxItem[];
  sheets: BoxItem[];
  props: number;
  deckM2: number;
}

/**
 * Slab shoring + deck under a region whose underside is `soffit(p)`: H20 primaries
 * along Z (every `primaryStep` in X), secondaries along X (every 0.5 m), props under
 * the primaries, plywood sheets 1.22 × 2.44 laid on the secondaries.
 */
export function deckField(
  deck: Region,
  soffit: (p: Vec2) => number,
  floorAt: (p: Vec2) => number,
  avoid: (p: Vec2) => boolean,
  opts: { primaryStep?: number; propStep?: number } = {},
): DeckField {
  const out: DeckField = { outer: [], inner: [], plates: [], heads: [], collars: [], primaries: [], secondaries: [], sheets: [], props: 0, deckM2: deck.area };
  const pStep = opts.primaryStep ?? 1.25;
  const propStep = opts.propStep ?? 1.25;
  const x0 = deck.xs[0];
  const x1 = deck.xs[deck.nx];
  const z0 = deck.zs[0];
  const z1 = deck.zs[deck.nz];
  // Sheets (cut at the region faces), joints every 1.22 (X) × 2.44 (Z).
  for (const r of deck.tiles([1.22, 2.44], [x0, z0])) {
    const c: Vec2 = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    const y = soffit(c);
    out.sheets.push({ at: [c[0], y - PLY / 2, c[1]], size: [r.x1 - r.x0 - JOINT, PLY, r.z1 - r.z0 - JOINT] });
  }
  // Secondaries along X every 0.5 m, under the sheets.
  for (let z = z0 + 0.12; z <= z1 - 0.06; z += 0.5)
    for (const [a, b] of deck.intervals('x', z)) {
      if (b - a < 0.3) continue;
      const y = soffit([(a + b) / 2, z]) - PLY;
      for (const [s0, s1] of pieces(a + 0.02, b - 0.02, 4.9))
        out.secondaries.push({ at: [(s0 + s1) / 2, y - H20[1] / 2, z], size: [s1 - s0, H20[1], H20[0]] });
    }
  // Primaries along Z under the secondaries, props under the primaries.
  const yP = (p: Vec2) => soffit(p) - PLY - H20[1];
  for (let x = x0 + 0.3; x <= x1 - 0.15; x += pStep)
    for (const [a, b] of deck.intervals('z', x)) {
      if (b - a < 0.4) continue;
      const y = yP([x, (a + b) / 2]);
      for (const [s0, s1] of pieces(a + 0.04, b - 0.04, 4.9)) out.primaries.push({ at: [x, y - H20[1] / 2, (s0 + s1) / 2], size: [H20[0], H20[1], s1 - s0] });
      for (const z of spaced(a, b, propStep, 0.3)) {
        const p: Vec2 = [x, z];
        if (avoid(p)) continue;
        addProp(out, p, floorAt(p), y - H20[1]);
      }
    }
  return out;
}

function pieces(a: number, b: number, max: number): Array<[number, number]> {
  const cuts = divide(a, b, max);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < cuts.length - 1; i++) out.push([cuts[i] + (i ? 0.01 : 0), cuts[i + 1] - (i < cuts.length - 2 ? 0.01 : 0)]);
  return out;
}

/** One steel prop (base plate on the floor, fork head under `topY`). */
export function addProp(f: Pick<DeckField, 'outer' | 'inner' | 'plates' | 'heads' | 'collars' | 'props'>, p: Vec2, floorY: number, topY: number) {
  const H = topY - floorY;
  if (H < 0.4) return;
  const split = floorY + Math.min(1.75, H * 0.58);
  f.plates.push({ at: [p[0], floorY + 0.006, p[1]], size: [0.15, 0.012, 0.15] });
  f.outer.push({ a: [p[0], floorY + 0.012, p[1]], b: [p[0], split, p[1]] });
  f.inner.push({ a: [p[0], split - 0.05, p[1]], b: [p[0], topY - 0.07, p[1]] });
  f.collars.push({ at: [p[0], split - 0.03, p[1]], size: [0.11, 0.07, 0.11] });
  f.heads.push({ at: [p[0], topY - 0.04, p[1]], size: [0.16, 0.08, 0.13] });
  f.props += 1;
}

/** Parts for the props of a deck field. */
export function propParts(id: string, f: DeckField, tags: string[], anim: { delay?: number; order?: Anim['order']; origin?: Vec2; total?: number } = {}): Part[] {
  const base = ['props', 'formwork', ...tags];
  const st = fit(anim.total ?? 2.6, f.props, 0.06);
  const o = { order: anim.order ?? ('near' as const), origin: anim.origin };
  const d = anim.delay ?? 0;
  return [
    { id: `${id}:plates`, shape: { kind: 'boxes', items: f.plates }, material: 'steel', tags: base, edges: false, anim: { type: 'fade', delay: d, duration: 0.5 } },
    { id: `${id}:outer`, shape: { kind: 'rods', radius: 0.03, segments: 8, items: f.outer }, material: 'pipeBlue', tags: base, anim: { type: 'rise', delay: d, duration: 0.45, stagger: st, ...o } },
    { id: `${id}:collars`, shape: { kind: 'boxes', items: f.collars }, material: 'conduit', tags: base, edges: false, anim: { type: 'grow', delay: d + 0.35, duration: 0.3, stagger: st, ...o } },
    { id: `${id}:inner`, shape: { kind: 'rods', radius: 0.022, segments: 8, items: f.inner }, material: 'galvanized', tags: base, anim: { type: 'rise', delay: d + 0.4, duration: 0.45, stagger: st, ...o } },
    { id: `${id}:heads`, shape: { kind: 'boxes', items: f.heads }, material: 'steel', tags: base, anim: { type: 'grow', delay: d + 0.75, duration: 0.3, stagger: st, ...o } },
  ];
}

/** Slab edge forms along region faces: plywood boards + timber brackets. */
export function edgeForms(
  slab: Region,
  yAt: (p: Vec2) => { bottom: number; top: number },
  skip: (mid: Vec2, e: FaceEdge) => boolean,
  /** Is there a support (wall) right under the board? Then it does not hang below the soffit. */
  supported: (p: Vec2) => boolean = () => false,
): { boards: BoxItem[]; brackets: BoxItem[]; m: number; edges: FaceEdge[] } {
  const boards: BoxItem[] = [];
  const brackets: BoxItem[] = [];
  const used: FaceEdge[] = [];
  let m = 0;
  for (const e of slab.edges()) {
    const mid = edgePoint(e, e.len / 2, -0.05);
    if (skip(edgePoint(e, e.len / 2, 0.05), e)) continue;
    used.push(e);
    const { bottom, top } = yAt(mid);
    const hang = supported(edgePoint(e, e.len / 2, 0.012)) ? 0 : PLY + 0.06;
    const [s0, s1] = bandRange(e, 0.002, 0.002 + PLY);
    const cols = divide(s0, s1, 2.44);
    for (let i = 0; i < cols.length - 1; i++) boards.push(bandBox(e, cols[i] + JOINT / 2, cols[i + 1] - JOINT / 2, 0.002, 0.002 + PLY, bottom - hang, top + 0.05));
    for (const s of spaced(0, e.len, 0.8, Math.min(0.2, e.len / 2))) {
      brackets.push(bandBox(e, s - 0.025, s + 0.025, 0.002 + PLY, 0.002 + PLY + 0.1, bottom - hang, top - 0.02));
    }
    m += e.len;
  }
  return { boards, brackets, m, edges: used };
}

// ---------------------------------------------------------------------------
// Pours
// ---------------------------------------------------------------------------

/** Pour tiles of a slab region (instanced boxes, sweep outward from `origin`). */
export function pourTiles(reg: Region, y0: (p: Vec2) => number, y1: (p: Vec2) => number, size = 0.7): BoxItem[] {
  return reg.tiles(size, [reg.xs[0], reg.zs[0]]).map((r) => {
    const c: Vec2 = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    const a = y0(c);
    const b = y1(c);
    return { at: [c[0], (a + b) / 2, c[1]] as Vec3, size: [r.x1 - r.x0, b - a, r.z1 - r.z0] as Vec3 };
  });
}

/** Outline line pairs (top + bottom rings + vertical corners) for a region slab. */
export function outlineLines(reg: Region, y0: (p: Vec2) => number, y1: (p: Vec2) => number): Vec3[] {
  const pts: Vec3[] = [];
  for (const e of reg.edges()) {
    const m = edgePoint(e, e.len / 2, -0.01);
    const a = y0(m) - 0.002;
    const b = y1(m) + 0.002;
    const pa = edgePoint(e, 0, 0.002);
    const pb = edgePoint(e, e.len, 0.002);
    pts.push([pa[0], b, pa[1]], [pb[0], b, pb[1]], [pa[0], a, pa[1]], [pb[0], a, pb[1]]);
    if (e.convexA) pts.push([pa[0], a, pa[1]], [pa[0], b, pa[1]]);
  }
  return pts;
}

/** Concrete slab part (pour sweep) + crisp outline lines. */
export function slabPourParts(
  id: string,
  reg: Region,
  y0: (p: Vec2) => number,
  y1: (p: Vec2) => number,
  origin: Vec2,
  tags: string[],
  t: { delay?: number; total?: number; size?: number } = {},
): { parts: Part[]; m3: number; area: number } {
  const tiles = pourTiles(reg, y0, y1, t.size ?? 0.7);
  const m3 = boxVolume(tiles);
  const total = t.total ?? 4.2;
  const delay = t.delay ?? 1.4;
  return {
    m3,
    area: reg.area,
    parts: [
      {
        id: `${id}:slab`,
        shape: { kind: 'boxes', items: tiles },
        material: 'concrete',
        tags: ['concrete', 'slab', ...tags],
        edges: false,
        anim: { type: 'pour', delay, duration: 0.8, stagger: fit(total, tiles.length, 0.08), order: 'near', origin },
      },
      {
        id: `${id}:outline`,
        shape: { kind: 'lines', points: outlineLines(reg, y0, y1) },
        material: 'ink',
        color: '#8C8C8E',
        tags: ['slab-outline', ...tags],
        highlight: false,
        anim: { type: 'fade', delay: delay + total * 0.7, duration: 1.2 },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Pump truck placement (the model's boom points forward, fixed pose)
// ---------------------------------------------------------------------------

/**
 * Hose end relative to the truck origin (front +X), mirrors models/equipment.ts pumpTruck():
 * boom pivot (-2.8, 2.05), segments L = [5, 4.5, 4, 3.2] at A = [1.1, 0.55, 0.1, -0.2] rad,
 * end hose 2.5 m. Kept analytic so steps stay three.js-free.
 */
export const PUMP_TIP: Vec3 = (() => {
  const L = [5, 4.5, 4, 3.2];
  const A = [1.1, 0.55, 0.1, -0.2];
  let x = 0;
  let y = 0;
  L.forEach((l, i) => {
    x += Math.cos(A[i]) * l;
    y += Math.sin(A[i]) * l;
  });
  return [-2.8 + x, 2.05 + y - 2.5, 0];
})();

export interface PumpSpot {
  at: Vec3;
  rotY: number;
  /** Hose end (world). */
  tip: Vec3;
  /** Where the pour starts (nearest point of the target region under the hose). */
  origin: Vec2;
}

const bboxOf = (poly: Vec2[], grow: number) => {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p[0]);
    z0 = Math.min(z0, p[1]);
    x1 = Math.max(x1, p[0]);
    z1 = Math.max(z1, p[1]);
  }
  return { x0: x0 - grow, z0: z0 - grow, x1: x1 + grow, z1: z1 + grow };
};
const inBox = (p: Vec2, b: { x0: number; z0: number; x1: number; z1: number }) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.z0 && p[1] <= b.z1;

/** Lazily evaluated raster (0.5 m) of where a truck may stand, cached per ground grid. */
interface StandRaster {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** 1 = ok, 0 = no, 255 = not evaluated yet. */
  ok: Uint8Array;
  street: Uint8Array;
  eval: (idx: number) => boolean;
}
const standCache = new WeakMap<TerrainGrid, StandRaster>();

function standRaster(ctx: BuildContext, ground: TerrainGrid): StandRaster {
  const hit = standCache.get(ground);
  if (hit) return hit;
  const lay = siteLayout(ctx);
  const house = ctx.footprint.house;
  const street = ctx.house.site.street ?? [];
  const pts = [...ctx.lot.boundary, ...street];
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 1;
  const z0 = Math.min(...zs) - 1;
  const nx = Math.ceil((Math.max(...xs) + 1 - x0) / 0.5);
  const nz = Math.ceil((Math.max(...zs) + 1 - z0) / 0.5);
  const ok = new Uint8Array(nx * nz).fill(255);
  const st = new Uint8Array(nx * nz);
  const keep = [
    { at: lay.container, r: 3.6 },
    { at: lay.toilet, r: 1.3 },
    { at: lay.spoil, r: 2.8 },
    { at: lay.sign, r: 0.6 },
    { at: lay.pole, r: 0.6 },
  ];
  const hb = bboxOf(house, 0.8);
  const lb = bboxOf(ctx.lot.boundary, 0.01);
  const evalCell = (idx: number): boolean => {
    const v = ok[idx];
    if (v !== 255) return v === 1;
    const i = idx % nx;
    const j = Math.floor(idx / nx);
    const p: Vec2 = [x0 + (i + 0.5) * 0.5, z0 + (j + 0.5) * 0.5];
    let onStreet = false;
    for (let k = 0; k < street.length - 1 && !onStreet; k++) onStreet = distanceToSegment(p, street[k], street[k + 1]) < 3.3;
    st[idx] = onStreet ? 1 : 0;
    let res = true;
    const nearHouse = inBox(p, hb);
    if (nearHouse && pointInPolygon(p, house)) res = false;
    for (let k = 0; res && nearHouse && k < house.length; k++) if (distanceToSegment(p, house[k], house[(k + 1) % house.length]) < 0.7) res = false;
    if (res && keep.some((q) => dist2(q.at, p) < q.r)) res = false;
    if (res && !onStreet) {
      if (!inBox(p, lb) || !pointInPolygon(p, ctx.lot.boundary)) res = false;
      // Not in the pit: ground must not be cut far below natural.
      else res = sampleGrid(ground, p[0], p[1]) > sampleGrid(ctx.terrain.natural, p[0], p[1]) - 0.6;
    }
    ok[idx] = res ? 1 : 0;
    return res;
  };
  const r: StandRaster = { x0, z0, nx, nz, ok, street: st, eval: evalCell };
  standCache.set(ground, r);
  return r;
}

/**
 * Best pump-truck stand for a pour: truck body (10.4 × 3 m) and outriggers on the
 * street or open, un-excavated lot ground, clear of the house and site items; boom
 * facing the target; hose end as close as possible to the region (then the target).
 */
export function pumpSpot(ctx: BuildContext, reg: Region, target: Vec2, ground: TerrainGrid, stand: TerrainGrid = ground): PumpSpot {
  const R = PUMP_TIP[0];
  const ras = standRaster(ctx, stand);
  const cellAt = (p: Vec2) => {
    const i = Math.floor((p[0] - ras.x0) / 0.5);
    const j = Math.floor((p[1] - ras.z0) / 0.5);
    return i < 0 || j < 0 || i >= ras.nx || j >= ras.nz ? -1 : j * ras.nx + i;
  };
  const okAt = (p: Vec2) => {
    const k = cellAt(p);
    return k >= 0 && ras.eval(k);
  };
  const bx0 = reg.xs[0];
  const bx1 = reg.xs[reg.nx];
  const bz0 = reg.zs[0];
  const bz1 = reg.zs[reg.nz];
  const edges = reg.edges();
  const dReg = (p: Vec2) => {
    if (reg.contains(p)) return 0;
    const dx = Math.max(bx0 - p[0], 0, p[0] - bx1);
    const dz = Math.max(bz0 - p[1], 0, p[1] - bz1);
    if (dx > 0 || dz > 0) return Math.hypot(dx, dz);
    let d = Infinity;
    for (const e of edges) d = Math.min(d, distanceToSegment(p, e.a, e.b));
    return d;
  };
  const N = 40;
  const samples: Vec2[] = [];
  for (const sx of [-5.2, -2.6, 0, 2.6, 5.2]) for (const sz of [-1.5, 0, 1.5]) samples.push([sx, sz]);
  samples.push([1.8, -2.6], [1.8, 2.6], [-3.4, -2.6], [-3.4, 2.6]);
  // Cells sorted by a lower bound of their score (hose can be at best |d(c,target) - R| away).
  const cells: Array<{ c: Vec2; idx: number; bound: number }> = [];
  for (let j = 0; j < ras.nz; j += 2)
    for (let i = 0; i < ras.nx; i += 2) {
      const idx = j * ras.nx + i;
      const c: Vec2 = [ras.x0 + (i + 0.5) * 0.5, ras.z0 + (j + 0.5) * 0.5];
      // A hose point more than ~9 m off the target never wins: skip far cells cheaply.
      if (Math.abs(dist2(c, target) - R) > 9) continue;
      if (!ras.eval(idx)) continue;
      const far = Math.max(0, dReg(c) - R);
      cells.push({ c, idx, bound: far * 4 + Math.abs(dist2(c, target) - R) * 0.35 + (ras.street[idx] ? 0 : 0.8) + dist2(c, ctx.lot.gate) * 0.03 });
    }
  cells.sort((p, q) => p.bound - q.bound);
  let pick: { c: Vec2; dir: Vec2; tip: Vec2 } | null = null;
  let bestScore = Infinity;
  for (const cell of cells) {
    if (cell.bound >= bestScore) break;
    const extra = (ras.street[cell.idx] ? 0 : 0.8) + dist2(cell.c, ctx.lot.gate) * 0.03;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const dir: Vec2 = [Math.cos(a), Math.sin(a)];
      const tip: Vec2 = [cell.c[0] + dir[0] * R, cell.c[1] + dir[1] * R];
      const score = dist2(tip, target) * 0.35 + extra;
      if (score >= bestScore) continue;
      const sc = score + dReg(tip) * 4;
      if (sc >= bestScore) continue;
      const nrm: Vec2 = [-dir[1], dir[0]];
      if (!samples.every(([sx, sz]) => okAt([cell.c[0] + dir[0] * sx + nrm[0] * sz, cell.c[1] + dir[1] * sx + nrm[1] * sz]))) continue;
      bestScore = sc;
      pick = { c: cell.c, dir, tip };
    }
  }
  if (!pick) {
    const lay = siteLayout(ctx);
    pick = { c: lay.truck, dir: ctx.lot.street.inward, tip: add2(lay.truck, scale2(ctx.lot.street.inward, R)) };
  }
  const gy = sampleGrid(ground, pick.c[0], pick.c[1]);
  const tip: Vec3 = [pick.tip[0], gy + PUMP_TIP[1], pick.tip[1]];
  // Pour origin: the region point nearest the hose end.
  let origin = target;
  let od = Infinity;
  for (const r of reg.tiles(0.5)) {
    const p: Vec2 = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    const d = dist2(p, pick.tip);
    if (d < od) {
      od = d;
      origin = p;
    }
  }
  return { at: [pick.c[0], gy, pick.c[1]], rotY: angleOfDir(pick.dir), tip, origin };
}

/** Bounds covering a region and the pump truck, for pour camera hints. */
export function pourBounds(points: Vec2[], pump: PumpSpot, y0: number, y1: number): CameraHint['bounds'] {
  const fr: Vec2 = [pump.at[0], pump.at[2]];
  const bb = boundsOf([...points, fr, [pump.tip[0], pump.tip[2]]], y0, Math.max(y1, pump.tip[1] + 1), 1.2);
  return bb;
}

/** Material key helper for typed literals. */
export const mat = (k: MaterialKey) => k;

// ---------------------------------------------------------------------------
// Beam forms (heads of fully open concrete walls, cast with the slab above)
// ---------------------------------------------------------------------------

export function beamForms(beams: WallBox[], soffit: (p: Vec2) => number, floorAt: (p: Vec2) => number) {
  const bottoms: BoxItem[] = [];
  const sides: BoxItem[] = [];
  const bearers: BoxItem[] = [];
  const field: Pick<DeckField, 'outer' | 'inner' | 'plates' | 'heads' | 'collars' | 'props'> = { outer: [], inner: [], plates: [], heads: [], collars: [], props: 0 };
  let m2 = 0;
  for (const b of beams) {
    const f = wallFrame(b.wall);
    const t = b.wall.thickness;
    const P = (s: number, n = 0): Vec2 => add2(add2(b.wall.a, scale2(f.dir, s)), scale2(f.normal, n));
    const w = t + 2 * (0.004 + PLY);
    bottoms.push(boxAlong(P(b.s0), P(b.s1), w, b.y0 - PLY, b.y0));
    const top = soffit(P((b.s0 + b.s1) / 2));
    for (const side of [-1, 1]) {
      const n = side * (t / 2 + 0.004 + PLY / 2);
      sides.push(boxAlong(P(b.s0, n), P(b.s1, n), PLY, b.y0 - PLY, top));
    }
    m2 += (b.s1 - b.s0) * (t + 2 * (b.y1 - b.y0));
    for (const s of spaced(b.s0, b.s1, 0.6, 0.12)) {
      const yb = b.y0 - PLY;
      bearers.push(boxAlong(P(s, -(t / 2 + 0.3)), P(s, t / 2 + 0.3), H20[0], yb - H20[1], yb));
      const q = P(s);
      addProp(field, q, floorAt(q), yb - H20[1]);
    }
  }
  return { bottoms, sides, bearers, field, m2 };
}

// ---------------------------------------------------------------------------
// Power trowel ("helicopter") built from primitives
// ---------------------------------------------------------------------------

export function trowelParts(id: string, at: Vec3, rotY: number, delay: number, from: Vec3, tags: string[]): Part[] {
  const blades = [0, 1, 2, 3].map((k) => ({ kind: 'box' as const, size: [0.44, 0.012, 0.11] as Vec3, at: [Math.cos((k * Math.PI) / 2) * 0.22, 0.012, -Math.sin((k * Math.PI) / 2) * 0.22] as Vec3, rotY: (k * Math.PI) / 2 }));
  const anim: Anim = { type: 'slide', delay, duration: 2.6, from, ease: 'inOut' };
  const base = ['machine', ...tags];
  return [
    {
      id: `${id}:cage`,
      shape: {
        kind: 'merge',
        shapes: [
          ...blades,
          { kind: 'cylinder', radius: 0.5, height: 0.05, at: [0, 0.03, 0], segments: 24, open: true },
          { kind: 'cylinder', radius: 0.06, height: 0.12, at: [0, 0.02, 0], segments: 10 },
          { kind: 'rod', a: [0, 0.2, 0], b: [-1.05, 0.95, 0], radius: 0.018 },
          { kind: 'rod', a: [-1.05, 0.95, -0.22], b: [-1.05, 0.95, 0.22], radius: 0.02 },
        ],
      },
      material: 'steel',
      position: at,
      rotationY: rotY,
      tags: base,
      anim,
    },
    {
      id: `${id}:motor`,
      shape: { kind: 'merge', shapes: [{ kind: 'box', size: [0.34, 0.24, 0.3], at: [0, 0.26, 0] }, { kind: 'cylinder', radius: 0.07, height: 0.12, at: [0.0, 0.38, 0], segments: 10 }] },
      material: 'plywood',
      color: '#E3A800',
      position: at,
      rotationY: rotY,
      tags: base,
      anim,
    },
  ];
}

// ---------------------------------------------------------------------------
// The structure frame (shared by phases 4–6): slabs, wall groups, regions, grids
// ---------------------------------------------------------------------------

export interface StructureFrame {
  slabs: { lower?: Slab; susp?: Slab; terrace?: Slab; grade?: Slab; roof?: Slab };
  /** Lower concrete walls: retaining etc. (cast, from the grade-beam top) + beams (L-N2 head). */
  lowerWalls: { cast: WallBox[]; beams: WallBox[] };
  /** Entrance concrete walls (mamad + interior concrete; parapets excluded) + beams (E-SN head). */
  entranceWalls: { cast: WallBox[]; beams: WallBox[] };
  lowerCols: Column[];
  entranceCols: Column[];
  regions: {
    /** Lower slab on grade inside the retaining walls. */
    lowerSlab: Region;
    /** Lower-floor ceiling = suspended entrance slab + terrace slab. */
    ceiling: Region;
    susp: Region;
    terrace: Region;
    grade: Region;
    roof: Region;
  };
  /** Slab outlines above each level (for starter bars). */
  above: { lower: Vec2[][]; entrance: Vec2[][] };
  y: {
    lowerTop: number;
    lowerBottom: number;
    wallTopLower: number;
    entranceTop: (p: Vec2) => number;
    entranceBottom: (p: Vec2) => number;
    gradeTop: number;
    gradeBottom: number;
    voidBottom: number;
    roofTop: number;
    roofBottom: number;
    wallTopEntrance: number;
  };
  /** Ground after the backfill (p4-backfill → until p12). */
  backfill: TerrainGrid;
  /** Floor height under a point for props/braces at the lower level (slab or ground). */
  lowerFloorAt: (p: Vec2) => number;
  /** Floor height on the entrance level (slabs), else null. */
  entranceFloorAt: (p: Vec2) => number | null;
}

const frames = new WeakMap<BuildContext, StructureFrame>();

export function structureFrame(ctx: BuildContext): StructureFrame {
  const hit = frames.get(ctx);
  if (hit) return hit;
  const h = ctx.house;
  const slab = (lvl: string, role: string) => h.slabs.find((s) => s.level === lvl && s.role === role);
  const lower = slab('lower', 'ground');
  const susp = slab('entrance', 'suspended');
  const terrace = h.slabs.find((s) => s.role === 'terrace');
  const grade = slab('entrance', 'ground');
  const roof = h.slabs.find((s) => s.role === 'roof');
  const lowerTop = lower?.topY ?? ctx.lower.floorY - 0.08;
  const lowerBottom = lowerTop - (lower?.thickness ?? 0.2);
  const wallTopLower = Math.max(...h.walls.filter((w) => w.level === 'lower').map((w) => w.baseY + w.height));
  const wallTopEntrance = Math.max(...h.walls.filter((w) => w.level === 'entrance' && w.role !== 'parapet').map((w) => w.baseY + w.height));
  const floorOf = (w: Wall) => (w.level === 'lower' ? ctx.lower.floorY : w.level === 'entrance' ? ctx.entrance.floorY : ctx.roof.floorY);
  const lowerWalls = concretePieces(
    h.walls.filter((w) => w.level === 'lower' && w.material === 'concrete'),
    h.openings,
    floorOf,
    () => ctx.y.lowerBeamTop,
  );
  const entranceWalls = concretePieces(
    h.walls.filter((w) => w.level === 'entrance' && w.material === 'concrete' && w.role !== 'parapet'),
    h.openings,
    floorOf,
  );
  const castRectsLower = lowerWalls.cast.map((p) => pieceRect(p));
  const outlines = (s?: Slab) => (s ? [s.outline] : []);
  const regions = {
    lowerSlab: Region.of(outlines(lower), castRectsLower),
    ceiling: Region.of([...outlines(susp), ...outlines(terrace)]),
    susp: Region.of(outlines(susp)),
    terrace: Region.of(outlines(terrace)),
    grade: Region.of(outlines(grade)),
    roof: Region.of(outlines(roof)),
  };
  const inTerrace = (p: Vec2) => !!terrace && pointInPolygon(p, terrace.outline) && !(susp && pointInPolygon(p, susp.outline));
  const entranceTop = (p: Vec2) => (inTerrace(p) ? terrace?.topY ?? -0.12 : susp?.topY ?? -0.08);
  const entranceBottom = (p: Vec2) => entranceTop(p) - (inTerrace(p) ? terrace?.thickness ?? 0.25 : susp?.thickness ?? 0.25);
  const gradeTop = grade?.topY ?? -0.08;
  const gradeBottom = gradeTop - (grade?.thickness ?? 0.25);
  const voidBottom = gradeBottom - 0.15;
  const roofTop = roof?.topY ?? ctx.roof.floorY;
  const roofBottom = roofTop - (roof?.thickness ?? 0.25);

  // --- backfill: behind the retaining walls + under the entrance ground slab (up to the
  // void formers) + around the entrance platform up to min(natural, finished). The lower
  // pit on the garden side stays open until landscaping.
  const fpLower = ctx.footprint.lower;
  const gradePoly = grade?.outline ?? [];
  const stairs = h.stairs.map((s) => s.footprint);
  const { natural, finished, excavated } = ctx.terrain;
  const houseBox = bboxOf(ctx.footprint.house, 0.7);
  const backfill = mapGrid(excavated, (x, z, e) => {
    const p: Vec2 = [x, z];
    const near = inBox(p, houseBox);
    if (near && pointInPolygon(p, fpLower)) return e;
    if (near && stairs.some((s) => pointInPolygon(p, s))) return e;
    if (near && gradePoly.length && pointInPolygon(p, gradePoly)) return Math.max(e, voidBottom);
    if (e < ctx.y.platform - 0.05) return e;
    let target = Math.min(sampleGrid(natural, x, z), sampleGrid(finished, x, z));
    if (near && distanceOutside(p, ctx.footprint.house) < 0.6) target = Math.min(target, gradeTop - 0.04);
    return Math.max(e, target);
  });

  const lowerSlabRegion = regions.lowerSlab;
  const lowerFloorAt = (p: Vec2) => (lowerSlabRegion.contains(p) ? lowerTop : sampleGrid(backfill, p[0], p[1]));
  const entranceFloorAt = (p: Vec2): number | null => {
    if (regions.susp.contains(p)) return susp?.topY ?? -0.08;
    if (regions.grade.contains(p)) return gradeTop;
    if (regions.terrace.contains(p)) return terrace?.topY ?? -0.12;
    return null;
  };
  const fr: StructureFrame = {
    slabs: { lower, susp, terrace, grade, roof },
    lowerWalls,
    entranceWalls,
    lowerCols: h.columns.filter((c) => c.level === 'lower'),
    entranceCols: h.columns.filter((c) => c.level === 'entrance'),
    regions,
    above: {
      lower: [...outlines(susp), ...outlines(terrace), ...outlines(grade)],
      entrance: outlines(roof),
    },
    y: {
      lowerTop,
      lowerBottom,
      wallTopLower,
      entranceTop,
      entranceBottom,
      gradeTop,
      gradeBottom,
      voidBottom,
      roofTop,
      roofBottom,
      wallTopEntrance,
    },
    backfill,
    lowerFloorAt,
    entranceFloorAt,
  };
  frames.set(ctx, fr);
  return fr;
}
