/**
 * Phase 12 · פיתוח — site walls + stone fence (and the final grading they hold),
 * parking pavers, paths and outdoor steps, terrace deck, pergola, garden, outdoor furniture.
 * Hard surfaces sit 3-5 cm above the finished grade; lawn drapes 2 cm, so nothing z-fights.
 */
import {
  bbox2,
  clipPolygonToRect,
  dist2,
  lerp2,
  norm2,
  offsetPolygon,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  rng,
  samplePolygon,
  signedDistance,
  sub2,
  wallFrame,
} from '../house/geometry';
import type { Fixture, OutdoorArea, Vec2, Vec3 } from '../house/types';
import type { Part, StepDef } from '../engine/types';
import type { BuildContext } from './context';
import {
  boxesPart,
  fixtureModel,
  houseBounds,
  polyBounds,
  stagger,
  sum,
  tilePolygon,
  type BoxItem,
} from './finish-kit';
import { PRICES, line, roundCost } from './kit';
import { structureFrame } from './structure-kit';

const TOP = 0.04; // paving top above the finished grade

/** Courses of stone along a wall piece: random block lengths per course, running bond. */
function stoneCourses(a: Vec2, b: Vec2, y0: number, y1: number, depth: number, rand: () => number, out: BoxItem[], courseH = 0.3) {
  const f = wallFrame({ a, b });
  const L = f.length;
  const n = Math.max(1, Math.round((y1 - y0) / courseH));
  const h = (y1 - y0) / n;
  for (let c = 0; c < n; c++) {
    let s = -rand() * 0.45 * (c % 2);
    while (s < L - 0.02) {
      const len = 0.55 + rand() * 0.45;
      const s0 = Math.max(0, s);
      const s1 = Math.min(L, s + len);
      if (s1 - s0 > 0.08) {
        const m = (s0 + s1) / 2;
        out.push({
          at: [a[0] + f.dir[0] * m, y0 + (c + 0.5) * h, a[1] + f.dir[1] * m],
          size: [s1 - s0 - 0.012, h - 0.012, depth],
          rotY: f.rotY,
        });
      }
      s += len;
    }
  }
}

export function phaseLandscape(ctx: BuildContext): StepDef[] {
  const { house } = ctx;
  const finished = ctx.terrain.finished;
  const gAt = (p: Vec2) => ctx.heightAt(p[0], p[1], finished);
  const out = house.outdoor;
  const byId = (id: string) => out.find((o) => o.id === id);
  const pk = out.find((o) => o.kind === 'parking');
  const steps: StepDef[] = [];

  // Placement helpers ---------------------------------------------------------
  const houseNear = (p: Vec2, d: number) => signedDistance(p, ctx.footprint.house) < d;
  const hardAreas = out.filter((o) => ['path', 'parking', 'steps', 'pergola'].includes(o.kind) || o.id === 'O-PLANTER-E');
  const onHard = (p: Vec2, m = 0.3) => hardAreas.some((o) => o.kind !== 'pergola' && signedDistance(p, o.outline) < m);

  // ===================================================================== site walls + final grading
  {
    const rand = rng(43);
    const blocks: BoxItem[] = [];
    const caps: BoxItem[] = [];
    const piers: BoxItem[] = [];
    const retaining = house.walls.filter((w) => w.role === 'site-retaining');
    const fence = house.walls.filter((w) => w.role === 'fence');
    // Vehicle gate: leave the street fence open over the parking frontage.
    const pb = pk ? bbox2(pk.outline) : { min: [-3, 20] as Vec2, max: [3.2, 23] as Vec2 };
    const gx0 = pb.min[0] + 1.0;
    const gx1 = pb.max[0] - 0.15;
    const streetZ = pb.max[1] - 2.3;
    let fenceLen = 0;
    let fenceM2 = 0;
    for (const w of fence) {
      let segs: Array<[Vec2, Vec2]> = [[w.a, w.b]];
      if (w.a[1] > streetZ && w.b[1] > streetZ) {
        const lo = Math.min(w.a[0], w.b[0]);
        const hi = Math.max(w.a[0], w.b[0]);
        if (hi > gx0 && lo < gx1) {
          const t = (x: number) => (x - w.a[0]) / (w.b[0] - w.a[0]);
          const tA = Math.min(1, Math.max(0, Math.min(t(gx0), t(gx1))));
          const tB = Math.min(1, Math.max(0, Math.max(t(gx0), t(gx1))));
          segs = [];
          if (tA > 0.03) segs.push([w.a, lerp2(w.a, w.b, tA)]);
          if (tB < 0.97) segs.push([lerp2(w.a, w.b, tB), w.b]);
        }
      }
      const top = w.baseY + w.height;
      for (const [a, b] of segs) {
        const L = dist2(a, b);
        fenceLen += L;
        fenceM2 += L * w.height;
        stoneCourses(a, b, w.baseY, top - 0.06, 0.27, rand, blocks);
        const f = wallFrame({ a, b });
        const m = lerp2(a, b, 0.5);
        caps.push({ at: [m[0], top - 0.03, m[1]], size: [L + 0.03, 0.06, 0.34], rotY: f.rotY });
      }
    }
    let retLen = 0;
    for (const w of retaining) {
      const top = w.baseY + w.height;
      const L = dist2(w.a, w.b);
      retLen += L;
      stoneCourses(w.a, w.b, w.baseY, top - 0.06, 0.27, rand, blocks);
      const f = wallFrame(w);
      caps.push({ at: [f.mid[0], top - 0.03, f.mid[1]], size: [L + 0.03, 0.06, 0.34], rotY: f.rotY });
    }
    // Gate piers.
    const gz = (x: number) => {
      const w = fence.find((q) => Math.min(q.a[0], q.b[0]) <= x && Math.max(q.a[0], q.b[0]) >= x && q.a[1] > streetZ && q.b[1] > streetZ);
      return w ? { z: w.a[1] + ((x - w.a[0]) / (w.b[0] - w.a[0])) * (w.b[1] - w.a[1]), top: w.baseY + w.height } : { z: pb.max[1] - 0.4, top: 1.6 };
    };
    for (const x of [gx0, gx1]) {
      const g = gz(x);
      const base = ctx.heightAt(x, g.z, finished);
      piers.push({ at: [x, (base + g.top + 0.35) / 2 - 0.05, g.z], size: [0.5, g.top + 0.35 - base + 0.1, 0.5] });
      caps.push({ at: [x, g.top + 0.375, g.z], size: [0.6, 0.06, 0.6] });
    }
    const totalLen = fenceLen + retLen;
    const grading: Part = {
      id: 'terrain-finished',
      shape: { kind: 'terrain', grid: finished, from: structureFrame(ctx).backfill, baseY: ctx.terrain.baseY },
      material: 'soil',
      tags: ['ground', 'terrain'],
      anim: { type: 'morph', duration: 2.2, delay: 0.2 },
      exit: 'none',
    };
    steps.push({
      id: 'p12-site-walls',
      phase: 12,
      titleHe: 'קירות פיתוח וגדר אבן',
      materials: [
        line('גדר וחומת פיתוח מחופה אבן', totalLen, 'מ״א', 0),
        line('חיפוי אבן טבעית', fenceM2 + sum(retaining, (w) => dist2(w.a, w.b) * w.height), 'מ״ר', 0),
        line('כיפות בטון וגדרות כניסה', caps.length, 'יח׳', 0),
      ],
      costILS: roundCost(totalLen * PRICES.stoneFenceM),
      parts: [
        grading,
        boxesPart('p12-fence-stone', blocks, 'stone', ['site-wall', 'stone', 'level:site'], { type: 'courses', delay: 0.8, stagger: stagger(blocks.length / 10, 3.4, 0.2), duration: 0.35 }, { color: '#D9C8A6' }),
        boxesPart('p12-fence-caps', caps, 'concrete', ['site-wall', 'level:site'], { type: 'fade', delay: 3.6, duration: 0.8 }, { color: '#ECE6DA' }),
        boxesPart('p12-gate-piers', piers, 'stone', ['site-wall', 'gate', 'level:site'], { type: 'rise', delay: 1.0, duration: 1.0 }, { color: '#D2BF9B' }),
      ],
      remove: { tags: ['site-temp', 'terrain'] },
      camera: { fit: 'site', azimuth: 28, polar: 58, zoom: 0.95 },
      view: { xray: false },
    });
  }

  // ===================================================================== parking
  if (pk) {
    const pieces = tilePolygon(offsetPolygon(pk.outline, -0.06), [0.4, 0.2], { gap: 0.002, bond: 0.5, minPiece: 0.015 });
    const A: BoxItem[] = [];
    const B: BoxItem[] = [];
    for (const p of pieces) {
      const g = gAt(p.at);
      const it: BoxItem = { at: [p.at[0], g + TOP - 0.1, p.at[1]], size: [p.size[0], 0.2, p.size[1]] };
      ((p.i + p.j) % 2 ? A : B).push(it);
    }
    // Curb around the stalls.
    const curb: BoxItem[] = [];
    const ring = pk.outline;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (dist2(a, b) < 0.2) continue;
      const f = wallFrame({ a, b });
      const m = lerp2(a, b, 0.5);
      // Skip the open edge along the street gate.
      curb.push({ at: [m[0], gAt(m) + TOP - 0.09, m[1]], size: [f.length + 0.06, 0.22, 0.12], rotY: f.rotY });
    }
    const cars = house.fixtures.filter((f) => f.kind === 'car');
    const lines: BoxItem[] = [];
    if (cars.length >= 2) {
      const xs = cars.map((c) => c.center[0]).sort((a, b) => a - b);
      const zc = cars[0].center[1];
      const xl = [xs[0] - 1.5, (xs[0] + xs[1]) / 2, xs[1] + 1.5];
      for (const x of xl) lines.push({ at: [x, gAt([x, zc]) + TOP + 0.004, zc], size: [0.07, 0.008, 4.6] });
    }
    const area = polygonArea(pk.outline);
    steps.push({
      id: 'p12-parking',
      phase: 12,
      titleHe: 'ריצוף חניה',
      materials: [line('אבני משתלבות 20×10', area, 'מ״ר', 0), line('מצע חצץ מהודק', area * 0.25, 'מ״ק', 1), line('אבני שפה', curb.reduce((s, c) => s + c.size[0], 0), 'מ׳', 0)],
      costILS: roundCost(area * PRICES.pavingM2),
      parts: [
        boxesPart('p12-pavers-a', A, 'asphalt', ['paving', 'parking', 'level:site'], { type: 'sequence', order: 'z', stagger: stagger(A.length, 3.2, 0.03), duration: 0.3 }, { color: '#9A9791' }),
        boxesPart('p12-pavers-b', B, 'asphalt', ['paving', 'parking', 'level:site'], { type: 'sequence', order: 'z', stagger: stagger(B.length, 3.2, 0.03), duration: 0.3 }, { color: '#85827D' }),
        boxesPart('p12-parking-curb', curb, 'concrete', ['paving', 'parking', 'level:site'], { type: 'fade', delay: 2.6, duration: 0.7 }, { color: '#DAD6CD' }),
        boxesPart('p12-parking-lines', lines, 'white', ['paving', 'parking', 'level:site'], { type: 'fade', delay: 3.2, duration: 0.5 }, { edges: false }),
      ],
      camera: { bounds: polyBounds(pk.outline, -0.5, 1.5, 3), azimuth: 20, polar: 50 },
      view: { xray: false },
    });
  }

  // ===================================================================== paths + steps
  {
    const pathAreas = out.filter((o) => o.kind === 'path');
    const stepAreas = out.filter((o) => o.kind === 'steps');
    const slabsA: BoxItem[] = [];
    const slabsB: BoxItem[] = [];
    let pathM2 = 0;
    for (const o of pathAreas) {
      pathM2 += polygonArea(o.outline);
      const patio = o.id === 'O-PATIO-N';
      const tile: Vec2 = patio ? [0.9, 0.45] : [0.6, 0.4];
      for (const p of tilePolygon(offsetPolygon(o.outline, -0.02), tile, { gap: 0.002, bond: 0.5 })) {
        const g = gAt(p.at);
        const it: BoxItem = { at: [p.at[0], g + TOP - 0.1, p.at[1]], size: [p.size[0], 0.2, p.size[1]] };
        (patio ? slabsA : slabsB).push(it);
      }
    }
    // Steps: sawtooth stone blocks from the low end to the high end of each flight.
    const treads: BoxItem[] = [];
    let nSteps = 0;
    for (const o of stepAreas) {
      const b = bbox2(o.outline);
      const alongZ = b.max[1] - b.min[1] >= b.max[0] - b.min[0];
      const c = polygonCentroid(o.outline);
      const lowEnd = (flip: boolean): Vec2 => (alongZ ? [c[0], flip ? b.max[1] - 0.05 : b.min[1] + 0.05] : [flip ? b.max[0] - 0.05 : b.min[0] + 0.05, c[1]]);
      const flip = gAt(lowEnd(true)) < gAt(lowEnd(false));
      const lowGround = Math.min(gAt(lowEnd(true)), gAt(lowEnd(false)));
      const rise = o.y - lowGround;
      const n = Math.max(1, Math.round(rise / 0.17));
      const L = alongZ ? b.max[1] - b.min[1] : b.max[0] - b.min[0];
      const W = alongZ ? b.max[0] - b.min[0] : b.max[1] - b.min[1];
      const run = L / n;
      nSteps += n;
      for (let i = 1; i <= n; i++) {
        const y = lowGround + (rise * i) / n;
        const s0 = flip ? (alongZ ? b.max[1] : b.max[0]) - (i - 1) * run : (alongZ ? b.min[1] : b.min[0]) + (i - 1) * run;
        const sMid = flip ? s0 - run / 2 : s0 + run / 2;
        // Solid stepped mass from below the low ground up to the tread.
        const depth = y - (lowGround - 0.25);
        treads.push({
          at: alongZ ? [c[0], y - depth / 2, sMid] : [sMid, y - depth / 2, c[1]],
          size: alongZ ? [W, depth, run + 0.004] : [run + 0.004, depth, W],
        });
      }
    }
    // Bollard lanterns along the paths.
    const rand = rng(5);
    const posts: BoxItem[] = [];
    const heads: BoxItem[] = [];
    const lanternPts: Vec2[] = [];
    for (const o of pathAreas) {
      for (const p of samplePolygon(offsetPolygon(o.outline, -0.3), 4.2)) {
        if (houseNear(p, 0.9) || !pointInPolygon(p, o.outline)) continue;
        if (lanternPts.some((q) => dist2(p, q) < 3.0)) continue;
        if (rand() < 0.15) continue;
        lanternPts.push(p);
      }
    }
    for (const p of lanternPts.slice(0, 28)) {
      const g = gAt(p) + TOP;
      posts.push({ at: [p[0], g + 0.22, p[1]], size: [0.1, 0.44, 0.1] });
      heads.push({ at: [p[0], g + 0.47, p[1]], size: [0.12, 0.1, 0.12] });
    }
    const bounds = houseBounds(ctx, ctx.lower.floorY - 0.3, 1.5, 4);
    steps.push({
      id: 'p12-paths',
      phase: 12,
      titleHe: 'שבילים ומדרגות חוץ',
      materials: [line('ריצוף אבן בשבילים ובפטיו', pathM2, 'מ״ר', 0), line('מדרגות אבן', nSteps, 'מדרגות', 0), line('פנסי שביל', heads.length, 'יח׳', 0)],
      costILS: roundCost(pathM2 * PRICES.pavingM2 * 1.25 + nSteps * 450 + heads.length * PRICES.lightingFixture),
      parts: [
        boxesPart('p12-patio-slabs', slabsA, 'stone', ['paving', 'path', 'level:site'], { type: 'sequence', order: 'x', stagger: stagger(slabsA.length, 3, 0.04), duration: 0.3 }, { color: '#D3CABB' }),
        boxesPart('p12-path-slabs', slabsB, 'stone', ['paving', 'path', 'level:site'], { type: 'sequence', order: 'x', delay: 0.8, stagger: stagger(slabsB.length, 3, 0.04), duration: 0.3 }, { color: '#DCD2BF' }),
        boxesPart('p12-outdoor-steps', treads, 'stone', ['paving', 'steps', 'level:site'], { type: 'sequence', order: 'y', delay: 1.0, stagger: 0.06, duration: 0.3 }, { color: '#D6CAB1' }),
        boxesPart('p12-lantern-posts', posts, 'aluminum', ['lighting', 'lantern', 'level:site'], { type: 'rise', delay: 3, duration: 0.6 }),
        boxesPart('p12-lantern-heads', heads, 'light', ['lighting', 'lantern', 'level:site'], { type: 'fade', delay: 3.4, duration: 0.5 }, { edges: false, castShadow: false }),
      ],
      camera: { bounds, azimuth: 150, polar: 52 },
      view: { xray: false },
    });
  }

  // ===================================================================== terrace + coping
  {
    const ter = house.rooms.find((r) => r.kind === 'terrace');
    const slab = house.slabs.find((s) => s.role === 'terrace');
    const boards: BoxItem[] = [];
    const rand = rng(9);
    let deckM2 = 0;
    if (ter) {
      const top = -0.02;
      const y0 = (slab?.topY ?? -0.12) + 0.0;
      deckM2 = polygonArea(ter.polygon);
      for (const p of tilePolygon(offsetPolygon(ter.polygon, -0.01), [2.4, 0.145], { gap: 0.012, bond: 0, random: rand })) {
        boards.push({ at: [p.at[0], (top + y0) / 2, p.at[1]], size: [p.size[0], top - y0, p.size[1]] });
      }
    }
    // Planter pots in the terrace corners.
    const pots: Part[] = [];
    if (ter) {
      const tb = bbox2(ter.polygon);
      [[tb.min[0] + 0.5, tb.min[1] + 0.5], [tb.max[0] - 0.5, tb.min[1] + 0.5]].forEach((c, i) => {
        if (!pointInPolygon([c[0], c[1]], ter.polygon)) return;
        pots.push({
          id: `p12-terrace-pot-${i}`,
          shape: { kind: 'model', name: 'planter', size: [0.6, 1.2, 0.6] },
          material: 'white',
          position: [c[0], -0.02, c[1]],
          tags: ['deck', 'model', 'level:entrance'],
          anim: { type: 'grow', delay: 2.8 + i * 0.3, duration: 0.6, ease: 'back' },
        });
      });
    }
    steps.push({
      id: 'p12-terrace',
      phase: 12,
      titleHe: 'מרפסות ודק',
      materials: [line('דק עץ קומפוזיט', deckM2, 'מ״ר', 0), line('פרופילי אלומיניום ומסילות', deckM2 * 1.8, 'מ׳', 0), line('עציצים', pots.length, 'יח׳', 0)],
      costILS: roundCost(deckM2 * PRICES.deckM2),
      parts: [
        boxesPart('p12-deck-boards', boards, 'wood', ['deck', 'level:entrance'], { type: 'sequence', order: 'z', stagger: stagger(boards.length, 3, 0.1), duration: 0.35 }, { color: '#A47B54' }),
        ...pots,
      ],
      camera: { fit: 'house', azimuth: 165, polar: 50, zoom: 0.9 },
      view: { xray: false },
    });
  }

  // ===================================================================== pergola
  {
    const pg = byId('O-PERGOLA');
    const topY = pg?.y ?? 2.6;
    const beams: BoxItem[] = [];
    const slats: BoxItem[] = [];
    const posts: BoxItem[] = [];
    let area = 0;
    if (pg) {
      const ring = pg.outline;
      area = polygonArea(ring);
      const bb = bbox2(ring);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const f = wallFrame({ a, b });
        const m = lerp2(a, b, 0.5);
        beams.push({ at: [m[0], topY - 0.15, m[1]], size: [f.length + 0.1, 0.2, 0.1], rotY: f.rotY });
        for (const p of samplePolygon([a, b], 3.2, false)) {
          const g = Math.min(gAt(p), 2.0);
          posts.push({ at: [p[0], (g + topY - 0.25) / 2, p[1]], size: [0.12, topY - 0.25 - g, 0.12] });
        }
      }
      const zs = Array.from(new Set(ring.map((p) => p[1]))).sort((a, b) => a - b);
      const zSplit = zs.length > 2 ? zs[zs.length - 2] : (bb.min[1] + bb.max[1]) / 2;
      // Rows over the long arm: slats run along X.
      for (let z = bb.min[1] + 0.2; z < zSplit - 0.1; z += 0.4) {
        const xs: number[] = [];
        for (let x = bb.min[0]; x <= bb.max[0]; x += 0.05) if (pointInPolygon([x, z], ring)) xs.push(x);
        if (xs.length) slats.push({ at: [(xs[0] + xs[xs.length - 1]) / 2, topY - 0.04, z], size: [xs[xs.length - 1] - xs[0] + 0.1, 0.08, 0.05] });
      }
      // Strip along the south: slats run along Z.
      for (let x = bb.min[0] + 0.2; x < bb.max[0]; x += 0.4) {
        const zl: number[] = [];
        for (let z = zSplit - 0.05; z <= bb.max[1]; z += 0.05) if (pointInPolygon([x, z], ring)) zl.push(z);
        if (zl.length > 3) slats.push({ at: [x, topY - 0.04, (zl[0] + zl[zl.length - 1]) / 2], size: [0.05, 0.08, zl[zl.length - 1] - zl[0] + 0.1] });
      }
    }
    steps.push({
      id: 'p12-pergola',
      phase: 12,
      titleHe: 'פרגולה',
      materials: [line('פרגולת אלומיניום (שטח מכוסה)', area, 'מ״ר', 0), line('עמודים ופרופילי קורה', posts.length + beams.length, 'יח׳', 0), line('לוחות צל', slats.length, 'יח׳', 0)],
      costILS: roundCost(area * PRICES.pergolaM2),
      parts: [
        boxesPart('p12-pergola-posts', posts, 'aluminum', ['pergola', 'level:site'], { type: 'rise', stagger: 0.12, duration: 0.7, order: 'near', origin: ctx.lot.gate }),
        boxesPart('p12-pergola-beams', beams, 'aluminum', ['pergola', 'level:site'], { type: 'drop', from: [0, 1.0, 0], delay: 1.2, stagger: 0.12, duration: 0.6, order: 'index' }),
        boxesPart('p12-pergola-slats', slats, 'aluminum', ['pergola', 'level:site'], { type: 'sequence', order: 'z', delay: 2.0, stagger: stagger(slats.length, 2.6, 0.08), duration: 0.35 }, { color: '#4A4F55' }),
      ],
      camera: pg ? { bounds: polyBounds(pg.outline, -0.5, 3.2, 2.5), azimuth: 60, polar: 52 } : { fit: 'house' },
      view: { xray: false },
    });
  }

  // ===================================================================== garden
  {
    const parts: Part[] = [];
    const lotRing = offsetPolygon(ctx.lot.boundary, -0.32);
    const fp = ctx.footprint.house;
    const fb = bbox2(fp);
    const lb = bbox2(lotRing);
    const M = 0.65;
    // The west side yard carries the garden stair and path: gravel there, lawn beyond it.
    const westHard = out.filter((o) => (o.kind === 'steps' || o.kind === 'path') && polygonCentroid(o.outline)[0] < fb.min[0] - 0.5).map((o) => bbox2(o.outline));
    const wz0 = westHard.length ? Math.min(...westHard.map((b) => b.min[1])) - 0.3 : lb.min[1];
    const wz1 = westHard.length ? Math.max(...westHard.map((b) => b.max[1])) + 0.3 : lb.min[1];
    const lawnRects: Array<[string, Vec2, Vec2]> = [
      ['w1', [lb.min[0], lb.min[1]], [fb.min[0] - M, wz0]],
      ['w2', [lb.min[0], wz1], [fb.min[0] - M, lb.max[1]]],
      ['e', [fb.max[0] + M, lb.min[1]], [lb.max[0], lb.max[1]]],
      ['n', [fb.min[0] - M, lb.min[1]], [fb.max[0] + M, fb.min[1] - M]],
      ['s', [fb.min[0] - M, fb.max[1] + M], [fb.max[0] + M, lb.max[1]]],
    ];
    for (const [k, lo, hi] of lawnRects) {
      const poly = clipPolygonToRect(lotRing, lo, hi);
      if (poly.length < 3) continue;
      parts.push({
        id: `p12-lawn-${k}`,
        shape: { kind: 'drape', outline: poly, grid: finished, lift: 0.02, cell: 0.5 },
        material: 'grass',
        tags: ['garden', 'lawn', 'level:site'],
        anim: { type: 'fade', duration: 1.8 },
      });
    }
    const westGravel = clipPolygonToRect(lotRing, [lb.min[0], wz0], [fb.min[0] - M, wz1]);
    if (westGravel.length >= 3)
      parts.push({
        id: 'p12-west-gravel',
        shape: { kind: 'drape', outline: westGravel, grid: finished, lift: 0.028, cell: 0.5 },
        material: 'gravel',
        color: '#CDC4B2',
        tags: ['garden', 'gravel', 'level:site'],
        anim: { type: 'fade', delay: 0.6, duration: 1.2 },
        edges: false,
      });
    // Gravel strip (drainage) around the house.
    const gravel: BoxItem[] = [];
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i];
      const b = fp[(i + 1) % fp.length];
      const L = dist2(a, b);
      if (L < 0.3) continue;
      const f = wallFrame({ a, b });
      const n = Math.max(1, Math.round(L / 1.0));
      // Outward direction: away from the footprint centroid side.
      const mid = lerp2(a, b, 0.5);
      const outN: Vec2 = [f.normal[0], f.normal[1]];
      const probe: Vec2 = [mid[0] + outN[0] * 0.2, mid[1] + outN[1] * 0.2];
      const sgn = pointInPolygon(probe, fp) ? -1 : 1;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const pm = lerp2(a, b, (t0 + t1) / 2);
        const c: Vec2 = [pm[0] + outN[0] * sgn * 0.32, pm[1] + outN[1] * sgn * 0.32];
        gravel.push({ at: [c[0], gAt(c) + 0.015, c[1]], size: [L / n + 0.02, 0.05, 0.6], rotY: f.rotY });
      }
    }
    parts.push(boxesPart('p12-house-gravel', gravel, 'gravel', ['garden', 'gravel', 'level:site'], { type: 'fade', delay: 0.5, duration: 1.2 }, { color: '#CBC3B4', edges: false }));
    const side = byId('O-SIDE-W');
    if (side)
      parts.push({
        id: 'p12-side-gravel',
        shape: { kind: 'drape', outline: side.outline, grid: finished, lift: 0.045, cell: 0.4 },
        material: 'gravel',
        color: '#CFC7B8',
        tags: ['garden', 'gravel', 'level:site'],
        anim: { type: 'fade', delay: 0.8, duration: 1.0 },
        edges: false,
      });
    // Planting beds + stone planter edges.
    const beds = out.filter((o) => o.kind === 'planter' || o.id === 'O-GARDEN-N');
    const edge: BoxItem[] = [];
    for (const o of beds) {
      parts.push({
        id: `p12-bed-${o.id}`,
        shape: { kind: 'drape', outline: offsetPolygon(o.outline, o.kind === 'planter' ? -0.12 : -0.05), grid: finished, lift: 0.07, cell: 0.4 },
        material: 'soil',
        color: '#6E5238',
        tags: ['garden', 'bed', 'level:site'],
        anim: { type: 'fade', delay: 1.0, duration: 1.0 },
        edges: false,
      });
      if (o.kind !== 'planter') continue;
      const ring = o.outline;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (dist2(a, b) < 0.15) continue;
        const f = wallFrame({ a, b });
        const m = lerp2(a, b, 0.5);
        const nrm = norm2(sub2(m, polygonCentroid(ring)));
        const outsideP: Vec2 = [m[0] + nrm[0] * 0.4, m[1] + nrm[1] * 0.4];
        const low = Math.min(gAt(outsideP), o.y) - 0.15;
        const hTop = o.y + 0.08;
        edge.push({ at: [m[0], (low + hTop) / 2, m[1]], size: [f.length + 0.05, hTop - low, 0.22], rotY: f.rotY });
      }
    }
    parts.push(boxesPart('p12-planter-walls', edge, 'stone', ['garden', 'planter', 'level:site'], { type: 'rise', delay: 0.4, duration: 1.0 }, { color: '#D9CBAA' }));

    // Trees: the plan's own symbols first, then a few more for the finished look.
    const treeFx = house.fixtures.filter((f) => f.kind === 'tree');
    const placed: Vec2[] = [];
    let treeN = 0;
    treeFx.forEach((f, i) => {
      const palm = i === 0;
      placed.push(f.center);
      parts.push({
        id: `p12-tree-${f.id}`,
        shape: { kind: 'model', name: palm ? 'palm' : 'tree-olive', size: palm ? [3.4, 5.4, 3.4] : [2.4, 3.2, 2.4], seed: 3 + i },
        material: 'white',
        position: [f.center[0], f.y ?? gAt(f.center), f.center[1]],
        rotationY: i * 1.3,
        tags: ['garden', 'tree', 'model', 'level:site'],
        anim: { type: 'grow', delay: 1.6 + treeN * 0.25, duration: 1.0, ease: 'back' },
      });
      treeN += 1;
    });
    const rand = rng(21);
    const lawnAreas = out.filter((o) => o.kind === 'lawn' || o.id === 'O-GARDEN-N' || o.id === 'O-YARD-W');
    const cand: Vec2[] = [];
    for (const o of lawnAreas) {
      const b = bbox2(o.outline);
      for (let x = b.min[0] + 1; x < b.max[0]; x += 0.8)
        for (let z = b.min[1] + 1; z < b.max[1]; z += 0.8) {
          const p: Vec2 = [x + rand() * 0.4, z + rand() * 0.4];
          if (pointInPolygon(p, offsetPolygon(o.outline, -0.9)) && !houseNear(p, 3.4) && !onHard(p, 0.7)) cand.push(p);
        }
    }
    // Shuffle deterministically, pick spaced spots.
    cand.sort(() => rand() - 0.5);
    const extra: Vec2[] = [];
    for (const p of cand) {
      if (extra.length >= 6) break;
      if ([...placed, ...extra].some((q) => dist2(p, q) < 4.2)) continue;
      extra.push(p);
    }
    extra.forEach((p, i) => {
      parts.push({
        id: `p12-tree-extra-${i}`,
        shape: { kind: 'model', name: i % 3 === 2 ? 'tree' : 'tree-olive', size: i % 3 === 2 ? [3.4, 5.0, 3.4] : [2.6, 3.4, 2.6], seed: 20 + i },
        material: 'white',
        position: [p[0], gAt(p), p[1]],
        rotationY: i * 0.9,
        tags: ['garden', 'tree', 'model', 'level:site'],
        anim: { type: 'grow', delay: 2.6 + i * 0.25, duration: 1.0, ease: 'back' },
      });
    });
    // Hedge bushes along the north and west fences + planter pots at the entrance.
    const bushes: Vec2[] = [];
    for (const w of house.walls.filter((q) => q.role === 'fence')) {
      const m = lerp2(w.a, w.b, 0.5);
      if (m[1] > ctx.lot.bbox.max[1] - 3 || m[0] > ctx.lot.bbox.max[0] - 1.5) continue;
      const toC = norm2(sub2(ctx.lot.center, m));
      const p: Vec2 = [m[0] + toC[0] * 0.7, m[1] + toC[1] * 0.7];
      if (!pointInPolygon(p, lotRing) || houseNear(p, 2.0) || onHard(p, 0.5)) continue;
      if (bushes.some((q) => dist2(p, q) < 1.9)) continue;
      bushes.push(p);
    }
    bushes.forEach((p, i) => {
      parts.push({
        id: `p12-bush-${i}`,
        shape: { kind: 'model', name: 'bush', size: [1.3, 1.0, 1.3], seed: 40 + i },
        material: 'white',
        position: [p[0], gAt(p), p[1]],
        rotationY: i * 2.1,
        tags: ['garden', 'bush', 'model', 'level:site'],
        anim: { type: 'grow', delay: 2.2 + i * 0.1, duration: 0.7, ease: 'back' },
      });
    });
    const treeCount = treeFx.length + extra.length;
    const lawnM2 = polygonArea(ctx.lot.boundary) - polygonArea(fp) - sum(hardAreas, (o) => polygonArea(o.outline));
    steps.push({
      id: 'p12-garden',
      phase: 12,
      titleHe: 'גינה: דשא, עצים ואדניות',
      materials: [line('דשא מגולגל כולל השקיה', Math.max(0, lawnM2), 'מ״ר', 0), line('עצים בוגרים', treeCount, 'יח׳', 0), line('שיחים ואדניות', bushes.length + edge.length, 'יח׳', 0), line('חצץ דקורטיבי', 30, 'מ״ר', 0)],
      costILS: roundCost(Math.max(0, lawnM2) * PRICES.lawnM2 + treeCount * PRICES.tree + bushes.length * 220),
      parts,
      camera: { fit: 'site', azimuth: 155, polar: 55, zoom: 0.95 },
      view: { xray: false },
    });
  }

  // ===================================================================== outdoor furniture
  {
    const fx = house.fixtures.filter((f) => f.level === 'site' && f.kind !== 'car' && f.kind !== 'tree');
    const parts: Part[] = [];
    const bbq: BoxItem[] = [];
    const bbqTop: BoxItem[] = [];
    const bbqGrill: BoxItem[] = [];
    fx.forEach((f, i) => {
      const y = f.y ?? 0;
      if (f.kind === 'kitchen-counter') {
        const [w, d] = f.size;
        const c = f.center;
        const rot = f.rotation;
        bbq.push({ at: [c[0], y + 0.45, c[1]], size: [w, 0.9, d], rotY: rot });
        bbqTop.push({ at: [c[0], y + 0.92, c[1]], size: [w + 0.06, 0.05, d + 0.06], rotY: rot });
        const gx = c[0] + Math.cos(rot) * (-w / 4);
        const gz = c[1] - Math.sin(rot) * (-w / 4);
        bbqGrill.push({ at: [gx, y + 1.08, gz], size: [0.9, 0.26, 0.5], rotY: rot });
        return;
      }
      const name = f.kind === 'outdoor-table' ? 'outdoor-table' : f.kind === 'lounge-chair' ? 'lounge-chair' : f.kind === 'armchair' ? 'armchair' : f.kind === 'coffee-table' ? 'coffee-table' : null;
      if (!name) return;
      parts.push(
        fixtureModel(ctx, f as Fixture, name, `p12-furn-${f.id}`, {
          tags: ['furniture', 'outdoor'],
          anim: { type: 'drop', from: [0, 1.6, 0], delay: i * 0.22, duration: 0.7, ease: 'bounce' },
        }),
      );
    });
    if (bbq.length) {
      parts.push(
        boxesPart('p12-bbq-base', bbq, 'stone', ['furniture', 'bbq', 'level:site'], { type: 'drop', from: [0, 1.4, 0], delay: 1.8, duration: 0.8, ease: 'bounce' }, { color: '#C9BCA3' }),
        boxesPart('p12-bbq-top', bbqTop, 'concrete', ['furniture', 'bbq', 'level:site'], { type: 'fade', delay: 2.4, duration: 0.5 }, { color: '#4A4D52' }),
        boxesPart('p12-bbq-grill', bbqGrill, 'steel', ['furniture', 'bbq', 'level:site'], { type: 'drop', from: [0, 1.0, 0], delay: 2.5, duration: 0.6 }),
      );
    }
    // Planter pots at the entrance and on the terrace.
    const pots: Vec3[] = [];
    const entry = house.rooms.find((r) => r.kind === 'entry');
    if (entry) {
      const c = polygonCentroid(entry.polygon);
      pots.push([c[0] - 0.3, 0, c[1] - 0.7], [c[0] - 0.3, 0, c[1] + 0.7]);
    }
    pots.forEach((p, i) =>
      parts.push({
        id: `p12-pot-${i}`,
        shape: { kind: 'model', name: 'planter', size: [0.55, 1.1, 0.55] },
        material: 'white',
        position: [p[0], -0.1, p[2]],
        tags: ['furniture', 'model', 'level:entrance'],
        anim: { type: 'grow', delay: 2.8 + i * 0.2, duration: 0.6, ease: 'back' },
      }),
    );
    steps.push({
      id: 'p12-outdoor-furniture',
      phase: 12,
      titleHe: 'ריהוט חוץ',
      materials: [line('ריהוט גן (פינות ישיבה ושולחנות)', fx.length, 'יח׳', 0), line('מנגל בנוי', 1, 'יח׳', 0), line('עציצים', pots.length, 'יח׳', 0)],
      costILS: roundCost(fx.length * 2400 + 9000),
      parts,
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY - 0.2, 2.8, 3), azimuth: 120, polar: 52 },
      view: { xray: false },
    });
  }

  return steps;
}
