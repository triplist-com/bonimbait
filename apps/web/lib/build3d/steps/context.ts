/**
 * Everything step authors need that is DERIVED from the house model, computed once:
 * levels, footprints, lot/street/gate, fine terrain grids (natural / excavated /
 * finished), the terrain cake base, grade beams, piles and a free-spot finder for
 * site items. Pure (no three.js).
 */
import {
  angleOfDir,
  bbox2,
  cross2,
  dedupePoints,
  dist2,
  distanceOutside,
  distanceToSegment,
  excavate,
  gridBounds,
  gridMin,
  houseFootprint,
  lerp2,
  levelFootprint,
  levelOf,
  mergeCollinear,
  norm2,
  offsetPolygon,
  pointInPolygon,
  pointsAlong,
  polygonArea,
  polygonCentroid,
  resampleGrid,
  resolveJunctions,
  sampleGrid,
  signedDistance,
  simplifyRing,
  snapEnds,
  sub2,
  unionOutline,
  type BBox2,
  type Seg,
} from '../house/geometry';
import type { HouseModel, Level, TerrainGrid, Vec2, Wall } from '../house/types';

export type GroundLevel = 'lower' | 'entrance';

export interface Beam {
  id: string;
  level: GroundLevel;
  a: Vec2;
  b: Vec2;
  /** Width (m). */
  w: number;
  /** Top of beam = underside of the floor slab it carries. */
  topY: number;
  depth: number;
  /** Walls it sits under. */
  walls: string[];
}

export interface Pile {
  id: string;
  level: GroundLevel;
  at: Vec2;
  r: number;
  /** Top of pile (5 cm into the beam above). */
  topY: number;
  tipY: number;
  /** Excavated ground level at the pile. */
  groundY: number;
}

export interface BuildContext {
  house: HouseModel;
  lower: Level;
  entrance: Level;
  roof: Level;
  footprint: {
    lower: Vec2[];
    entrance: Vec2[];
    /** Whole house seen from above. */
    house: Vec2[];
    /** Entrance-floor area NOT above the lower floor (slab on grade / void formers, not excavated). */
    grade: Vec2[];
    entranceGroundArea: number;
  };
  lot: {
    boundary: Vec2[];
    bbox: BBox2;
    area: number;
    center: Vec2;
    /** Lot edge facing the street. */
    street: { a: Vec2; b: Vec2; mid: Vec2; dir: Vec2; inward: Vec2; rotY: number };
    /** Lot edge opposite the street (where the municipal sewer runs on this plot). */
    back: { a: Vec2; b: Vec2; mid: Vec2; inward: Vec2 };
    /** Site entrance on the street edge. */
    gate: Vec2;
  };
  terrain: {
    /** 0.25 m grids over the extractor's terrain extent. */
    natural: TerrainGrid;
    excavated: TerrainGrid;
    finished: TerrainGrid;
    /** Bottom of the terrain "cake". */
    baseY: number;
    bounds: BBox2;
  };
  /** Key construction levels (m rel. ±0.00). */
  y: {
    /** Excavation floor under the lower floor (top of the 10 cm gravel bed = beam bottom). */
    pitFloor: number;
    gravelTop: number;
    /** Leveled platform under the entrance-floor ground slab (= its beam bottom). */
    platform: number;
    lowerBeamTop: number;
    entranceBeamTop: number;
    beamDepth: number;
  };
  beams: Beam[];
  piles: Pile[];
  /** Terrain height at (x, z) on a grid (default natural). */
  heightAt(x: number, z: number, grid?: TerrainGrid): number;
  /**
   * Free spot for a site item of size [w, d] (meters, w along the street edge) inside
   * the lot, outside the house + working zone and earlier `taken` rects; closest to `near`.
   */
  freeSpot(size: Vec2, near: Vec2, taken?: Array<{ at: Vec2; size: Vec2 }>, clearance?: number): Vec2;
}

function beamWidth(w: Wall) {
  return Math.max(0.3, Math.min(0.5, w.thickness + 0.1));
}

/** Parameter intervals of segment a→b lying OUTSIDE polygon (by sampling). */
export function outsideIntervals(a: Vec2, b: Vec2, poly: Vec2[]): Array<[number, number]> {
  const n = Math.max(8, Math.ceil(dist2(a, b) / 0.05));
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = lerp2(a, b, t);
    const outside = !pointInPolygon(p, poly) && distanceOutside(p, poly) > 0.02;
    if (outside && start < 0) start = t;
    if ((!outside || i === n) && start >= 0) {
      const end = outside ? t : (i - 0.5) / n;
      if (end - start > 0.02) out.push([start, end]);
      start = -1;
    }
  }
  return out;
}

const cache = new WeakMap<HouseModel, BuildContext>();

export function getContext(house: HouseModel): BuildContext {
  const hit = cache.get(house);
  if (hit) return hit;

  const lower = levelOf(house, 'lower');
  const entrance = levelOf(house, 'entrance');
  const roof = levelOf(house, 'roof');

  const fpLower = levelFootprint(house, 'lower');
  const fpEntrance = levelFootprint(house, 'entrance');
  const fpHouse = houseFootprint(house);

  // --- slab / beam levels --------------------------------------------------
  const slabOf = (lvl: GroundLevel, role: string) => house.slabs.find((s) => s.level === lvl && s.role === role);
  const lowerSlab = slabOf('lower', 'ground');
  const entGround = slabOf('entrance', 'ground');
  const lowerSlabTop = lowerSlab?.topY ?? lower.floorY - 0.05;
  const lowerSlabT = lowerSlab?.thickness ?? lower.slabThickness ?? 0.2;
  const entSlabTop = entGround?.topY ?? entrance.floorY - 0.05;
  const entSlabT = entGround?.thickness ?? entrance.slabThickness ?? 0.25;
  const beamDepth = 0.6;
  const lowerBeamTop = lowerSlabTop - lowerSlabT;
  const entranceBeamTop = entSlabTop - entSlabT;
  const gravelTop = lowerBeamTop - beamDepth;
  const pitFloor = gravelTop - 0.1;
  const platform = entranceBeamTop - beamDepth;

  // --- lot ------------------------------------------------------------------
  const boundary = house.site.boundary;
  const lb = bbox2(boundary);
  const center = polygonCentroid(boundary);
  const edges = boundary.map((p, i) => ({ a: p, b: boundary[(i + 1) % boundary.length] }));
  const streetLine = house.site.street;
  // Distance of each lot edge to the street; the street side is the chain of edges near it
  // (the lot's street edge is often a curve made of many short edges).
  const edgeDist = edges.map((e) => {
    const m = lerp2(e.a, e.b, 0.5);
    if (streetLine && streetLine.length >= 2) {
      let d = Infinity;
      for (let i = 0; i < streetLine.length - 1; i++) d = Math.min(d, distanceToSegment(m, streetLine[i], streetLine[i + 1]));
      return d;
    }
    return lb.max[1] - m[1]; // no street given: +Z faces the street
  });
  const dMin = Math.min(...edgeDist);
  const chain = edges.filter((_, i) => edgeDist[i] < dMin + 1.5);
  const chainPts = chain.flatMap((e) => [e.a, e.b]);
  // Principal direction of the chain: farthest pair.
  let sa = chainPts[0];
  let sb = chainPts[chainPts.length - 1];
  for (const p of chainPts) for (const q of chainPts) if (dist2(p, q) > dist2(sa, sb)) [sa, sb] = [p, q];
  const sDir = norm2(sub2(sb, sa));
  const sMid0 = lerp2(sa, sb, 0.5);
  const nearestOnChain = (q: Vec2): Vec2 => {
    let best: Vec2 = chain[0].a;
    let bd = Infinity;
    for (const e of chain) {
      const ab = sub2(e.b, e.a);
      const t = Math.max(0, Math.min(1, ((q[0] - e.a[0]) * ab[0] + (q[1] - e.a[1]) * ab[1]) / ((ab[0] ** 2 + ab[1] ** 2) || 1)));
      const p = lerp2(e.a, e.b, t);
      const d = dist2(p, q);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  };
  const sMid = nearestOnChain(sMid0);
  let inward: Vec2 = [sDir[1], -sDir[0]];
  if ((center[0] - sMid[0]) * inward[0] + (center[1] - sMid[1]) * inward[1] < 0) inward = [-inward[0], -inward[1]];
  const proj = (q: Vec2) => (q[0] - sMid[0]) * inward[0] + (q[1] - sMid[1]) * inward[1];
  const backPt = boundary.reduce((b, p) => (proj(p) > proj(b) ? p : b), boundary[0]);
  const backEdge = edges.reduce((best, e) => (dist2(lerp2(e.a, e.b, 0.5), backPt) < dist2(lerp2(best.a, best.b, 0.5), backPt) ? e : best), edges[0]);
  const bMid = backPt;
  const streetEdge = { a: sa, b: sb };

  const parking = house.outdoor.find((o) => o.kind === 'parking');
  const gate = parking ? nearestOnChain(polygonCentroid(parking.outline)) : sMid;

  // --- on-grade (non-excavated) part of the entrance floor ---------------------
  const gradeSlabs = house.slabs.filter((x) => x.level === 'entrance' && x.role === 'ground');
  const gradeRaw = gradeSlabs.length === 1 ? gradeSlabs[0].outline : gradeSlabs.length ? unionOutline(gradeSlabs.map((x) => x.outline)) : fpEntrance;
  const grade = simplifyRing(gradeRaw, 0.12);

  // --- terrain ----------------------------------------------------------------
  const natural = resampleGrid(house.site.terrainNatural, 0.25);
  const finished = resampleGrid(house.site.terrainFinished, 0.25);
  const excavated = excavate(natural, [
    // On-grade part of the entrance floor: level to the bottom of its grade beams.
    { polygon: grade, y: platform, margin: 0.5, slope: 1 },
    // Lower floor pit: working space + 1:1 slopes, with a steep (rock) face toward the
    // non-excavated platform so the entrance beams sit on undisturbed ground.
    {
      polygon: fpLower,
      y: pitFloor,
      margin: 1.0,
      slope: 1,
      shield: { polygon: grade, margin: 0.5, gap: 0.22 },
    },
  ]);

  // --- grade beams ------------------------------------------------------------
  // Outer beams follow the footprint ring (under 20 cm exterior walls whose outer face
  // is the footprint); thick inner walls (mamad, concrete) add beams snapped to the ring.
  const ringSegs = (poly: Vec2[], w: number): Seg[] => {
    const r = offsetPolygon(simplifyRing(poly, 0.12), -0.1);
    return r.map((p, i) => ({ a: p, b: r[(i + 1) % r.length], w, refs: [] as string[] })).filter((x) => dist2(x.a, x.b) > 0.05);
  };
  const lowerRing = ringSegs(fpLower, 0.3);
  const onLowerEdge = (p: Vec2) => Math.abs(signedDistance(p, fpLower)) < 0.4;
  const entRing = ringSegs(grade, 0.3).filter((x) => !(onLowerEdge(x.a) && onLowerEdge(x.b) && onLowerEdge(lerp2(x.a, x.b, 0.5))));
  const innerWalls = (lvl: GroundLevel, region: Vec2[], ring: Seg[]): Seg[] =>
    house.walls
      .filter((w) => w.level === lvl && (w.role === 'mamad' || w.role === 'retaining' || w.material === 'concrete' || w.thickness >= 0.25))
      .filter((w) => signedDistance(lerp2(w.a, w.b, 0.5), region) < -0.05)
      .filter((w) => {
        // Skip walls already carried by a parallel ring beam.
        const d = norm2(sub2(w.b, w.a));
        return !ring.some((r) => {
          const e = norm2(sub2(r.b, r.a));
          return Math.abs(cross2(d, e)) < 0.05 && distanceToSegment(lerp2(w.a, w.b, 0.5), r.a, r.b) < 0.3;
        });
      })
      .map((w) => ({ a: w.a, b: w.b, w: beamWidth(w), refs: [w.id] }));
  const beamSegs = (ring: Seg[], inner: Seg[]): Seg[] => {
    const all = [...ring, ...snapEnds(inner, [...ring, ...inner], 0.9)];
    return resolveJunctions(mergeCollinear(all));
  };
  const beams: Beam[] = [];
  const addBeams = (lvl: GroundLevel, segs: Seg[]) =>
    segs.forEach((x, i) =>
      beams.push({
        id: `${lvl === 'lower' ? 'L' : 'E'}${i + 1}`,
        level: lvl,
        a: x.a,
        b: x.b,
        w: x.w,
        topY: lvl === 'lower' ? lowerBeamTop : entranceBeamTop,
        depth: beamDepth,
        walls: x.refs,
      }),
    );
  addBeams('lower', beamSegs(lowerRing, innerWalls('lower', fpLower, lowerRing)));
  addBeams('entrance', beamSegs(entRing, innerWalls('entrance', grade, entRing)));

  // --- piles --------------------------------------------------------------------
  const pileLen: Record<GroundLevel, number> = { lower: 4, entrance: 6 };
  const piles: Pile[] = [];
  (['lower', 'entrance'] as const).forEach((lvl) => {
    const pts: Vec2[] = [];
    for (const b of beams.filter((x) => x.level === lvl)) pts.push(...pointsAlong(b.a, b.b, 3.0));
    for (const c of house.columns) {
      if (lvl === 'lower' && c.level === 'lower') pts.push(c.center);
      if (lvl === 'entrance' && c.level === 'entrance' && signedDistance(c.center, grade) < 0.15 && !onLowerEdge(c.center)) pts.push(c.center);
    }
    dedupePoints(pts, 1.0).forEach((p, i) => {
      const top = (lvl === 'lower' ? lowerBeamTop : entranceBeamTop) - beamDepth + 0.05;
      piles.push({
        id: `${lvl === 'lower' ? 'PL' : 'PE'}${i + 1}`,
        level: lvl,
        at: p,
        r: 0.25,
        topY: top,
        tipY: top - pileLen[lvl],
        groundY: sampleGrid(excavated, p[0], p[1]),
      });
    });
  });

  const tipMin = piles.reduce((m, p) => Math.min(m, p.tipY), Infinity);
  const baseY = Math.min(gridMin(natural) - 3, (isFinite(tipMin) ? tipMin : pitFloor) - 0.6);

  // --- free spots -----------------------------------------------------------------
  const lotInset = offsetPolygon(boundary, -0.7);
  const keepOut = offsetPolygon(fpHouse, 2.2);
  const freeSpot: BuildContext['freeSpot'] = (size, near, taken = [], clearance = 0.4) => {
    const ux = sDir;
    const uz = inward;
    const corners = (c: Vec2): Vec2[] => {
      const hx = size[0] / 2 + clearance;
      const hz = size[1] / 2 + clearance;
      return [
        [-hx, -hz],
        [hx, -hz],
        [hx, hz],
        [-hx, hz],
        [0, 0],
      ].map(([a, b]) => [c[0] + ux[0] * a + uz[0] * b, c[1] + ux[1] * a + uz[1] * b] as Vec2);
    };
    let best: Vec2 = near;
    let bestD = Infinity;
    for (let x = lb.min[0]; x <= lb.max[0]; x += 0.5) {
      for (let z = lb.min[1]; z <= lb.max[1]; z += 0.5) {
        const c: Vec2 = [x, z];
        const d = dist2(c, near);
        if (d >= bestD) continue;
        const cs = corners(c);
        if (!cs.every((p) => pointInPolygon(p, lotInset))) continue;
        if (cs.some((p) => pointInPolygon(p, keepOut))) continue;
        if (
          taken.some(
            (t) => Math.abs(t.at[0] - c[0]) < (t.size[0] + size[0]) / 2 + 0.6 && Math.abs(t.at[1] - c[1]) < (t.size[1] + size[1]) / 2 + 0.6,
          )
        )
          continue;
        best = c;
        bestD = d;
      }
    }
    return best;
  };

  const entranceGroundArea = polygonArea(grade);

  const ctx: BuildContext = {
    house,
    lower,
    entrance,
    roof,
    footprint: { lower: fpLower, entrance: fpEntrance, house: fpHouse, grade, entranceGroundArea },
    lot: {
      boundary,
      bbox: lb,
      area: polygonArea(boundary),
      center,
      street: { a: streetEdge.a, b: streetEdge.b, mid: sMid, dir: sDir, inward, rotY: angleOfDir(sDir) },
      back: { a: backEdge.a, b: backEdge.b, mid: bMid, inward: [-inward[0], -inward[1]] },
      gate,
    },
    terrain: { natural, excavated, finished, baseY, bounds: gridBounds(natural) },
    y: { pitFloor, gravelTop, platform, lowerBeamTop, entranceBeamTop, beamDepth },
    beams,
    piles,
    heightAt: (x, z, grid = natural) => sampleGrid(grid, x, z),
    freeSpot,
  };
  cache.set(house, ctx);
  return ctx;
}

/** True if p lies inside the house footprint grown by `margin`. */
export function insideHouse(ctx: BuildContext, p: Vec2, margin = 0): boolean {
  return signedDistance(p, ctx.footprint.house) <= margin;
}
