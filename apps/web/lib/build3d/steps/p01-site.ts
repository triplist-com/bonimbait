/** Phase 1 · הכנת המגרש — survey staking, clearing, site setup. */
import {
  add2,
  angleOfDir,
  dist2,
  distanceToSegment,
  lerp2,
  norm2,
  offsetPolygon,
  polygonCentroid,
  samplePolygon,
  scale2,
  sub2,
} from '../house/geometry';
import type { Part, StepDef, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { EXTRA_RATES, PRICES, line, model } from './kit';

export function phaseSite(ctx: BuildContext): StepDef[] {
  return [survey(ctx), clearing(ctx), siteSetup(ctx)];
}

function survey(ctx: BuildContext): StepDef {
  const corners: Vec2[] = [...ctx.footprint.house];
  for (const p of ctx.footprint.lower) if (corners.every((q) => dist2(p, q) > 0.6)) corners.push(p);
  const h = (p: Vec2) => ctx.heightAt(p[0], p[1]);

  const stakes = corners.map((p) => ({ at: [p[0], h(p) + 0.2, p[1]] as Vec3, size: [0.05, 0.8, 0.05] as Vec3 }));
  const ribbons = corners.map((p, i) => ({
    at: [p[0], h(p) + 0.52, p[1]] as Vec3,
    size: [0.012, 0.26, 0.13] as Vec3,
    rotY: i * 1.7,
  }));

  // String line around the house outline.
  const outline = ctx.footprint.house;
  const strings: Vec3[] = [];
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length];
    strings.push([p[0], h(p) + 0.42, p[1]], [q[0], h(q) + 0.42, q[1]]);
  });

  // Setback (building) lines: small pegs + orange line.
  const setback: Vec3[] = [];
  const pegs: Array<{ at: Vec3; size: Vec3 }> = [];
  for (const pl of ctx.house.site.buildingLines) {
    const pts = samplePolygon(pl, 4, false);
    for (let i = 0; i < pts.length - 1; i++) {
      setback.push([pts[i][0], h(pts[i]) + 0.22, pts[i][1]], [pts[i + 1][0], h(pts[i + 1]) + 0.22, pts[i + 1][1]]);
    }
    for (const p of pts) pegs.push({ at: [p[0], h(p) + 0.1, p[1]], size: [0.04, 0.4, 0.04] });
  }

  // Surveyor stands outside the corner nearest the gate, looking at the house.
  const hc = polygonCentroid(outline);
  const nearCorner = outline.reduce((b, p) => (dist2(p, ctx.lot.gate) < dist2(b, ctx.lot.gate) ? p : b), outline[0]);
  const out = norm2(sub2(nearCorner, hc));
  const sp = add2(nearCorner, scale2(out, 2.6));

  const parts: Part[] = [
    {
      id: 'survey-stakes',
      shape: { kind: 'boxes', items: stakes },
      material: 'timber',
      tags: ['survey'],
      anim: { type: 'drop', stagger: 0.12, order: 'near', origin: sp, from: [0, 1.2, 0], duration: 0.5, ease: 'out' },
    },
    {
      id: 'survey-ribbons',
      shape: { kind: 'boxes', items: ribbons },
      material: 'ribbon',
      tags: ['survey'],
      edges: false,
      anim: { type: 'grow', stagger: 0.12, order: 'near', origin: sp, delay: 0.45, duration: 0.4 },
    },
    {
      id: 'survey-strings',
      shape: { kind: 'lines', points: strings },
      material: 'string',
      tags: ['survey'],
      anim: { type: 'fade', delay: 0.4 + corners.length * 0.12, duration: 0.8 },
    },
    model('surveyor', 'surveyor', [sp[0], h(sp), sp[1]], angleOfDir(norm2(sub2(hc, sp))), {
      tags: ['temp', 'person'],
      anim: { type: 'fade', duration: 0.6 },
    }),
  ];
  if (pegs.length) {
    parts.push(
      {
        id: 'setback-pegs',
        shape: { kind: 'boxes', items: pegs },
        material: 'timber',
        tags: ['survey', 'setback'],
        anim: { type: 'grow', stagger: Math.min(0.03, 1.6 / Math.max(1, pegs.length)), order: 'near', origin: sp, delay: 0.8 },
      },
      {
        id: 'setback-lines',
        shape: { kind: 'lines', points: setback },
        material: 'ribbon',
        tags: ['survey', 'setback'],
        anim: { type: 'fade', delay: 1.4, duration: 0.8 },
      },
    );
  }
  return {
    id: 'p1-survey',
    phase: 1,
    titleHe: 'סימון על ידי מודד',
    materials: [line('יתדות סימון בפינות הבית', corners.length, 'יח׳', 0), line('חוט סימון', perimeter(outline), 'מ׳', 0)],
    costILS: PRICES.surveyLump,
    parts,
    camera: { fit: 'house', polar: 50, zoom: 1.05 },
    view: { xray: false },
  };
}

function perimeter(poly: Vec2[]) {
  return poly.reduce((s, p, i) => s + dist2(p, poly[(i + 1) % poly.length]), 0);
}

function clearing(ctx: BuildContext): StepDef {
  const { gate, street } = ctx.lot;
  const tp = add2(gate, scale2(street.inward, 4.2));
  const truckRot = angleOfDir(street.inward);
  return {
    id: 'p1-clearing',
    phase: 1,
    titleHe: 'ניקוי המגרש',
    materials: [line('שטח לניקוי', ctx.lot.area, 'מ״ר', 0)],
    costILS: Math.round((ctx.lot.area * EXTRA_RATES.clearingM2) / 100) * 100,
    remove: { tags: ['scrub'], ids: ['surveyor'] },
    parts: [
      model('clearing-truck', 'dump-truck', [tp[0], ctx.heightAt(tp[0], tp[1]), tp[1]], truckRot, {
        tags: ['machine', 'temp'],
        anim: { type: 'slide', from: [-street.inward[0] * 9, 0, -street.inward[1] * 9], duration: 1.6, ease: 'out' },
        exit: { type: 'slide', to: [-street.inward[0] * 10, 0, -street.inward[1] * 10], duration: 1.2 },
      }),
    ],
    camera: { fit: 'site', polar: 48 },
    view: { xray: false },
  };
}

function siteSetup(ctx: BuildContext): StepDef {
  const { gate, street } = ctx.lot;
  const fenceLine = offsetPolygon(ctx.lot.boundary, -0.2);
  const pts = samplePolygon(fenceLine, 2.5);
  const h = (p: Vec2) => ctx.heightAt(p[0], p[1]);
  const gateHalf = 2.4;

  const posts: Array<{ a: Vec3; b: Vec3 }> = [];
  const panels: Array<{ at: Vec3; size: Vec3; rotY: number }> = [];
  let fenceLen = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const nearGate = distanceToSegment(gate, a, b) < gateHalf;
    if (!nearGate || dist2(a, gate) > gateHalf) posts.push({ a: [a[0], h(a) - 0.1, a[1]], b: [a[0], h(a) + 1.72, a[1]] });
    if (nearGate) continue;
    const ya = h(a);
    const yb = h(b);
    const y0 = Math.min(ya, yb) - 0.04;
    const y1 = Math.max(ya, yb) + 1.6;
    const m = lerp2(a, b, 0.5);
    const L = dist2(a, b);
    fenceLen += L;
    panels.push({ at: [m[0], (y0 + y1) / 2, m[1]], size: [L - 0.06, y1 - y0, 0.03], rotY: angleOfDir(norm2(sub2(b, a))) });
  }

  const ground = (p: Vec2): Vec3 => [p[0], h(p), p[1]];
  const { container: contAt, toilet: wcAt, sign: signAt, pole: poleAt, tap: tapAt } = siteLayout(ctx);
  const faceStreet = angleOfDir([-street.inward[0], -street.inward[1]]);

  const parts: Part[] = [
    {
      id: 'fence-posts',
      shape: { kind: 'rods', radius: 0.03, items: posts },
      material: 'galvanized',
      tags: ['site-temp', 'fence'],
      anim: { type: 'rise', stagger: 0.025, order: 'near', origin: gate, duration: 0.4 },
    },
    {
      id: 'fence-panels',
      shape: { kind: 'boxes', items: panels },
      material: 'fenceFabric',
      tags: ['site-temp', 'fence'],
      anim: { type: 'rise', stagger: 0.025, order: 'near', origin: gate, delay: 0.3, duration: 0.45 },
    },
    model('site-container', 'site-container', ground(contAt), street.rotY, {
      tags: ['site-temp'],
      anim: { type: 'drop', delay: 1.2, from: [0, 3, 0] },
    }),
    model('site-toilet', 'site-toilet', ground(wcAt), faceStreet, {
      tags: ['site-temp'],
      anim: { type: 'drop', delay: 1.6, from: [0, 2.5, 0] },
    }),
    model('permit-sign', 'permit-sign', ground(signAt), faceStreet, {
      tags: ['site-temp'],
      anim: { type: 'grow', delay: 2.0 },
    }),
    model('power-pole', 'power-pole', ground(poleAt), street.rotY, {
      tags: ['site-temp'],
      anim: { type: 'rise', delay: 2.2 },
    }),
    {
      id: 'water-tap',
      shape: {
        kind: 'merge',
        shapes: [
          { kind: 'rod', a: [0, -0.1, 0], b: [0, 0.85, 0], radius: 0.022 },
          { kind: 'rod', a: [0, 0.8, 0], b: [0.16, 0.8, 0], radius: 0.018 },
          { kind: 'box', size: [0.08, 0.1, 0.08], at: [0, 0.6, 0] },
        ],
      },
      material: 'pipeBlue',
      position: ground(tapAt),
      tags: ['site-temp'],
      anim: { type: 'rise', delay: 2.4 },
    },
  ];
  return {
    id: 'p1-site-setup',
    phase: 1,
    titleHe: 'התארגנות אתר',
    materials: [
      line('גדר אתר', fenceLen, 'מ׳', 0),
      line('עמודי גדר', posts.length, 'יח׳', 0),
      line('מכולת כלים', 1, 'יח׳', 0),
      line('שירותים כימיים', 1, 'יח׳', 0),
      line('שלט היתר בנייה', 1, 'יח׳', 0),
      line('עמוד חשמל זמני + ברז מים', 1, 'יח׳', 0),
    ],
    costILS: PRICES.siteSetupLump,
    remove: { ids: ['clearing-truck'] },
    parts,
    camera: { fit: 'site', polar: 50, azimuth: 24 },
    view: { xray: false },
  };
}

export interface SiteLayout {
  container: Vec2;
  toilet: Vec2;
  sign: Vec2;
  pole: Vec2;
  tap: Vec2;
  /** Spoil heap from the excavation. */
  spoil: Vec2;
  /** Where trucks stop inside the gate (and their heading). */
  truck: Vec2;
  truckRot: number;
}

const layouts = new WeakMap<BuildContext, SiteLayout>();

/** Where the temporary site items stand (shared by later phases so nothing overlaps). */
export function siteLayout(ctx: BuildContext): SiteLayout {
  const hit = layouts.get(ctx);
  if (hit) return hit;
  const { gate, street } = ctx.lot;
  const taken: Array<{ at: Vec2; size: Vec2 }> = [];
  const truck = add2(gate, scale2(street.inward, 4.5));
  taken.push({ at: truck, size: [3, 8] });
  const container = ctx.freeSpot([6.2, 2.6], add2(add2(gate, scale2(street.dir, 6)), scale2(street.inward, 3)), taken);
  taken.push({ at: container, size: [6.2, 2.6] });
  // Power pole well clear of the truck lane (trucks back in there: the excavation dump truck, the
  // pile mixer); the toilet goes to the nearest free spot on that side of the gate.
  const pole = add2(add2(gate, scale2(street.dir, -5.4)), scale2(street.inward, 0.6));
  taken.push({ at: pole, size: [1.2, 1.2] });
  const toilet = ctx.freeSpot([1.4, 1.4], add2(add2(gate, scale2(street.dir, -7.6)), scale2(street.inward, 1.4)), taken);
  taken.push({ at: toilet, size: [1.4, 1.4] });
  const far = dist2(street.a, gate) > dist2(street.b, gate) ? street.a : street.b;
  const spoil = ctx.freeSpot([4.6, 4.6], add2(far, scale2(street.inward, 4)), taken, 0.2);
  const sign = add2(add2(gate, scale2(street.dir, 3.4)), scale2(street.inward, 0.7));
  const tap = add2(pole, scale2(street.inward, 1.0));
  const out: SiteLayout = { container, toilet, sign, pole, tap, spoil, truck, truckRot: angleOfDir(street.inward) };
  layouts.set(ctx, out);
  return out;
}
