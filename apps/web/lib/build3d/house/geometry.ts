/**
 * Pure geometry helpers over the house model (no three.js): wall frames and pieces
 * around openings, polygon utilities, terrain sampling/resampling, excavation grids,
 * footprints and grade-beam junction cleanup. Model frame: meters, +X right, +Z toward
 * the street, +Y up. Rotation convention matches three.js: rotY rotates +X toward −Z.
 */
import type { HouseModel, LevelId, Opening, TerrainGrid, Vec2, Vec3, Wall } from './types';

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

export const add2 = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale2 = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot2 = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const cross2 = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
export const len2 = (a: Vec2) => Math.hypot(a[0], a[1]);
export const dist2 = (a: Vec2, b: Vec2) => {
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  return Math.sqrt(dx * dx + dz * dz);
};
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export function norm2(a: Vec2): Vec2 {
  const l = len2(a) || 1;
  return [a[0] / l, a[1] / l];
}
/** three.js rotation.y that maps local +X onto direction d (XZ). */
export const angleOfDir = (d: Vec2) => Math.atan2(-d[1], d[0]);
/** Direction rotated +90° about +Y (three.js convention): (dx, dz) -> (dz, -dx). */
export const perp2 = (d: Vec2): Vec2 => [d[1], -d[0]];

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

export interface WallFrame {
  /** Unit direction a -> b. */
  dir: Vec2;
  /** Unit normal (dir rotated +90° about +Y). */
  normal: Vec2;
  length: number;
  mid: Vec2;
  /** rotY for boxes aligned with the wall. */
  rotY: number;
}

export function wallFrame(w: { a: Vec2; b: Vec2 }): WallFrame {
  const d = sub2(w.b, w.a);
  const length = len2(d);
  const dir = norm2(d);
  return { dir, normal: perp2(dir), length, mid: lerp2(w.a, w.b, 0.5), rotY: angleOfDir(dir) };
}

/** Point along the wall centerline at distance s from a, shifted n along the normal. */
export function wallPoint(w: { a: Vec2; b: Vec2 }, s: number, n = 0): Vec2 {
  const f = wallFrame(w);
  return [w.a[0] + f.dir[0] * s + f.normal[0] * n, w.a[1] + f.dir[1] * s + f.normal[1] * n];
}

/** A solid rectangle of wall in wall coordinates: s along the wall from a, y absolute. */
export interface WallPiece {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

/**
 * Splits a wall into solid pieces around its openings (full-height strips between
 * openings, plus sill and head pieces). `floorY` is the level's finished floor that
 * opening sill/head heights refer to.
 */
export function wallPieces(wall: Wall, openings: Opening[], floorY: number): WallPiece[] {
  const L = wallFrame(wall).length;
  const y0 = wall.baseY;
  const y1 = wall.baseY + wall.height;
  const ops = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      s0: Math.max(0, o.offset - o.width / 2),
      s1: Math.min(L, o.offset + o.width / 2),
      sill: floorY + o.sill,
      head: Math.min(y1, floorY + o.head),
    }))
    .filter((o) => o.s1 - o.s0 > 0.05)
    .sort((a, b) => a.s0 - b.s0);
  const out: WallPiece[] = [];
  let s = 0;
  for (const o of ops) {
    if (o.s0 > s + 0.01) out.push({ s0: s, s1: o.s0, y0, y1 });
    if (o.sill > y0 + 0.01) out.push({ s0: o.s0, s1: o.s1, y0, y1: o.sill });
    if (o.head < y1 - 0.01) out.push({ s0: o.s0, s1: o.s1, y0: o.head, y1 });
    s = Math.max(s, o.s1);
  }
  if (L > s + 0.01) out.push({ s0: s, s1: L, y0, y1 });
  return out;
}

/** World box (center, size, rotY) of a wall piece; `extraT` thickens the wall. */
export function pieceBox(
  wall: { a: Vec2; b: Vec2; thickness: number },
  p: WallPiece,
  extraT = 0,
): { at: Vec3; size: Vec3; rotY: number } {
  const f = wallFrame(wall);
  const c = wallPoint(wall, (p.s0 + p.s1) / 2);
  return {
    at: [c[0], (p.y0 + p.y1) / 2, c[1]],
    size: [p.s1 - p.s0, p.y1 - p.y0, wall.thickness + extraT],
    rotY: f.rotY,
  };
}

// ---------------------------------------------------------------------------
// Polygons (XZ)
// ---------------------------------------------------------------------------

/** Signed area (shoelace on x,z). */
export function polygonSignedArea(p: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
export const polygonArea = (p: Vec2[]) => Math.abs(polygonSignedArea(p));

export interface BBox2 {
  min: Vec2;
  max: Vec2;
}
export function bbox2(points: Vec2[]): BBox2 {
  const min: Vec2 = [Infinity, Infinity];
  const max: Vec2 = [-Infinity, -Infinity];
  for (const p of points) {
    min[0] = Math.min(min[0], p[0]);
    min[1] = Math.min(min[1], p[1]);
    max[0] = Math.max(max[0], p[0]);
    max[1] = Math.max(max[1], p[1]);
  }
  return { min, max };
}

export function polygonCentroid(p: Vec2[]): Vec2 {
  const A = polygonSignedArea(p);
  if (Math.abs(A) < 1e-9) {
    const b = bbox2(p);
    return lerp2(b.min, b.max, 0.5);
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const k = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * k;
    cz += (a[1] + b[1]) * k;
  }
  return [cx / (6 * A), cz / (6 * A)];
}

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  // Hot path (terrain grids, rasters): no destructuring / allocation.
  const x = pt[0];
  const z = pt[1];
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    const zi = pi[1];
    const zj = pj[1];
    if (zi > z !== zj > z) {
      const xi = pi[0];
      if (x < ((pj[0] - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = p[0] - a[0] - abx * t;
  const dz = p[1] - a[1] - abz * t;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Distance to the polygon boundary. */
export function distanceToEdges(p: Vec2, poly: Vec2[]): number {
  let d = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const s = distanceToSegment(p, poly[i], poly[i + 1 === n ? 0 : i + 1]);
    if (s < d) d = s;
  }
  return d;
}

/** Signed distance: negative inside, positive outside. */
export function signedDistance(p: Vec2, poly: Vec2[]): number {
  const d = distanceToEdges(p, poly);
  return pointInPolygon(p, poly) ? -d : d;
}

/** Distance outside the polygon (0 inside). */
export const distanceOutside = (p: Vec2, poly: Vec2[]) => Math.max(0, signedDistance(p, poly));

/** Miter offset; d > 0 grows the polygon, d < 0 insets it. Fine for footprints. */
export function offsetPolygon(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  if (n < 3 || d === 0) return poly.map((p) => [p[0], p[1]] as Vec2);
  const sign = polygonSignedArea(poly) > 0 ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const e0 = norm2(sub2(p1, p0));
    const e1 = norm2(sub2(p2, p1));
    // Outward normal for a positive-area polygon is (ez, -ex).
    const n0: Vec2 = [e0[1] * sign, -e0[0] * sign];
    const n1: Vec2 = [e1[1] * sign, -e1[0] * sign];
    const bis = norm2(add2(n0, n1));
    const cos = dot2(bis, n1);
    const m = Math.abs(cos) < 0.25 ? d / 0.25 : d / cos;
    out.push([p1[0] + bis[0] * m, p1[1] + bis[1] * m]);
  }
  return out;
}

/** Points along a closed polygon every `step` meters (vertices included). */
export function samplePolygon(poly: Vec2[], step: number, closed = true): Vec2[] {
  const out: Vec2[] = [];
  const n = closed ? poly.length : poly.length - 1;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const L = dist2(a, b);
    const k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) out.push(lerp2(a, b, j / k));
  }
  if (!closed) out.push(poly[poly.length - 1]);
  return out;
}

/** Douglas–Peucker simplification of a closed ring. */
export function simplifyRing(ring: Vec2[], tol: number): Vec2[] {
  if (ring.length < 4) return ring;
  const rdp = (pts: Vec2[]): Vec2[] => {
    if (pts.length < 3) return pts;
    let idx = -1;
    let dmax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distanceToSegment(pts[i], pts[0], pts[pts.length - 1]);
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (dmax <= tol) return [pts[0], pts[pts.length - 1]];
    const l = rdp(pts.slice(0, idx + 1));
    const r = rdp(pts.slice(idx));
    return [...l.slice(0, -1), ...r];
  };
  // Split at the vertex farthest from vertex 0 so both halves are open chains.
  let far = 0;
  let fd = 0;
  ring.forEach((p, i) => {
    const d = dist2(p, ring[0]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  });
  const a = rdp(ring.slice(0, far + 1));
  const b = rdp([...ring.slice(far), ring[0]]);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : ring;
}

/**
 * Union of polygons as ONE outer ring (largest region), via rasterization at `res`
 * meters + boundary tracing + simplification. Robust for footprints made of
 * touching slabs/rooms.
 */
export function unionOutline(polys: Vec2[][], res = 0.05): Vec2[] {
  const all = polys.flat();
  if (!all.length) return [];
  const b = bbox2(all);
  const x0 = b.min[0] - res * 2;
  const z0 = b.min[1] - res * 2;
  const W = Math.ceil((b.max[0] - x0) / res) + 3;
  const H = Math.ceil((b.max[1] - z0) / res) + 3;
  const filled = new Uint8Array(W * H);
  // Scanline fill (even-odd per polygon, same rule as pointInPolygon at cell centers).
  const xs: number[] = [];
  for (let j = 0; j < H; j++) {
    const z = z0 + (j + 0.5) * res;
    for (const poly of polys) {
      xs.length = 0;
      for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
        const zi = poly[i][1];
        const zk = poly[k][1];
        if (zi > z !== zk > z) xs.push(((poly[k][0] - poly[i][0]) * (z - zi)) / (zk - zi) + poly[i][0]);
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const ia = Math.max(0, Math.ceil((xs[q] - x0) / res - 0.5));
        const ib = Math.min(W - 1, Math.ceil((xs[q + 1] - x0) / res - 0.5) - 1);
        for (let i = ia; i <= ib; i++) filled[j * W + i] = 1;
      }
    }
  }
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < W && j < H ? filled[j * W + i] : 0);
  // Directed boundary edges between grid corners, filled cell on a consistent side.
  const next = new Map<number, number[]>();
  const key = (i: number, j: number) => j * (W + 1) + i;
  const addEdge = (a: number, b2: number) => {
    const l = next.get(a);
    if (l) l.push(b2);
    else next.set(a, [b2]);
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) addEdge(key(i, j), key(i + 1, j));
      if (!at(i + 1, j)) addEdge(key(i + 1, j), key(i + 1, j + 1));
      if (!at(i, j + 1)) addEdge(key(i + 1, j + 1), key(i, j + 1));
      if (!at(i - 1, j)) addEdge(key(i, j + 1), key(i, j));
    }
  }
  let best: Vec2[] = [];
  let bestArea = 0;
  while (next.size) {
    const startKey = next.keys().next().value as number;
    const ring: Vec2[] = [];
    let k = startKey;
    for (let guard = 0; guard < 1e6; guard++) {
      const l = next.get(k);
      if (!l || !l.length) break;
      const nk = l.pop() as number;
      if (!l.length) next.delete(k);
      ring.push([x0 + (k % (W + 1)) * res, z0 + Math.floor(k / (W + 1)) * res]);
      k = nk;
      if (k === startKey) break;
    }
    const a = polygonArea(ring);
    if (a > bestArea) {
      bestArea = a;
      best = ring;
    }
  }
  return simplifyRing(best, res * 1.2);
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

export function gridBounds(g: TerrainGrid): BBox2 {
  return {
    min: [g.origin[0], g.origin[1]],
    max: [g.origin[0] + (g.cols - 1) * g.cell, g.origin[1] + (g.rows - 1) * g.cell],
  };
}

/** Bilinear height at (x, z); clamps outside the grid. */
export function sampleGrid(g: TerrainGrid, x: number, z: number): number {
  const fx = Math.min(g.cols - 1, Math.max(0, (x - g.origin[0]) / g.cell));
  const fz = Math.min(g.rows - 1, Math.max(0, (z - g.origin[1]) / g.cell));
  const c0 = Math.min(g.cols - 2, Math.floor(fx));
  const r0 = Math.min(g.rows - 2, Math.floor(fz));
  const tx = fx - c0;
  const tz = fz - r0;
  const h = g.heights;
  const i = r0 * g.cols + c0;
  const a = h[i] + (h[i + 1] - h[i]) * tx;
  const b = h[i + g.cols] + (h[i + g.cols + 1] - h[i + g.cols]) * tx;
  return a + (b - a) * tz;
}

/** Same extent at a finer/coarser cell size (bilinear). */
export function resampleGrid(g: TerrainGrid, cell: number): TerrainGrid {
  const b = gridBounds(g);
  const cols = Math.floor((b.max[0] - b.min[0]) / cell + 1e-6) + 1;
  const rows = Math.floor((b.max[1] - b.min[1]) / cell + 1e-6) + 1;
  const heights = new Array<number>(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) heights[r * cols + c] = sampleGrid(g, b.min[0] + c * cell, b.min[1] + r * cell);
  return { origin: [b.min[0], b.min[1]], cell, cols, rows, heights };
}

/** New grid with heights = fn(x, z, h). */
export function mapGrid(g: TerrainGrid, fn: (x: number, z: number, h: number) => number): TerrainGrid {
  const heights = new Array<number>(g.heights.length);
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c;
      heights[i] = fn(g.origin[0] + c * g.cell, g.origin[1] + r * g.cell, g.heights[i]);
    }
  return { ...g, heights };
}

export function gridMin(g: TerrainGrid): number {
  let m = Infinity;
  for (const h of g.heights) m = Math.min(m, h);
  return m;
}
export function gridMax(g: TerrainGrid): number {
  let m = -Infinity;
  for (const h of g.heights) m = Math.max(m, h);
  return m;
}

/**
 * A cut: ground is lowered to `y` inside `polygon` (+ flat `margin` of working
 * space) and rises outside at `slope` (vertical per horizontal; 1 = 1:1) until it
 * meets the existing ground. Points inside a `shield` (polygon grown by its margin,
 * and farther than `gap` from the cut polygon) ignore this cut, which leaves a
 * steep cut face toward the shielded area (rock cut next to a higher platform).
 */
export interface CutSpec {
  polygon: Vec2[];
  y: number;
  margin: number;
  slope: number;
  shield?: { polygon: Vec2[]; margin: number; gap: number };
}

export function excavate(ground: TerrainGrid, cuts: CutSpec[]): TerrainGrid {
  const boxes = cuts.map((c) => bbox2(c.polygon));
  return mapGrid(ground, (x, z, h) => {
    let out = h;
    for (let k = 0; k < cuts.length; k++) {
      const c = cuts[k];
      // Distance to the bbox is a lower bound of the distance to the polygon: if even that
      // leaves the cut above the ground here, skip the exact (costly) test.
      const b = boxes[k];
      const bx = Math.max(b.min[0] - x, 0, x - b.max[0]);
      const bz = Math.max(b.min[1] - z, 0, z - b.max[1]);
      if (c.y + Math.max(0, Math.sqrt(bx * bx + bz * bz) - c.margin) * c.slope >= out) continue;
      const d = distanceOutside([x, z], c.polygon);
      if (c.shield && d > c.shield.gap && signedDistance([x, z], c.shield.polygon) < c.shield.margin) continue;
      out = Math.min(out, c.y + Math.max(0, d - c.margin) * c.slope);
    }
    return out;
  });
}

/**
 * Fill: ground is raised to `y` inside `polygon` (+ margin), sloping down outside at
 * `slope` until it meets the existing ground (backfill, platforms).
 */
export function fill(ground: TerrainGrid, polygon: Vec2[], y: number, margin = 0, slope = 1): TerrainGrid {
  return mapGrid(ground, (x, z, h) => {
    const d = distanceOutside([x, z], polygon);
    return Math.max(h, y - Math.max(0, d - margin) * slope);
  });
}

/** Volume between two grids of the same layout where a > b (m³). */
export function volumeBetween(a: TerrainGrid, b: TerrainGrid): number {
  let v = 0;
  for (let i = 0; i < a.heights.length; i++) v += Math.max(0, a.heights[i] - b.heights[i]);
  return v * a.cell * a.cell;
}

// ---------------------------------------------------------------------------
// Footprints & levels
// ---------------------------------------------------------------------------

export function levelOf(house: HouseModel, id: LevelId) {
  const l = house.levels.find((x) => x.id === id);
  if (!l) throw new Error(`level ${id} missing`);
  return l;
}

/** Outline of a level's floor: union of its slabs, else bbox of its walls. */
export function levelFootprint(house: HouseModel, id: Exclude<LevelId, 'roof'>): Vec2[] {
  const slabs = house.slabs.filter((s) => s.level === id && s.role !== 'balcony');
  if (slabs.length === 1) return slabs[0].outline;
  if (slabs.length > 1) return unionOutline(slabs.map((s) => s.outline), 0.08);
  const pts = house.walls.filter((w) => w.level === id).flatMap((w) => [w.a, w.b]);
  if (!pts.length) return [];
  const b = bbox2(pts);
  return [
    [b.min[0], b.min[1]],
    [b.max[0], b.min[1]],
    [b.max[0], b.max[1]],
    [b.min[0], b.max[1]],
  ];
}

/** Whole-house outline (all floors seen from above). */
export function houseFootprint(house: HouseModel): Vec2[] {
  const polys = house.slabs.filter((s) => s.role !== 'balcony').map((s) => s.outline);
  if (polys.length) return unionOutline(polys, 0.08);
  return levelFootprint(house, 'entrance');
}

// ---------------------------------------------------------------------------
// Segments (beams under walls)
// ---------------------------------------------------------------------------

export interface Seg {
  a: Vec2;
  b: Vec2;
  /** Width (m). */
  w: number;
  /** Source ids (walls). */
  refs: string[];
}

/** Merges collinear, touching/overlapping segments of equal width. */
export function mergeCollinear(segs: Seg[], tol = 0.05): Seg[] {
  const out = segs.map((s) => ({ ...s, refs: [...s.refs] }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const A = out[i];
        const B = out[j];
        if (Math.abs(A.w - B.w) > 0.02) continue;
        const d = norm2(sub2(A.b, A.a));
        const e = norm2(sub2(B.b, B.a));
        if (Math.abs(cross2(d, e)) > 0.02) continue;
        // Same line?
        if (Math.abs(cross2(d, sub2(B.a, A.a))) > tol) continue;
        const t = (p: Vec2) => dot2(sub2(p, A.a), d);
        const ta = [0, t(A.b)];
        const tb = [t(B.a), t(B.b)].sort((x, y) => x - y);
        if (tb[0] > ta[1] + tol || tb[1] < ta[0] - tol) continue;
        const t0 = Math.min(ta[0], tb[0]);
        const t1 = Math.max(ta[1], tb[1]);
        out[i] = { a: add2(A.a, scale2(d, t0)), b: add2(A.a, scale2(d, t1)), w: A.w, refs: [...A.refs, ...B.refs] };
        out.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return out;
}

/**
 * Trims/extends segment ends so rectangles of width w butt cleanly at L and T
 * junctions (no overlapping boxes → no z-fighting or stray outline edges).
 */
export function resolveJunctions(segs: Seg[], tol = 0.08): Seg[] {
  const out = segs.map((s) => ({ ...s, a: [...s.a] as Vec2, b: [...s.b] as Vec2 }));
  for (let i = 0; i < segs.length; i++) {
    for (const end of ['a', 'b'] as const) {
      const E = segs[i][end];
      const other = end === 'a' ? segs[i].b : segs[i].a;
      const u = norm2(sub2(E, other));
      let bestJ = -1;
      let bestD = Infinity;
      for (let j = 0; j < segs.length; j++) {
        if (j === i) continue;
        const S = segs[j];
        const dj = norm2(sub2(S.b, S.a));
        if (Math.abs(cross2(u, dj)) < 0.3) continue;
        const d = distanceToSegment(E, S.a, S.b);
        if (d < S.w / 2 + tol && d < bestD) {
          bestD = d;
          bestJ = j;
        }
      }
      if (bestJ < 0) continue;
      const S = segs[bestJ];
      const nS = perp2(norm2(sub2(S.b, S.a)));
      const k = dot2(u, nS);
      if (Math.abs(k) < 0.3) continue;
      const isCorner = Math.min(dist2(E, S.a), dist2(E, S.b)) < segs[i].w / 2 + tol;
      // Travel along u from E to S's centerline, then ± half of S's width (along u).
      const along = -dot2(sub2(E, S.a), nS) / k;
      const half = S.w / 2 / Math.abs(k);
      const delta = isCorner && i < bestJ ? along + half : along - half;
      out[i][end] = add2(E, scale2(u, delta));
    }
  }
  return out.filter((s) => dist2(s.a, s.b) > 0.05);
}

/** Points along a segment every ≤ maxSpacing (ends included). */
export function pointsAlong(a: Vec2, b: Vec2, maxSpacing: number): Vec2[] {
  const n = Math.max(1, Math.ceil(dist2(a, b) / maxSpacing));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push(lerp2(a, b, i / n));
  return out;
}

/** Greedy de-duplication: points closer than r merge into their average. */
export function dedupePoints(pts: Vec2[], r: number): Vec2[] {
  const groups: { sum: Vec2; n: number }[] = [];
  for (const p of pts) {
    const g = groups.find((q) => dist2(scale2(q.sum, 1 / q.n), p) < r);
    if (g) {
      g.sum = add2(g.sum, p);
      g.n += 1;
    } else groups.push({ sum: [p[0], p[1]], n: 1 });
  }
  return groups.map((g) => scale2(g.sum, 1 / g.n));
}

/** Deterministic PRNG (mulberry32) for scattering bushes/rocks. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sutherland–Hodgman clip of a polygon against a convex polygon (any winding). */
export function clipPolygonConvex(subject: Vec2[], clip: Vec2[]): Vec2[] {
  if (subject.length < 3 || clip.length < 3) return [];
  const sign = polygonSignedArea(clip) > 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p: Vec2) => sign * cross2(sub2(b, a), sub2(p, a)) >= -1e-9;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j - 1 + input.length) % input.length];
      const cin = inside(cur);
      const pin = inside(prev);
      if (cin !== pin) {
        const d = sub2(cur, prev);
        const e = sub2(b, a);
        const den = cross2(d, e);
        if (Math.abs(den) > 1e-12) {
          const t = cross2(sub2(a, prev), e) / den;
          out.push([prev[0] + d[0] * t, prev[1] + d[1] * t]);
        }
      }
      if (cin) out.push(cur);
    }
  }
  return out;
}

/** Clip a polygon to an axis-aligned rectangle. */
export function clipPolygonToRect(poly: Vec2[], min: Vec2, max: Vec2): Vec2[] {
  return clipPolygonConvex(poly, [
    [min[0], min[1]],
    [max[0], min[1]],
    [max[0], max[1]],
    [min[0], max[1]],
  ]);
}

/**
 * Extends/shortens segment ends along their own direction onto the nearest
 * non-parallel target centerline within `maxGap` (closes gaps at columns and wall
 * faces before resolveJunctions trims to clean butt joints).
 */
export function snapEnds(segs: Seg[], targets: Seg[], maxGap: number): Seg[] {
  return segs.map((s) => {
    const out: Seg = { ...s, a: [s.a[0], s.a[1]], b: [s.b[0], s.b[1]] };
    for (const end of ['a', 'b'] as const) {
      const E = s[end];
      const other = end === 'a' ? s.b : s.a;
      const u = norm2(sub2(E, other));
      let best = Infinity;
      let bestP: Vec2 | null = null;
      for (const t of targets) {
        if (t === s || (t.a === s.a && t.b === s.b)) continue;
        const e = sub2(t.b, t.a);
        const den = cross2(u, e);
        if (Math.abs(den) < 0.5 * len2(e)) continue; // near-parallel
        const w = sub2(t.a, E);
        const lam = cross2(w, e) / den;
        const mu = cross2(w, u) / den;
        if (lam < -0.35 || lam > maxGap || mu < -0.08 || mu > 1.08) continue;
        if (Math.abs(lam) < Math.abs(best)) {
          best = lam;
          bestP = add2(E, scale2(u, lam));
        }
      }
      if (bestP) out[end] = bestP;
    }
    return out;
  });
}
