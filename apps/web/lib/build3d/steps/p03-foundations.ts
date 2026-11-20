/**
 * Phase 3 · יסודות — piles (drill → cages → pour), grade beams (forms → rebar →
 * sleeves & sewer → pour → strip). Quantities are computed from ctx.piles/ctx.beams.
 */
import {
  add2,
  angleOfDir,
  bbox2,
  dist2,
  distanceToSegment,
  lerp2,
  norm2,
  pointInPolygon,
  polygonCentroid,
  sampleGrid,
  scale2,
  sub2,
  wallFrame,
} from '../house/geometry';
import type { CameraHint, Part, PrimitiveShape, StepDef, Vec2, Vec3 } from '../engine/types';
import type { Beam, BuildContext, Pile } from './context';
import { PRICES, helix, line, model, rebarKg, roundCost } from './kit';
import { siteLayout } from './p01-site';

const COVER = 0.05;

function houseBounds(ctx: BuildContext, yMin: number, yMax: number, grow = 1.5): CameraHint['bounds'] {
  const b = bbox2(ctx.footprint.house);
  return { min: [b.min[0] - grow, yMin, b.min[1] - grow], max: [b.max[0] + grow, yMax, b.max[1] + grow] };
}

const beamBottom = (b: Beam) => b.topY - b.depth;

export function phaseFoundations(ctx: BuildContext): StepDef[] {
  const lay = siteLayout(ctx);
  const piles = ctx.piles;
  const beams = ctx.beams;
  const { excavated } = ctx.terrain;
  const gY = (p: Vec2) => sampleGrid(excavated, p[0], p[1]);
  const yLow = Math.min(...piles.map((p) => p.tipY), ctx.y.pitFloor);
  const yTop = ctx.y.entranceBeamTop + 0.5;

  // Drill rig beside the pile closest to the gate.
  const first = piles.reduce((b, p) => (dist2(p.at, ctx.lot.gate) < dist2(b.at, ctx.lot.gate) ? p : b), piles[0]);
  const hc = polygonCentroid(ctx.footprint.house);
  const rigDir = norm2(sub2(first.at, hc));
  const rigAt = add2(first.at, scale2(rigDir, 1.6));
  const rigRot = angleOfDir([-rigDir[0], -rigDir[1]]);
  const order = { order: 'near' as const, origin: first.at };

  // ---------------------------------------------------------------- drilling
  const totalLen = piles.reduce((s, p) => s + (p.topY - p.tipY), 0);
  const holeR = (p: Pile) => p.r + 0.03;
  const drilling: StepDef = {
    id: 'p3-pile-drilling',
    phase: 3,
    titleHe: 'קידוח כלונסאות',
    materials: [
      line('כלונסאות קוטר 50 ס״מ', piles.length, 'יח׳', 0),
      line('אורך קידוח כולל', totalLen, 'מ׳', 0),
      line('עודפי חפירה מהקידוח', piles.reduce((s, p) => s + Math.PI * holeR(p) ** 2 * (p.topY - p.tipY), 0), 'מ״ק', 1),
    ],
    costILS: roundCost(totalLen * PRICES.pileDrillingM),
    remove: { tags: ['compact'] },
    parts: [
      model('drill-rig', 'drill-rig', [rigAt[0], gY(rigAt), rigAt[1]], rigRot, {
        tags: ['machine', 'rig'],
        idle: true,
        anim: { type: 'slide', from: [rigDir[0] * 8, 0, rigDir[1] * 8], duration: 1.4 },
      }),
      {
        id: 'pile-holes',
        shape: {
          kind: 'rods',
          radius: 0.28,
          segments: 16,
          items: piles.map((p) => ({ a: [p.at[0], p.groundY + 0.012, p.at[1]] as Vec3, b: [p.at[0], p.tipY, p.at[1]] as Vec3, r: holeR(p) })),
        },
        material: 'hole',
        tags: ['holes'],
        edges: false,
        ghost: false,
        anim: { type: 'rise', delay: 1.2, stagger: Math.min(0.14, 3 / piles.length), duration: 0.6, ease: 'out', ...order },
      },
      {
        id: 'pile-spoil',
        shape: {
          kind: 'instances',
          of: { kind: 'cylinder', radius: 0.52, radiusTop: 0.3, height: 0.07, segments: 16, open: true },
          items: piles.map((p) => ({ at: [p.at[0], p.groundY - 0.03, p.at[1]] as Vec3 })),
        },
        material: 'soilCut',
        tags: ['holes'],
        edges: false,
        ghost: false,
        anim: { type: 'grow', delay: 1.4, stagger: Math.min(0.14, 3 / piles.length), duration: 0.5, ...order },
      },
    ],
    camera: { bounds: houseBounds(ctx, yLow, yTop), polar: 54 },
    view: { groundXray: true, xray: false },
  };

  // ---------------------------------------------------------------- cages
  const cageParts: Part[] = [];
  let cageKg = 0;
  (['lower', 'entrance'] as const).forEach((lvl) => {
    const ps = piles.filter((p) => p.level === lvl);
    if (!ps.length) return;
    const L = ps[0].topY - ps[0].tipY - 0.1 + 0.5; // + starter bars into the beam
    const rc = ps[0].r - 0.07;
    const bars: PrimitiveShape[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      bars.push({ kind: 'rod', a: [Math.cos(a) * rc, 0, Math.sin(a) * rc], b: [Math.cos(a) * rc, L, Math.sin(a) * rc], radius: 0.014, segments: 5 });
    }
    bars.push({ kind: 'tube', points: helix(rc + 0.008, 0.2, 0.05, L - 0.5), radius: 0.008, bend: 0, radialSegments: 4 });
    cageKg += ps.length * (rebarKg(16, L * 8) + rebarKg(8, (L / 0.2) * 2 * Math.PI * rc));
    cageParts.push({
      id: `pile-cages-${lvl}`,
      shape: { kind: 'instances', of: { kind: 'merge', shapes: bars }, items: ps.map((p) => ({ at: [p.at[0], p.tipY + 0.1, p.at[1]] as Vec3 })) },
      material: 'rebar',
      tags: ['rebar', `level:${lvl}`],
      edges: false,
      anim: { type: 'drop', from: [0, L + 1.2, 0], duration: 1.1, stagger: Math.min(0.18, 2.6 / ps.length), ease: 'inOut', delay: lvl === 'lower' ? 0.3 : 0.9, ...order },
    });
  });
  const cages: StepDef = {
    id: 'p3-pile-cages',
    phase: 3,
    titleHe: 'הורדת כלובי זיון',
    materials: [
      line('כלובי זיון', piles.length, 'יח׳', 0),
      line('ברזל זיון (קוטר 16 + ספירלה 8)', cageKg / 1000, 'טון', 2),
    ],
    costILS: roundCost((cageKg / 1000) * PRICES.rebarTon),
    parts: cageParts,
    camera: { bounds: houseBounds(ctx, yLow, yTop + 2), polar: 56 },
    view: { groundXray: true, xray: false },
  };

  // ---------------------------------------------------------------- pour piles
  const pileM3 = piles.reduce((s, p) => s + Math.PI * p.r * p.r * (p.topY - p.tipY), 0) * 1.1;
  const mixerAt = lay.truck;
  const pilePour: StepDef = {
    id: 'p3-pile-pour',
    phase: 3,
    titleHe: 'יציקת כלונסאות',
    materials: [line('בטון ב-30 לכלונסאות', pileM3, 'מ״ק', 1), line('מערבלי בטון', Math.ceil(pileM3 / 8), 'נסיעות', 0)],
    costILS: roundCost(pileM3 * PRICES.concreteM3),
    remove: { ids: ['drill-rig'] },
    parts: [
      {
        id: 'piles-concrete',
        shape: {
          kind: 'rods',
          radius: 0.25,
          segments: 18,
          items: piles.map((p) => ({ a: [p.at[0], p.tipY, p.at[1]] as Vec3, b: [p.at[0], p.topY, p.at[1]] as Vec3, r: p.r })),
        },
        material: 'concrete',
        tags: ['concrete', 'piles'],
        anim: { type: 'pour', delay: 1.0, stagger: Math.min(0.16, 3 / piles.length), duration: 1.0, ...order },
      },
      model('mixer-pile', 'mixer-truck', [mixerAt[0], ctx.heightAt(mixerAt[0], mixerAt[1], excavated), mixerAt[1]], lay.truckRot, {
        tags: ['machine', 'mixer'],
        anim: { type: 'slide', from: [-ctx.lot.street.inward[0] * 10, 0, -ctx.lot.street.inward[1] * 10], duration: 1.4 },
      }),
    ],
    camera: { bounds: houseBounds(ctx, yLow, yTop), polar: 56 },
    view: { groundXray: true, xray: false },
  };

  // ---------------------------------------------------------------- forms
  const boards: Array<{ at: Vec3; size: Vec3; rotY: number }> = [];
  const soldiers: Array<{ at: Vec3; size: Vec3; rotY: number }> = [];
  let formM2 = 0;
  for (const b of beams) {
    const f = wallFrame(b);
    const L = f.length;
    const y0 = beamBottom(b);
    const y1 = b.topY + 0.06;
    const m = lerp2(b.a, b.b, 0.5);
    for (const side of [-1, 1]) {
      const o = side * (b.w / 2 + 0.012);
      boards.push({ at: [m[0] + f.normal[0] * o, (y0 + y1) / 2, m[1] + f.normal[1] * o], size: [L + 0.04, y1 - y0, 0.021], rotY: f.rotY });
      const n = Math.max(2, Math.round(L / 0.9) + 1);
      for (let i = 0; i < n; i++) {
        const s = 0.1 + ((L - 0.2) * i) / (n - 1);
        const os = side * (b.w / 2 + 0.024 + 0.025);
        soldiers.push({
          at: [b.a[0] + f.dir[0] * s + f.normal[0] * os, (y0 + y1 + 0.08) / 2, b.a[1] + f.dir[1] * s + f.normal[1] * os],
          size: [0.1, y1 - y0 + 0.08, 0.05],
          rotY: f.rotY,
        });
      }
    }
    formM2 += 2 * L * b.depth;
  }
  const forms: StepDef = {
    id: 'p3-gradebeam-forms',
    phase: 3,
    titleHe: 'טפסנות לקורות יסוד',
    materials: [
      line('תבניות לקורות יסוד', formM2, 'מ״ר', 0),
      line('קורות יסוד (אורך כולל)', beams.reduce((s, b) => s + dist2(b.a, b.b), 0), 'מ׳', 0),
      line('קורות עץ לחיזוק', soldiers.length, 'יח׳', 0),
    ],
    costILS: roundCost(formM2 * PRICES.formworkM2),
    remove: { tags: ['holes'] },
    parts: [
      {
        id: 'gb-forms-boards',
        shape: { kind: 'boxes', items: boards },
        material: 'plywood',
        tags: ['formwork', 'gb-forms'],
        anim: { type: 'rise', stagger: Math.min(0.08, 3 / Math.max(1, boards.length)), duration: 0.5, order: 'near', origin: ctx.lot.gate },
      },
      {
        id: 'gb-forms-soldiers',
        shape: { kind: 'boxes', items: soldiers },
        material: 'timber',
        tags: ['formwork', 'gb-forms'],
        anim: { type: 'drop', from: [0, 0.8, 0], stagger: Math.min(0.02, 3 / Math.max(1, soldiers.length)), duration: 0.4, delay: 0.6, order: 'near', origin: ctx.lot.gate, ease: 'out' },
      },
    ],
    camera: { bounds: houseBounds(ctx, ctx.y.pitFloor, yTop, 1), polar: 50 },
  };

  // ---------------------------------------------------------------- rebar
  const bars: Array<{ a: Vec3; b: Vec3 }> = [];
  const stirrups: Array<{ a: Vec3; b: Vec3 }> = [];
  let barLen = 0;
  let stirrupLen = 0;
  for (const b of beams) {
    const f = wallFrame(b);
    const L = f.length;
    const yb = beamBottom(b) + COVER;
    const yt = b.topY - COVER;
    const half = b.w / 2 - COVER;
    const ext = 0.12;
    for (const y of [yb, yt]) {
      for (const o of [-half, 0, half]) {
        const pa = add2(add2(b.a, scale2(f.dir, -ext)), scale2(f.normal, o));
        const pb = add2(add2(b.b, scale2(f.dir, ext)), scale2(f.normal, o));
        bars.push({ a: [pa[0], y, pa[1]], b: [pb[0], y, pb[1]] });
        barLen += L + 2 * ext;
      }
    }
    const n = Math.max(2, Math.floor(L / 0.2));
    for (let i = 0; i <= n; i++) {
      const c = add2(b.a, scale2(f.dir, 0.05 + ((L - 0.1) * i) / n));
      const l = add2(c, scale2(f.normal, -half - 0.012));
      const r = add2(c, scale2(f.normal, half + 0.012));
      const y0 = yb - 0.012;
      const y1 = yt + 0.012;
      stirrups.push(
        { a: [l[0], y0, l[1]], b: [l[0], y1, l[1]] },
        { a: [r[0], y0, r[1]], b: [r[0], y1, r[1]] },
        { a: [l[0], y0, l[1]], b: [r[0], y0, r[1]] },
        { a: [l[0], y1, l[1]], b: [r[0], y1, r[1]] },
      );
      stirrupLen += 2 * (yt - yb + 2 * half) + 0.2;
    }
  }
  const kg16 = rebarKg(16, barLen);
  const kg8 = rebarKg(8, stirrupLen);
  const rebar: StepDef = {
    id: 'p3-gradebeam-rebar',
    phase: 3,
    titleHe: 'זיון קורות יסוד',
    materials: [
      line('ברזל ראשי קוטר 16', kg16 / 1000, 'טון', 2),
      line('חישוקים קוטר 8 כל 20 ס״מ', kg8 / 1000, 'טון', 2),
      line('חישוקים', stirrups.length / 4, 'יח׳', 0),
    ],
    costILS: roundCost(((kg16 + kg8) / 1000) * PRICES.rebarTon),
    parts: [
      {
        id: 'gb-stirrups',
        shape: { kind: 'rods', radius: 0.0085, segments: 5, items: stirrups },
        material: 'rebar',
        tags: ['rebar', 'gb-rebar'],
        anim: { type: 'grow', stagger: 2.6 / Math.max(1, stirrups.length), duration: 0.35, order: 'near', origin: ctx.lot.gate, ease: 'out' },
      },
      {
        id: 'gb-bars',
        shape: { kind: 'rods', radius: 0.013, segments: 6, items: bars },
        material: 'rebar',
        tags: ['rebar', 'gb-rebar'],
        anim: { type: 'rise', stagger: 1.6 / Math.max(1, bars.length), duration: 0.6, delay: 1.2, order: 'near', origin: ctx.lot.gate },
      },
    ],
    camera: { bounds: houseBounds(ctx, ctx.y.pitFloor, yTop, 0.5), polar: 44, zoom: 0.92 },
    view: { xray: true, ghostTags: ['gb-forms'] },
  };

  // ---------------------------------------------------------------- sleeves & sewer
  const sleeves = sewerAndSleeves(ctx, excavated);

  // ---------------------------------------------------------------- pour beams
  const gbM3 = beams.reduce((s, b) => s + dist2(b.a, b.b) * b.w * b.depth, 0);
  const pumpAt = lay.truck;
  const gbPour: StepDef = {
    id: 'p3-gradebeam-pour',
    phase: 3,
    titleHe: 'יציקת קורות יסוד',
    materials: [line('בטון ב-30 לקורות יסוד', gbM3, 'מ״ק', 1), line('משאבת בטון', 1, 'יום', 0)],
    costILS: roundCost(gbM3 * PRICES.concreteM3 + PRICES.pumpDay),
    remove: { ids: ['mixer-pile'] },
    parts: [
      {
        id: 'gb-concrete',
        shape: {
          kind: 'boxes',
          items: beams.map((b) => {
            const f = wallFrame(b);
            const m = lerp2(b.a, b.b, 0.5);
            return { at: [m[0], b.topY - b.depth / 2, m[1]] as Vec3, size: [f.length, b.depth, b.w] as Vec3, rotY: f.rotY };
          }),
        },
        material: 'concrete',
        tags: ['concrete', 'grade-beams'],
        anim: { type: 'pour', delay: 1.2, stagger: Math.min(0.16, 2.6 / Math.max(1, beams.length)), duration: 1.0, order: 'near', origin: ctx.lot.gate },
      },
      model('pump-gb', 'pump-truck', [pumpAt[0], ctx.heightAt(pumpAt[0], pumpAt[1], excavated), pumpAt[1]], lay.truckRot, {
        tags: ['machine', 'pump'],
        anim: { type: 'slide', from: [-ctx.lot.street.inward[0] * 10, 0, -ctx.lot.street.inward[1] * 10], duration: 1.3 },
      }),
    ],
    camera: { bounds: houseBounds(ctx, ctx.y.pitFloor, yTop, 1.5), polar: 50 },
    view: { xray: true },
  };

  // ---------------------------------------------------------------- strip
  const strip: StepDef = {
    id: 'p3-gradebeam-strip',
    phase: 3,
    titleHe: 'פירוק טפסות',
    materials: [line('פירוק תבניות', formM2, 'מ״ר', 0)],
    costILS: 0,
    remove: { tags: ['gb-forms', 'pump'] },
    parts: [],
    camera: { bounds: houseBounds(ctx, ctx.y.pitFloor, yTop, 1.5), polar: 52 },
  };

  return [drilling, cages, pilePour, forms, rebar, sleeves, gbPour, strip];
}

/** Sewer line from the lower wet rooms to the municipal line at the back + sleeves through beams. */
function sewerAndSleeves(ctx: BuildContext, ground: typeof ctx.terrain.excavated): StepDef {
  const beams = ctx.beams;
  const rooms = ctx.house.rooms;
  const wet = (lvl: string) => rooms.filter((r) => r.level === lvl && ['bath', 'wc', 'laundry', 'kitchen'].includes(r.kind));
  const lowerWet = wet('lower');
  const start: Vec2 = lowerWet.length ? polygonCentroid(lowerWet[0].polygon) : polygonCentroid(ctx.footprint.lower);
  const back = ctx.lot.back;
  // Main line runs straight toward the back lot edge.
  const dirBack = back.inward[0] === 0 && back.inward[1] === 0 ? ([0, -1] as Vec2) : ([-back.inward[0], -back.inward[1]] as Vec2);
  let exitT = 0;
  for (let t = 0; t < 40; t += 0.1) {
    if (!pointInPolygon(add2(start, scale2(dirBack, t)), ctx.footprint.lower)) {
      exitT = t;
      break;
    }
  }
  const m1 = add2(start, scale2(dirBack, exitT + 1.3));
  // Connection manhole 1.2 m inside the back boundary.
  let m2T = exitT + 3;
  for (let t = exitT + 1.5; t < 60; t += 0.1) {
    if (!pointInPolygon(add2(start, scale2(dirBack, t + 1.2)), ctx.lot.boundary)) {
      m2T = t;
      break;
    }
  }
  const m2 = add2(start, scale2(dirBack, m2T));
  const y0 = ctx.y.lowerBeamTop - 0.32;
  const y1 = y0 - 0.02 * dist2(start, m1);
  const y2 = y1 - 0.02 * dist2(m1, m2);
  const pipe: Vec3[] = [
    [start[0], y0, start[1]],
    [m1[0], y1, m1[1]],
    [m2[0], y2, m2[1]],
  ];

  const manhole = (id: string, p: Vec2, invert: number): Part => {
    const top = sampleGrid(ground, p[0], p[1]) + 0.04;
    const h = Math.max(0.4, top - (invert - 0.2));
    return {
      id,
      shape: {
        kind: 'merge',
        shapes: [
          { kind: 'cylinder', radius: 0.5, height: h - 0.03, at: [0, invert - 0.2, 0], segments: 20 },
          { kind: 'cylinder', radius: 0.4, height: 0.035, at: [0, top - 0.03, 0], segments: 20 },
        ],
      },
      material: 'concrete',
      tags: ['sewer', 'manhole'],
      anim: { type: 'rise', delay: 1.6, duration: 0.8 },
    };
  };

  // Sleeves: where the pipe crosses a beam, and one per wet room into its nearest beam.
  const drainSleeves: Array<{ a: Vec3; b: Vec3 }> = [];
  const crossSleeve = (b: Beam, p: Vec2, y: number) => {
    const f = wallFrame(b);
    const n = f.normal;
    const h = b.w / 2 + 0.06;
    return { a: [p[0] - n[0] * h, y, p[1] - n[1] * h] as Vec3, b: [p[0] + n[0] * h, y, p[1] + n[1] * h] as Vec3 };
  };
  for (const b of beams.filter((x) => x.level === 'lower')) {
    // Intersect start→m1 with the beam centerline.
    const d = sub2(m1, start);
    const e = sub2(b.b, b.a);
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const w = sub2(b.a, start);
    const t = (w[0] * e[1] - w[1] * e[0]) / den;
    const u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const p = add2(start, scale2(d, t));
    drainSleeves.push(crossSleeve(b, p, y0 + (y1 - y0) * t));
  }
  const nearestBeam = (p: Vec2, lvl: 'lower' | 'entrance') =>
    beams.filter((b) => b.level === lvl).reduce<Beam | null>((best, b) => (!best || distanceToSegment(p, b.a, b.b) < distanceToSegment(p, best.a, best.b) ? b : best), null);
  for (const r of [...wet('entrance')]) {
    const c = polygonCentroid(r.polygon);
    const b = nearestBeam(c, 'entrance');
    if (!b) continue;
    const ab = sub2(b.b, b.a);
    const t = Math.max(0.1, Math.min(0.9, ((c[0] - b.a[0]) * ab[0] + (c[1] - b.a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
    drainSleeves.push(crossSleeve(b, lerp2(b.a, b.b, t), b.topY - b.depth / 2));
  }
  // Water + electricity entry sleeves through the entrance beam nearest the gate.
  const gateBeam = nearestBeam(ctx.lot.gate, 'entrance') ?? nearestBeam(ctx.lot.gate, 'lower');
  const utilSleeves: { water: Array<{ a: Vec3; b: Vec3 }>; power: Array<{ a: Vec3; b: Vec3 }> } = { water: [], power: [] };
  if (gateBeam) {
    const ab = sub2(gateBeam.b, gateBeam.a);
    const L = Math.hypot(ab[0], ab[1]);
    const t = Math.max(0.15, Math.min(0.85, ((ctx.lot.gate[0] - gateBeam.a[0]) * ab[0] + (ctx.lot.gate[1] - gateBeam.a[1]) * ab[1]) / (L * L)));
    const y = gateBeam.topY - gateBeam.depth / 2;
    utilSleeves.water.push(crossSleeve(gateBeam, lerp2(gateBeam.a, gateBeam.b, t), y));
    utilSleeves.power.push(crossSleeve(gateBeam, lerp2(gateBeam.a, gateBeam.b, Math.min(0.95, t + 0.5 / L)), y));
  }
  const pipeLen = dist2(start, m1) + dist2(m1, m2);
  const parts: Part[] = [
    {
      id: 'sewer-main',
      shape: { kind: 'tube', points: pipe, radius: 0.08, bend: 0.35 },
      material: 'drain',
      tags: ['sewer'],
      edges: false,
      anim: { type: 'grow', delay: 0.3, duration: 1.2 },
    },
    manhole('manhole-1', m1, y1),
    manhole('manhole-2', m2, y2),
    {
      id: 'sleeves-drain',
      shape: { kind: 'rods', radius: 0.058, segments: 14, items: drainSleeves },
      material: 'drain',
      tags: ['sleeves'],
      anim: { type: 'grow', delay: 0.8, stagger: 0.15, duration: 0.5 },
    },
  ];
  if (utilSleeves.water.length)
    parts.push(
      {
        id: 'sleeves-water',
        shape: { kind: 'rods', radius: 0.032, segments: 12, items: utilSleeves.water },
        material: 'pipeBlue',
        tags: ['sleeves'],
        anim: { type: 'grow', delay: 1.3, duration: 0.5 },
      },
      {
        id: 'sleeves-power',
        shape: { kind: 'rods', radius: 0.04, segments: 12, items: utilSleeves.power },
        material: 'conduit',
        tags: ['sleeves'],
        anim: { type: 'grow', delay: 1.5, duration: 0.5 },
      },
    );
  const bb = bbox2([start, m1, m2]);
  return {
    id: 'p3-sleeves',
    phase: 3,
    titleHe: 'שרוולים וביוב תת-קרקעי',
    materials: [
      line('צינור ביוב קוטר 160', pipeLen, 'מ׳', 0),
      line('שוחות ביקורת', 2, 'יח׳', 0),
      line('שרוולים דרך הקורות', drainSleeves.length + utilSleeves.water.length + utilSleeves.power.length, 'יח׳', 0),
    ],
    costILS: PRICES.sewerLump,
    parts,
    camera: {
      bounds: {
        min: [Math.min(bb.min[0], bbox2(ctx.footprint.lower).min[0]) - 1, y2 - 0.5, bb.min[1] - 1],
        max: [Math.max(bb.max[0], bbox2(ctx.footprint.lower).max[0]) + 1, ctx.y.lowerBeamTop + 1, bb.max[1] + 1],
      },
      polar: 50,
      azimuth: 155,
      zoom: 1.12,
    },
    view: { groundXray: true, xray: true },
  };
}
