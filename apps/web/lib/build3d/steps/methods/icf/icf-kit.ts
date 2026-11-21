/**
 * ICF kit (method "icf"): insulated concrete form walls built from the house walls.
 *
 * One "ICF band" = the exterior/retaining walls of a storey (or the parapets of a roof) plus the
 * columns that sit inside those wall lines. Its plan footprint R is the exact union of the wall and
 * column rectangles, so every EPS face stays on the house wall faces and the shared finishing skins
 * (plaster, render, stone) sit exactly where they sit in the concrete method.
 *
 *  - EPS faces: an inward band (EPS thickness) along every boundary face of R, cut into 1.2 × 0.4 m
 *    blocks in running bond (odd courses shifted half a block) with corner ownership alternating per
 *    course, so corners interlock; openings are cut out of the courses.
 *  - Core: R minus the EPS bands (with the opening edges as cut lines). Concrete fills it in lifts.
 *  - Webs (plastic ties across the core), rebar (vertical bars along the core centerlines with
 *    starters into the slab above, horizontal bars in the web saddles of every course, lintel bars over
 *    openings), timber bucks in the openings, and the steel alignment braces on the inner faces.
 *
 * Pure geometry (no three.js); everything repeated is returned as instanced items.
 */
import { angleOfDir, pointInPolygon, wallFrame, wallPieces, wallPoint, pieceBox } from '../../../house/geometry';
import type { Column, Opening, Wall } from '../../../house/types';
import type { Vec2, Vec3 } from '../../../engine/types';
import { rebarKg } from '../../kit';
import { Region, bandBox, columnRect, covered, divide, edgePoint, wallRect, type BoxItem, type FaceEdge, type RodItem } from '../../structure-kit';

// ---------------------------------------------------------------------------
// Constants (model + real-world quantities)
// ---------------------------------------------------------------------------

export const ICF = {
  /** Block face (m). */
  blockL: 1.2,
  blockH: 0.4,
  /** Modeled EPS face thickness: the plan's 20 cm walls read as 5 + 10 + 5 cm. */
  eps: 0.05,
  /** Gap between blocks so the joints read. */
  joint: 0.004,
  /** Real quantities for the bill (a typical Israeli ICF block: 2 × 6.5 cm EPS around a 15 cm core). */
  coreReal: 0.15,
  coreRetaining: 0.2,
  epsReal: 0.065,
  /** Timber buck section in openings. */
  buck: 0.045,
  /** Alignment brace spacing along a wall. */
  braceSpacing: 1.8,
  /** Pour lift height (one round around the house). */
  lift: 1.1,
} as const;

/** Light grey EPS (the palette "insulation" material, recolored). */
export const EPS_COLOR = '#E7E8E3';
export const WEB_COLOR = '#47525C';

/** 2026 ICF rates (ILS, ex-VAT), docs/build3d/methods-research.md § ICF. */
export const ICF_RATES = {
  /** EPS forms supplied + stacked, incl. corners, cutting and bucks material. */
  formM2: 260,
  /** Alignment/bracing system rental + erection + walk boards. */
  bracingM2: 40,
  /** Fine-aggregate, high-slump mix for ICF cores (on top of the B30 price). */
  mixExtraM3: 65,
  /** Pour crew + careful vibration, per m² of wall. */
  pourLaborM2: 45,
  /** Timber buck per opening (cut, fixed, braced). */
  buck: 180,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IcfHole {
  wall: Wall;
  opening: Opening;
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  /** Plan rect (full wall thickness) and world end points on the centerline. */
  rect: Vec2[];
  a: Vec2;
  b: Vec2;
}

export interface IcfLine {
  axis: 'x' | 'z';
  /** Line coordinate (z for 'x' lines, x for 'z' lines). */
  c: number;
  t0: number;
  t1: number;
  retaining: boolean;
}

export interface IcfSpec {
  key: string;
  walls: Wall[];
  cols: Column[];
  openings: Opening[];
  /** Bottom / top of the ICF (first course on the beam or slab, last course under the slab above). */
  y0: number;
  y1: number;
  /** Finished floor that opening sill/head heights refer to. */
  floorY: number;
  /** Bottom of door holes (the structural floor top); windows start at their sill. */
  doorY: number;
  /** Slab outlines above: vertical bars get starters there. */
  slabAbove: Vec2[][];
  starter?: number;
  /** Bottom of the vertical bars (default y0 + 5 cm; parapets: dowels down into the slab). */
  barBottom?: number;
  /** Footprint used to tell inner faces (braces) from outer faces. */
  inside: Vec2[];
  retaining?: Set<string>;
  lift?: number;
}

export interface IcfLayout {
  spec: IcfSpec;
  region: Region;
  core: Region;
  edges: FaceEdge[];
  courses: Array<[number, number]>;
  /** EPS face blocks per course. */
  eps: BoxItem[][];
  webs: BoxItem[];
  bucks: BoxItem[];
  buckBraces: RodItem[];
  holes: IcfHole[];
  lines: IcfLine[];
  barsV: RodItem[];
  barsH: RodItem[];
  barsLintel: RodItem[];
  rebarKg: number;
  /** Core concrete boxes per pour lift (bottom lift first). */
  lifts: BoxItem[][];
  /** Wall face area (one side, openings out), m². */
  area: number;
  /** Real-world core concrete (m³, before waste). */
  coreM3: number;
  /** ICF blocks (1.2 × 0.4 m) incl. cuts. */
  blocks: number;
  /** All footprint points (camera bounds). */
  points: Vec2[];
}

// ---------------------------------------------------------------------------
// Which walls / columns are ICF
// ---------------------------------------------------------------------------

/** A wall that is one full-width opening (only a head piece under the slab): cast with the slab, not ICF. */
export function isBeamOnly(w: Wall, openings: Opening[], floorY: number): boolean {
  const ps = wallPieces(w, openings, floorY).filter((p) => !(p.y0 <= w.baseY + 0.01 && p.y1 - p.y0 < 0.12));
  return !ps.some((p) => p.y0 <= w.baseY + 0.01);
}

const rectBounds = (poly: Vec2[]) => {
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
  return { x0, z0, x1, z1 };
};

const touches = (a: Vec2[], b: Vec2[], tol = 0.02) => {
  const p = rectBounds(a);
  const q = rectBounds(b);
  return p.x0 <= q.x1 + tol && q.x0 <= p.x1 + tol && p.z0 <= q.z1 + tol && q.z0 <= p.z1 + tol;
};

/** Columns standing in the line of an ICF wall (touching one): they become part of the ICF band. */
export function inWallColumns(cols: Column[], walls: Wall[]): Column[] {
  const rects = walls.map((w) => wallRect(w));
  return cols.filter((c) => rects.some((r) => touches(columnRect(c), r)));
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const axisOf = (u: Vec2): 'x' | 'z' => (Math.abs(u[0]) > 0.5 ? 'x' : 'z');
const along = (p: Vec2, axis: 'x' | 'z') => (axis === 'x' ? p[0] : p[1]);
const across = (p: Vec2, axis: 'x' | 'z') => (axis === 'x' ? p[1] : p[0]);
const pt = (axis: 'x' | 'z', t: number, c: number): Vec2 => (axis === 'x' ? [t, c] : [c, t]);
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

/** Subtract intervals [a, b] from [s0, s1]. */
function cutSpans(s0: number, s1: number, cuts: Array<[number, number]>, min = 0.01): Array<[number, number]> {
  let spans: Array<[number, number]> = [[s0, s1]];
  for (const [c0, c1] of cuts)
    spans = spans.flatMap(([a, b]): Array<[number, number]> => (c1 <= a || c0 >= b ? [[a, b]] : [[a, Math.min(b, c0)], [Math.max(a, c1), b]]));
  return spans.filter(([a, b]) => b - a > min);
}

export function icfLayout(spec: IcfSpec): IcfLayout {
  const E = ICF.eps;
  const J = ICF.joint;
  const { walls, cols, y0, y1 } = spec;
  const retaining = spec.retaining ?? new Set(walls.filter((w) => w.role === 'retaining').map((w) => w.id));

  // ---- holes (openings) in the ICF walls
  const holes: IcfHole[] = [];
  for (const w of walls) {
    const f = wallFrame(w);
    for (const o of spec.openings) {
      if (o.wallId !== w.id) continue;
      const s0 = Math.max(0, o.offset - o.width / 2);
      const s1 = Math.min(f.length, o.offset + o.width / 2);
      if (s1 - s0 < 0.05) continue;
      const hy0 = Math.max(y0, o.sill < 0.12 ? spec.doorY : spec.floorY + o.sill);
      const hy1 = Math.min(y1, spec.floorY + o.head);
      if (hy1 - hy0 < 0.05) continue;
      holes.push({ wall: w, opening: o, s0, s1, y0: hy0, y1: hy1, rect: wallRect(w, 0, s0, s1), a: wallPoint(w, s0), b: wallPoint(w, s1) });
    }
  }
  const cutX: number[] = [];
  const cutZ: number[] = [];
  for (const h of holes) {
    if (axisOf(wallFrame(h.wall).dir) === 'x') cutX.push(h.a[0], h.b[0]);
    else cutZ.push(h.a[1], h.b[1]);
  }

  // ---- footprint, faces, core
  const rects = [...walls.map((w) => wallRect(w)), ...cols.map((c) => columnRect(c))];
  const region = Region.of(rects);
  const edges = region.edges();
  const bands = edges.map((e) => {
    const s0 = e.convexA ? 0 : -E;
    const s1 = e.len + (e.convexB ? 0 : E);
    return [edgePoint(e, s0, 0), edgePoint(e, s1, 0), edgePoint(e, s1, -E), edgePoint(e, s0, -E)];
  });
  const core = Region.of(rects, bands, cutX, cutZ);

  // Holes seen from a face edge: same axis, the wall face on the edge line.
  const edgeHoles = edges.map((e) => {
    const ax = axisOf(e.u);
    const line = across(e.a, ax);
    const out: Array<{ s0: number; s1: number; y0: number; y1: number }> = [];
    for (const h of holes) {
      const f = wallFrame(h.wall);
      if (axisOf(f.dir) !== ax) continue;
      if (Math.abs(Math.abs(line - across(h.wall.a, ax)) - h.wall.thickness / 2) > 0.012) continue;
      const sa = dot([h.a[0] - e.a[0], h.a[1] - e.a[1]], e.u);
      const sb = dot([h.b[0] - e.a[0], h.b[1] - e.a[1]], e.u);
      const lo = Math.min(sa, sb);
      const hi = Math.max(sa, sb);
      if (hi <= 0 || lo >= e.len) continue;
      out.push({ s0: lo, s1: hi, y0: h.y0, y1: h.y1 });
    }
    return out;
  });

  // ---- courses
  const H = ICF.blockH;
  const courses: Array<[number, number]> = [];
  for (let y = y0; y < y1 - 0.02; y += H) courses.push([y, Math.min(y1, y + H)]);

  // ---- EPS faces per course
  const eps: BoxItem[][] = courses.map(() => []);
  let faceArea = 0;
  courses.forEach(([cy0, cy1], k) => {
    edges.forEach((e, ei) => {
      const owns = (axisOf(e.u) === 'x') === (k % 2 === 0);
      const sa = e.convexA ? (owns ? 0 : E) : owns ? -E : 0;
      const sb = e.len + (e.convexB ? (owns ? 0 : -E) : owns ? E : 0);
      if (sb - sa < 0.01) return;
      // Course strip minus the holes that cut this course, as (s-span, y-span) rects.
      let pieces: Array<{ s0: number; s1: number; y0: number; y1: number }> = [{ s0: sa, s1: sb, y0: cy0, y1: cy1 }];
      for (const h of edgeHoles[ei]) {
        if (h.y1 <= cy0 || h.y0 >= cy1) continue;
        pieces = pieces.flatMap((r) => {
          if (h.s0 >= r.s1 || h.s1 <= r.s0) return [r];
          const out: typeof pieces = [];
          if (h.s0 > r.s0) out.push({ ...r, s1: h.s0 });
          if (h.s1 < r.s1) out.push({ ...r, s0: h.s1 });
          const m0 = Math.max(r.s0, h.s0);
          const m1 = Math.min(r.s1, h.s1);
          if (h.y0 > r.y0 + 0.005) out.push({ s0: m0, s1: m1, y0: r.y0, y1: h.y0 });
          if (h.y1 < r.y1 - 0.005) out.push({ s0: m0, s1: m1, y0: h.y1, y1: r.y1 });
          return out;
        });
      }
      const shift = k % 2 ? ICF.blockL / 2 : 0;
      for (const r of pieces) {
        const cuts: number[] = [r.s0];
        const first = Math.floor((r.s0 - shift) / ICF.blockL) + 1;
        for (let m = first; shift + m * ICF.blockL < r.s1 - 0.02; m++) {
          const s = shift + m * ICF.blockL;
          if (s > r.s0 + 0.02) cuts.push(s);
        }
        cuts.push(r.s1);
        const top = r.y1 >= cy1 - 1e-6 ? r.y1 - J / 2 : r.y1;
        const bot = r.y0 <= cy0 + 1e-6 ? r.y0 + J / 2 : r.y0;
        for (let i = 0; i < cuts.length - 1; i++) {
          const p0 = cuts[i] + (i > 0 ? J / 2 : 0);
          const p1 = cuts[i + 1] - (i < cuts.length - 2 ? J / 2 : 0);
          if (p1 - p0 < 0.015 || top - bot < 0.008) continue;
          eps[k].push(bandBox(e, p0, p1, -E, 0, bot, top));
          faceArea += (p1 - p0) * (top - bot);
        }
      }
    });
  });

  // ---- bar lines along the core centerlines (walls, then column piers)
  const raw: IcfLine[] = [];
  const addLine = (axis: 'x' | 'z', c: number, lo: number, hi: number, ret: boolean, minLen: number) => {
    for (const [t0, t1] of core.intervals(axis, c + 1e-4)) {
      const ov = Math.min(t1, hi) - Math.max(t0, lo);
      if (ov < 0.1 || t1 - t0 < minLen) continue;
      raw.push({ axis, c, t0, t1, retaining: ret });
    }
  };
  for (const w of walls) {
    const f = wallFrame(w);
    const ax = axisOf(f.dir);
    const lo = Math.min(along(w.a, ax), along(w.b, ax));
    const hi = Math.max(along(w.a, ax), along(w.b, ax));
    addLine(ax, across(w.a, ax), lo, hi, retaining.has(w.id), 0.25);
  }
  for (const c of cols) {
    const b = rectBounds(columnRect(c));
    addLine('x', c.center[1], b.x0, b.x1, false, 0.3);
    addLine('z', c.center[0], b.z0, b.z1, false, 0.3);
  }
  const byLine = new Map<string, IcfLine[]>();
  for (const l of raw) {
    const k = `${l.axis}:${l.c.toFixed(2)}`;
    const list = byLine.get(k);
    if (list) list.push(l);
    else byLine.set(k, [l]);
  }
  const lines: IcfLine[] = [];
  for (const list of Array.from(byLine.values())) {
    list.sort((p, q) => p.t0 - q.t0);
    for (const l of list) {
      const last = lines[lines.length - 1];
      if (last && last.axis === l.axis && Math.abs(last.c - l.c) < 0.005 && l.t0 <= last.t1 + 1e-6) {
        last.t1 = Math.max(last.t1, l.t1);
        last.retaining = last.retaining || l.retaining;
      } else lines.push({ ...l });
    }
  }
  const lineHoles = (l: IcfLine) =>
    holes
      .filter((h) => axisOf(wallFrame(h.wall).dir) === l.axis && Math.abs(across(h.wall.a, l.axis) - l.c) < 0.01)
      .map((h) => ({ t0: Math.min(along(h.a, l.axis), along(h.b, l.axis)), t1: Math.max(along(h.a, l.axis), along(h.b, l.axis)), y0: h.y0, y1: h.y1 }));
  /** Core width across a line at t (for the webs). */
  const coreWidth = (l: IcfLine, t: number) => {
    const perp = l.axis === 'x' ? 'z' : 'x';
    for (const [a, b] of core.intervals(perp, t + 1e-4)) if (l.c >= a - 1e-6 && l.c <= b + 1e-6) return { w: b - a, mid: (a + b) / 2 };
    return null;
  };

  // ---- rebar + webs
  const starter = spec.starter ?? 0.18;
  const barsV: RodItem[] = [];
  const barsH: RodItem[] = [];
  const barsLintel: RodItem[] = [];
  const webs: BoxItem[] = [];
  let kg = 0;
  const v3 = (p: Vec2, y: number): Vec3 => [p[0], y, p[1]];
  for (const l of lines) {
    const hs = lineHoles(l);
    const sp = l.retaining ? 0.2 : 0.4;
    const dV = l.retaining ? 14 : 12;
    const bot = spec.barBottom ?? y0 + 0.05;
    const ts = divide(l.t0 + 0.05, l.t1 - 0.05, sp);
    for (const h of hs) for (const t of [h.t0 - 0.07, h.t1 + 0.07]) if (t > l.t0 + 0.04 && t < l.t1 - 0.04) ts.push(t);
    for (const t of ts) {
      const p = pt(l.axis, t, l.c);
      const top = spec.slabAbove.length && covered(p, spec.slabAbove) ? y1 + starter : y1 - 0.05;
      const cuts: Array<[number, number]> = hs.filter((h) => t > h.t0 - 0.03 && t < h.t1 + 0.03).map((h) => [h.y0 - 0.04, h.y1 + 0.04]);
      for (const [a, b] of cutSpans(bot, top, cuts, 0.18)) {
        barsV.push({ a: v3(p, a), b: v3(p, b) });
        kg += rebarKg(dV, b - a);
      }
    }
    // Horizontal bars in the web saddles, one per course (two in retaining walls).
    courses.forEach(([cy0, cy1]) => {
      if (cy1 - cy0 < 0.15) return;
      const ys = l.retaining ? [cy0 + 0.12, cy1 - 0.08] : [cy1 - 0.08];
      for (const y of ys) {
        const cuts: Array<[number, number]> = hs.filter((h) => y > h.y0 - 0.04 && y < h.y1 + 0.04).map((h) => [h.t0 - 0.03, h.t1 + 0.03]);
        for (const [a, b] of cutSpans(l.t0 + 0.04, l.t1 - 0.04, cuts, 0.15)) {
          barsH.push({ a: v3(pt(l.axis, a, l.c + 0.012), y), b: v3(pt(l.axis, b, l.c + 0.012), y) });
          kg += rebarKg(12, b - a);
        }
      }
    });
    // Lintel bars over every opening: the core above the head is the lintel.
    for (const h of hs) {
      if (h.y1 > y1 - 0.12) continue;
      const a = Math.max(l.t0 + 0.04, h.t0 - 0.45);
      const b = Math.min(l.t1 - 0.04, h.t1 + 0.45);
      for (const [dy, dc] of [
        [0.05, -0.022],
        [0.05, 0.022],
      ] as const) {
        barsLintel.push({ a: v3(pt(l.axis, a, l.c + dc), h.y1 + dy), b: v3(pt(l.axis, b, l.c + dc), h.y1 + dy) });
        kg += rebarKg(14, b - a);
      }
    }
    // Webs every 20 cm, each course (skipped where an opening cuts the course).
    for (let t = l.t0 + 0.1; t < l.t1 - 0.05; t += 0.2) {
      const cw = coreWidth(l, t);
      if (!cw || cw.w > 0.32) continue;
      const p = pt(l.axis, t, cw.mid);
      const rotY = angleOfDir(l.axis === 'x' ? [1, 0] : [0, 1]);
      courses.forEach(([cy0, cy1]) => {
        if (hs.some((h) => t > h.t0 - 0.03 && t < h.t1 + 0.03 && h.y0 < cy1 && h.y1 > cy0)) return;
        const hgt = Math.max(0.05, cy1 - cy0 - 0.1);
        webs.push({ at: v3(p, (cy0 + cy1) / 2), size: [0.014, hgt, Math.max(0.02, cw.w - 0.02)], rotY });
      });
    }
  }

  // ---- bucks (timber frames in the openings) + a diagonal brace each
  const B = ICF.buck;
  const bucks: BoxItem[] = [];
  const buckBraces: RodItem[] = [];
  for (const h of holes) {
    const w = h.wall;
    const put = (s0: number, s1: number, ya: number, yb: number) => bucks.push(pieceBox(w, { s0, s1, y0: ya, y1: yb }, 0.006));
    put(h.s0, h.s0 + B, h.y0, h.y1);
    put(h.s1 - B, h.s1, h.y0, h.y1);
    put(h.s0 + B + 0.002, h.s1 - B - 0.002, h.y1 - B, h.y1);
    if (h.opening.sill >= 0.12) put(h.s0 + B + 0.002, h.s1 - B - 0.002, h.y0, h.y0 + B);
    const pa = wallPoint(w, h.s0 + B + 0.03);
    const pb = wallPoint(w, h.s1 - B - 0.03);
    buckBraces.push({ a: v3(pa, h.y0 + (h.opening.sill >= 0.12 ? B : 0) + 0.04), b: v3(pb, h.y1 - B - 0.04) });
  }

  // ---- core concrete in lifts
  const holeOf = (p: Vec2) => holes.findIndex((h) => pointInPolygon(p, h.rect));
  type CR = { x0: number; z0: number; x1: number; z1: number; hole: number };
  const crs: CR[] = core.rects().map((r) => ({ ...r, hole: holeOf([(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]) }));
  // Merge vertically stacked runs with the same x-span (vertical walls come out as one rect each).
  crs.sort((p, q) => p.x0 - q.x0 || p.x1 - q.x1 || p.z0 - q.z0);
  const merged: CR[] = [];
  for (const r of crs) {
    const m = merged[merged.length - 1];
    if (m && Math.abs(m.x0 - r.x0) < 1e-6 && Math.abs(m.x1 - r.x1) < 1e-6 && Math.abs(m.z1 - r.z0) < 1e-6 && m.hole === r.hole) m.z1 = r.z1;
    else merged.push({ ...r });
  }
  const liftYs = divide(y0, y1, spec.lift ?? ICF.lift);
  const lifts: BoxItem[][] = liftYs.slice(1).map(() => []);
  const gap = 0.0015;
  const inCore = (x: number, z: number) => core.contains([x, z]);
  for (const r of merged) {
    const zm = (r.z0 + r.z1) / 2;
    const xm = (r.x0 + r.x1) / 2;
    // Pull the concrete off the EPS faces a hair (no coplanar faces under the translucent forms).
    const x0 = r.x0 + (inCore(r.x0 - 0.002, zm) ? 0 : gap);
    const x1 = r.x1 - (inCore(r.x1 + 0.002, zm) ? 0 : gap);
    const z0 = r.z0 + (inCore(xm, r.z0 - 0.002) ? 0 : gap);
    const z1 = r.z1 - (inCore(xm, r.z1 + 0.002) ? 0 : gap);
    const h = r.hole >= 0 ? holes[r.hole] : null;
    const spans: Array<[number, number]> = h ? cutSpans(y0, y1, [[h.y0, h.y1]], 0.005) : [[y0, y1]];
    for (const [a, b] of spans)
      for (let k = 0; k < liftYs.length - 1; k++) {
        const la = Math.max(a, liftYs[k]);
        const lb = Math.min(b, liftYs[k + 1]);
        if (lb - la < 0.005) continue;
        lifts[k].push({ at: [(x0 + x1) / 2, (la + lb) / 2, (z0 + z1) / 2], size: [x1 - x0, lb - la, z1 - z0] });
      }
  }

  // ---- quantities
  const area = faceArea / 2;
  let retArea = 0;
  for (const w of walls) if (retaining.has(w.id)) retArea += wallFrame(w).length * (y1 - y0);
  retArea = Math.min(area, retArea);
  const coreM3 = (area - retArea) * ICF.coreReal + retArea * ICF.coreRetaining;
  const blocks = Math.round((area / (ICF.blockL * ICF.blockH)) * 1.05);
  const points = rects.flat();
  return { spec, region, core, edges, courses, eps, webs, bucks, buckBraces, holes, lines, barsV, barsH, barsLintel, rebarKg: kg, lifts, area, coreM3, blocks, points };
}

// ---------------------------------------------------------------------------
// Alignment braces (inner faces): uprights, kickers, scaffold brackets, walk boards, guardrails
// ---------------------------------------------------------------------------

export interface IcfBraces {
  uprights: BoxItem[];
  kickers: RodItem[];
  feet: BoxItem[];
  arms: BoxItem[];
  struts: RodItem[];
  planks: BoxItem[];
  posts: BoxItem[];
  rails: RodItem[];
  count: number;
  /** Where a worker can stand on the walk board (point, plank top y, facing the wall). */
  stands: Array<{ at: Vec3; rotY: number }>;
}

export function icfBraces(L: IcfLayout, opts: { floorAt: (p: Vec2) => number | null; avoid?: Vec2[][]; plankBelowTop?: number }): IcfBraces {
  const { y0, y1 } = L.spec;
  const H = y1 - y0;
  const out: IcfBraces = { uprights: [], kickers: [], feet: [], arms: [], struts: [], planks: [], posts: [], rails: [], count: 0, stands: [] };
  const yP = y1 - (opts.plankBelowTop ?? 1.3);
  const reach = Math.min(1.7, Math.max(1.1, H * 0.5));
  const avoid = (opts.avoid ?? []).map((r) => rectBounds(r));
  const near = (p: Vec2, d: number) => avoid.some((b) => p[0] > b.x0 - d && p[0] < b.x1 + d && p[1] > b.z0 - d && p[1] < b.z1 + d);
  const v3 = (p: Vec2, y: number): Vec3 => [p[0], y, p[1]];
  for (const e of L.edges) {
    if (e.len < 1.1) continue;
    if (!pointInPolygon(edgePoint(e, e.len / 2, 0.35), L.spec.inside)) continue;
    // Openings on this face (braces go beside them, never across).
    const ax = axisOf(e.u);
    const line = across(e.a, ax);
    const hs = L.holes
      .filter((h) => axisOf(wallFrame(h.wall).dir) === ax && Math.abs(Math.abs(line - across(h.wall.a, ax)) - h.wall.thickness / 2) < 0.012)
      .map((h) => {
        const sa = dot([h.a[0] - e.a[0], h.a[1] - e.a[1]], e.u);
        const sb = dot([h.b[0] - e.a[0], h.b[1] - e.a[1]], e.u);
        return [Math.min(sa, sb) - 0.14, Math.max(sa, sb) + 0.14] as [number, number];
      });
    const n = Math.max(1, Math.ceil((e.len - 0.7) / ICF.braceSpacing));
    const cand = divide(0.35, Math.max(0.36, e.len - 0.35), (e.len - 0.7) / n);
    const ss: number[] = [];
    for (let s of cand) {
      const h = hs.find(([a, b]) => s > a && s < b);
      if (h) s = s - h[0] < h[1] - s ? h[0] : h[1];
      if (s < 0.25 || s > e.len - 0.25) continue;
      if (ss.some((q) => Math.abs(q - s) < 0.6)) continue;
      const foot = edgePoint(e, s, reach + 0.1);
      const fy = opts.floorAt(foot);
      if (fy === null || near(foot, 0.45) || near(edgePoint(e, s, 0.4), 0.3)) continue;
      ss.push(s);
      const rotY = angleOfDir(e.u);
      const up = edgePoint(e, s, 0.033);
      out.uprights.push({ at: v3(up, (y0 + y1 + 0.1) / 2), size: [0.05, H + 0.1, 0.06], rotY });
      const kAt = y0 + H * 0.62;
      out.kickers.push({ a: v3(edgePoint(e, s, 0.07), kAt), b: v3(foot, fy + 0.04) });
      out.feet.push({ at: v3(foot, fy + 0.01), size: [0.16, 0.02, 0.16], rotY });
      const arm0 = 0.064;
      const arm1 = 0.78;
      out.arms.push(bandBox(e, s - 0.02, s + 0.02, arm0, arm1, yP - 0.06, yP));
      out.struts.push({ a: v3(edgePoint(e, s, 0.07), yP - 0.55), b: v3(edgePoint(e, s, arm1 - 0.05), yP - 0.04) });
      out.posts.push(bandBox(e, s - 0.02, s + 0.02, arm1 - 0.04, arm1, yP, yP + 1.05));
      out.count++;
    }
    ss.sort((a, b) => a - b);
    if (ss.length >= 2) {
      const s0 = Math.max(0.02, ss[0] - 0.3);
      const s1 = Math.min(e.len - 0.02, ss[ss.length - 1] + 0.3);
      for (const [d0, d1] of [
        [0.08, 0.38],
        [0.4, 0.7],
      ] as const)
        out.planks.push(bandBox(e, s0, s1, d0, d1, yP, yP + 0.045));
      for (let i = 0; i < ss.length - 1; i++)
        for (const dy of [0.55, 1.02]) out.rails.push({ a: v3(edgePoint(e, ss[i], 0.76), yP + dy), b: v3(edgePoint(e, ss[i + 1], 0.76), yP + dy) });
      const mid = ss[Math.floor(ss.length / 2)];
      const sAt = (ss.length > 2 ? (mid + ss[Math.floor(ss.length / 2) - 1]) / 2 : (ss[0] + ss[1]) / 2);
      const sp = edgePoint(e, sAt, 0.36);
      out.stands.push({ at: v3(sp, yP + 0.045), rotY: angleOfDir([-e.n[0], -e.n[1]]) });
    }
  }
  return out;
}
