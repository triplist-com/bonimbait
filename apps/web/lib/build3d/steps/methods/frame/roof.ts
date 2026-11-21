/**
 * Framed roof for the steel / timber methods: the ממ״ד keeps a cast-in-place concrete ceiling
 * slab (Home Front Command), the rest of the roof outline (the same outline as the concrete roof
 * slab, incl. the porch canopy) gets joists @ 60 / 40 cm between rim joists, a flush girder on the
 * interior bearing line, mid-span blocking, a 22 mm deck (cement board / OSB) with edge closures,
 * and later gypsum ceiling boards under the joists. Top of deck = top of the concrete roof slab,
 * so phase 8 (insulation, membrane, coat) sits on it unchanged.
 */
import { offsetPolygon, unionOutline } from '../../../house/geometry';
import type { Vec2, Vec3 } from '../../../house/types';
import type { PrimitiveShape } from '../../../engine/types';
import type { BuildContext } from '../../context';
import { Region, structureFrame, wallRect, type FaceEdge, type Rect2 } from '../../structure-kit';
import type { Box, Inst } from './walls';
import type { FrameSpec } from './spec';

export interface RoofFrame {
  /** ממ״ד ceiling slab footprint (room + its walls). */
  mamad: Region;
  mamadOutline: Vec2[];
  /** Framed roof area (roof outline minus the ממ״ד slab). */
  framed: Region;
  y0: number;
  y1: number;
  /** Joist depth (bottom on the top plates, deck on top). */
  depth: number;
  deckT: number;
  girderX: number;
}

const cache = new WeakMap<BuildContext, RoofFrame>();

export function roofFrame(ctx: BuildContext): RoofFrame {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const fr = structureFrame(ctx);
  const roofOutline = fr.slabs.roof?.outline ?? ctx.footprint.entrance;
  const mamadWalls = ctx.house.walls.filter((w) => w.role === 'mamad');
  const room = ctx.house.rooms.find((r) => r.kind === 'mamad');
  const polys = [...mamadWalls.map((w) => wallRect(w)), ...(room ? [room.polygon] : [])];
  const mamad = Region.of(polys);
  const framed = Region.of([roofOutline], polys);
  const y1 = fr.y.roofTop;
  const y0 = fr.y.wallTopEntrance;
  const deckT = 0.022;
  // Girder on the interior bearing line x ≈ 5.45 (partition + posts under it), when it crosses the roof.
  const girderX = 5.45;
  const rf: RoofFrame = { mamad, mamadOutline: unionOutline(polys, 0.05), framed, y0, y1, depth: y1 - y0 - deckT, deckT, girderX };
  cache.set(ctx, rf);
  return rf;
}

export interface JoistSet {
  /** Steel: C-joist instances; timber: I-joist flanges (boxes) + webs. */
  cJoists: Inst[];
  flanges: Box[];
  webs: Box[];
  rims: Box[];
  girder: Box[];
  blocking: Box[];
  hangers: Box[];
  /** Running meters. */
  joistM: number;
  rimM: number;
  girderM: number;
  count: number;
}

/** Horizontal C-joist, x 0..1 (scaled to length), y 0..depth, flange width b. */
export function cJoist(depth: number, b: number): PrimitiveShape {
  const T = 0.004;
  const box = (size: Vec3, at: Vec3): PrimitiveShape => ({ kind: 'box', size, at });
  return {
    kind: 'merge',
    shapes: [
      box([1, depth, T], [0.5, depth / 2, -b / 2 + T / 2]),
      box([1, T, b], [0.5, depth - T / 2, 0]),
      box([1, T, b], [0.5, T / 2, 0]),
      box([1, 0.018, T], [0.5, depth - 0.009, b / 2 - T / 2]),
      box([1, 0.018, T], [0.5, 0.009, b / 2 - T / 2]),
    ],
  };
}

export function joists(ctx: BuildContext, spec: FrameSpec): JoistSet {
  const rf = roofFrame(ctx);
  const reg = rf.framed;
  const steel = spec.method === 'steel';
  const D = rf.depth;
  const y0 = rf.y0;
  const rimT = steel ? 0.045 : 0.038;
  const jw = steel ? 0.05 : 0.064;
  const gw = steel ? 0.12 : 0.14;
  const out: JoistSet = { cJoists: [], flanges: [], webs: [], rims: [], girder: [], blocking: [], hangers: [], joistM: 0, rimM: 0, girderM: 0, count: 0 };

  // Rim joists / rim tracks along every boundary edge of the framed area.
  for (const e of reg.edges()) {
    const c: Vec2 = [(e.a[0] + e.b[0]) / 2 - e.n[0] * (rimT / 2), (e.a[1] + e.b[1]) / 2 - e.n[1] * (rimT / 2)];
    const alongX = Math.abs(e.u[0]) > 0.5;
    out.rims.push({ at: [c[0], y0 + D / 2, c[1]], size: alongX ? [e.len, D, rimT] : [rimT, D, e.len], rotY: 0 });
    out.rimM += e.len;
  }

  // Girder (flush beam) along Z where it crosses the framed area.
  const gx = rf.girderX;
  const gIntervals = reg.intervals('z', gx).filter(([a, b]) => b - a > 2);
  for (const [a, b] of gIntervals) {
    const z0 = a + rimT;
    const z1 = b - rimT;
    out.girder.push({ at: [gx, y0 + D / 2, (z0 + z1) / 2], size: [gw, D, z1 - z0], rotY: 0 });
    out.girderM += z1 - z0;
  }
  const onGirder = (z: number) => gIntervals.some(([a, b]) => z > a + rimT && z < b - rimT);

  // Joists along X.
  const bb = { z0: reg.zs[0], z1: reg.zs[reg.nz] };
  const lines: Array<{ z: number; segs: Array<[number, number]> }> = [];
  const xEdges = reg.edges().filter((e) => Math.abs(e.u[0]) > 0.5);
  for (let z = bb.z0 + rimT + 0.3; z < bb.z1 - rimT - 0.05; z += spec.joistSpacing) {
    const segs: Array<[number, number]> = [];
    for (const [a, b] of reg.intervals('x', z)) {
      // Skip joists that would sit inside an edge rim running along X.
      if (Math.abs(z - nearestEdgeZ(xEdges, a, b, z)) < rimT + jw / 2) continue;
      const parts: Array<[number, number]> = [];
      if (onGirder(z) && gx > a + 0.3 && gx < b - 0.3) parts.push([a + rimT, gx - gw / 2], [gx + gw / 2, b - rimT]);
      else parts.push([a + rimT, b - rimT]);
      for (const [x0, x1] of parts) {
        if (x1 - x0 < 0.3) continue;
        segs.push([x0, x1]);
        out.count++;
        out.joistM += x1 - x0;
        if (steel) out.cJoists.push({ at: [x0, y0, z], rotY: 0, scale: [x1 - x0, 1, 1] });
        else {
          const fh = 0.045;
          out.flanges.push({ at: [(x0 + x1) / 2, y0 + fh / 2, z], size: [x1 - x0, fh, jw], rotY: 0 }, { at: [(x0 + x1) / 2, y0 + D - fh / 2, z], size: [x1 - x0, fh, jw], rotY: 0 });
          out.webs.push({ at: [(x0 + x1) / 2, y0 + D / 2, z], size: [x1 - x0 - 0.01, D - 2 * fh + 0.01, 0.011], rotY: 0 });
        }
        // Hangers / clip angles where a joist meets the girder.
        for (const xe of [x0, x1]) if (Math.abs(xe - (gx - gw / 2)) < 0.01 || Math.abs(xe - (gx + gw / 2)) < 0.01) {
          const sx = xe < gx ? -1 : 1;
          out.hangers.push({ at: [xe + sx * 0.025, y0 + D * 0.45, z], size: [0.05, D * 0.7, jw + 0.012], rotY: 0 });
        }
      }
    }
    lines.push({ z, segs });
  }

  // Mid-span blocking between neighbouring joists.
  for (let i = 0; i < lines.length - 1; i++) {
    const A = lines[i];
    const B = lines[i + 1];
    for (const [x0, x1] of A.segs) {
      const m = (x0 + x1) / 2;
      if (!B.segs.some(([a, b]) => m > a + 0.1 && m < b - 0.1)) continue;
      const za = A.z + jw / 2;
      const zb = B.z - jw / 2;
      if (zb - za < 0.05) continue;
      out.blocking.push({ at: [m, y0 + D / 2, (za + zb) / 2], size: [0.045, D - (steel ? 0.03 : 0.02), zb - za], rotY: 0 });
    }
  }
  return out;
}

/** Nearest z of a boundary edge running along X that bounds the [a, b] run (for rim clearance). */
function nearestEdgeZ(xEdges: FaceEdge[], a: number, b: number, z: number): number {
  let best = Infinity;
  for (const e of xEdges) {
    const ex0 = Math.min(e.a[0], e.b[0]);
    const ex1 = Math.max(e.a[0], e.b[0]);
    if (ex1 < a || ex0 > b) continue;
    if (Math.abs(e.a[1] - z) < Math.abs(best - z)) best = e.a[1];
  }
  return best;
}

/** Deck boards (staggered sheets, long side across the joists) + edge closures. */
export function deckBoards(ctx: BuildContext, spec: FrameSpec): { boards: Box[][]; edges: Box[]; area: number } {
  const rf = roofFrame(ctx);
  const reg = rf.framed;
  const bw = 1.2;
  const bl = 2.4;
  const x0 = reg.xs[0];
  const z0 = reg.zs[0];
  const yc = rf.y1 - rf.deckT / 2;
  const A = reg.sheets([bw, bl], [x0, z0]);
  const B = reg.sheets([bw, bl], [x0, z0 + bl / 2]);
  const col = (r: Rect2) => Math.floor(((r.x0 + r.x1) / 2 - x0) / bw);
  const boards: Box[][] = spec.deckColors.map(() => []);
  const g = 0.004;
  let k = 0;
  for (const r of [...A.filter((t) => col(t) % 2 === 0), ...B.filter((t) => col(t) % 2 === 1)]) {
    if (r.x1 - r.x0 < 0.02 || r.z1 - r.z0 < 0.02) continue;
    boards[k++ % boards.length].push({ at: [(r.x0 + r.x1) / 2, yc, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0 - g, rf.deckT, r.z1 - r.z0 - g], rotY: 0 });
  }
  // Edge closures: a thin galvanized angle along the outer roof edge.
  const edges: Box[] = [];
  const outer = Region.of([structureFrame(ctx).slabs.roof?.outline ?? ctx.footprint.entrance]);
  for (const e of outer.edges()) {
    const c: Vec2 = [(e.a[0] + e.b[0]) / 2 - e.n[0] * 0.002, (e.a[1] + e.b[1]) / 2 - e.n[1] * 0.002];
    const alongX = Math.abs(e.u[0]) > 0.5;
    edges.push({ at: [c[0], rf.y1 - 0.03, c[1]], size: alongX ? [e.len, 0.07, 0.004] : [0.004, 0.07, e.len], rotY: 0 });
  }
  return { boards, edges, area: reg.area };
}

/** Gypsum ceiling boards under the joists (inside the house + porch canopy), 10 mm under the plates. */
export function ceilingBoards(ctx: BuildContext): { items: Box[]; area: number } {
  const rf = roofFrame(ctx);
  const outline = structureFrame(ctx).slabs.roof?.outline ?? ctx.footprint.entrance;
  const mamadPolys = ctx.house.walls.filter((w) => w.role === 'mamad').map((w) => wallRect(w));
  const room = ctx.house.rooms.find((r) => r.kind === 'mamad');
  const reg = Region.of([offsetPolygon(outline, -0.04)], [...mamadPolys, ...(room ? [room.polygon] : [])]);
  const items: Box[] = [];
  const y = rf.y0 - 0.006;
  for (const r of reg.sheets([1.2, 2.4], [reg.xs[0], reg.zs[0]])) {
    if (r.x1 - r.x0 < 0.02 || r.z1 - r.z0 < 0.02) continue;
    items.push({ at: [(r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0 - 0.003, 0.0095, r.z1 - r.z0 - 0.003], rotY: 0 });
  }
  return { items, area: reg.area };
}

/** Mamad ceiling slab: props, deck, two-layer bar grid and the slab itself. */
export function mamadSlab(ctx: BuildContext) {
  const rf = roofFrame(ctx);
  const fr = structureFrame(ctx);
  const reg = rf.mamad;
  const y0 = rf.y0;
  const y1 = rf.y1;
  const room = ctx.house.rooms.find((r) => r.kind === 'mamad');
  const inner = room ? Region.of([room.polygon]) : reg;
  const deck: Box[] = inner.rects().map((r) => ({ at: [(r.x0 + r.x1) / 2, y0 - 0.0105, (r.z0 + r.z1) / 2] as Vec3, size: [r.x1 - r.x0 - 0.004, 0.021, r.z1 - r.z0 - 0.004] as Vec3, rotY: 0 }));
  const props: Array<{ a: Vec3; b: Vec3 }> = [];
  for (const r of inner.rects())
    for (let x = r.x0 + 0.45; x < r.x1 - 0.2; x += 1.1)
      for (let z = r.z0 + 0.45; z < r.z1 - 0.2; z += 1.1) {
        const fy = fr.entranceFloorAt([x, z]) ?? ctx.entrance.floorY - 0.08;
        props.push({ a: [x, fy, z], b: [x, y0 - 0.12, z] });
      }
  const heads: Box[] = [];
  for (const r of inner.rects())
    for (let x = r.x0 + 0.45; x < r.x1 - 0.2; x += 1.1) heads.push({ at: [x, y0 - 0.021 - 0.05, (r.z0 + r.z1) / 2], size: [0.08, 0.1, r.z1 - r.z0 - 0.1], rotY: 0 });
  const bars: Array<{ a: Vec3; b: Vec3 }> = [];
  let barM = 0;
  for (const yy of [y0 + 0.04, y1 - 0.04]) {
    for (const r of reg.rects()) {
      for (let x = r.x0 + 0.05; x < r.x1 - 0.04; x += 0.15) {
        bars.push({ a: [x, yy, r.z0 + 0.04], b: [x, yy, r.z1 - 0.04] });
        barM += r.z1 - r.z0 - 0.08;
      }
    }
    for (let z = reg.zs[0] + 0.05; z < reg.zs[reg.nz] - 0.04; z += 0.15)
      for (const [a, b] of reg.intervals('x', z)) {
        bars.push({ a: [a + 0.04, yy + 0.012, z], b: [b - 0.04, yy + 0.012, z] });
        barM += b - a - 0.08;
      }
  }
  return { deck, props, heads, bars, barM, outline: rf.mamadOutline, area: reg.area, m3: reg.area * (y1 - y0), y0, y1, innerArea: inner.area };
}

