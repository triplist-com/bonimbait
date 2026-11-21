/** Phase 0 · התוכנית — the plan sheet lies on the natural lot. */
import { bbox2, clipPolygonToRect, gridBounds, pointInPolygon, polygonArea, rng } from '../house/geometry';
import type { Part, StepDef, Vec2 } from '../engine/types';
import type { BuildContext } from './context';
import { EXTRA_RATES, line } from './kit';

/** Buffer a polyline into a closed ribbon polygon (street surface). */
function ribbon(pl: Vec2[], half: number): Vec2[] {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < pl.length; i++) {
    const a = pl[Math.max(0, i - 1)];
    const b = pl[Math.min(pl.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const n: Vec2 = [-dz / l, dx / l];
    left.push([pl[i][0] + n[0] * half, pl[i][1] + n[1] * half]);
    right.push([pl[i][0] - n[0] * half, pl[i][1] - n[1] * half]);
  }
  return [...left, ...right.reverse()];
}

/** Polyline shifted sideways by d (left normal of its direction). */
function shiftLine(pl: Vec2[], d: number): Vec2[] {
  return pl.map((p, i) => {
    const a = pl[Math.max(0, i - 1)];
    const b = pl[Math.min(pl.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / l) * d, p[1] + (dx / l) * d] as Vec2;
  });
}

/** Sidewalk slabs between the lot edge and the road (side = +1/-1: lot side of the street polyline). */
export function sidewalk(ctx: BuildContext, street: Vec2[]) {
  const probe = shiftLine(street, 2)[Math.floor(street.length / 2)];
  const side = pointInPolygon(probe, ctx.lot.boundary) || Math.hypot(probe[0] - ctx.lot.center[0], probe[1] - ctx.lot.center[1]) < Math.hypot(street[Math.floor(street.length / 2)][0] - ctx.lot.center[0], street[Math.floor(street.length / 2)][1] - ctx.lot.center[1]) ? 1 : -1;
  const mid = shiftLine(street, side * 2.3);
  const slabs: Array<{ at: [number, number, number]; size: [number, number, number]; rotY: number }> = [];
  for (let i = 0; i < mid.length - 1; i++) {
    const a = mid[i];
    const b = mid[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.05) continue;
    const c: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const h = ctx.heightAt(c[0], c[1]);
    slabs.push({ at: [c[0], h + 0.02, c[1]], size: [L + 0.04, 0.26, 1.3], rotY: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) });
  }
  return { side, slabs };
}

export function phasePlan(ctx: BuildContext): StepDef[] {
  const { natural, baseY } = ctx.terrain;
  const parts: Part[] = [
    {
      id: 'terrain-natural',
      shape: { kind: 'terrain', grid: natural, baseY },
      material: 'soil',
      tags: ['ground', 'terrain'],
      anim: 'none',
    },
    {
      id: 'plan-sheet',
      shape: { kind: 'plan', viewport: 'entrance', drape: natural },
      material: 'white',
      tags: ['plan', 'ground'],
      anim: { type: 'fade', duration: 1.2 },
    },
  ];

  // The street + a sidewalk along the lot, clipped to the terrain extent so they lie on the cake.
  const street = ctx.house.site.street;
  if (street && street.length >= 2) {
    const tb = gridBounds(natural);
    const walk = sidewalk(ctx, street);
    const road = clipPolygonToRect(ribbon(shiftLine(street, -walk.side * 1.6), 3.2), tb.min, tb.max);
    if (road.length >= 3 && polygonArea(road) > 4) {
      parts.push({
        id: 'street',
        shape: { kind: 'drape', outline: road, grid: natural, lift: 0.05, cell: 0.5 },
        material: 'asphalt',
        tags: ['ground', 'street'],
        anim: 'none',
      });
    }
    const items = walk.slabs.filter((b) => b.at[0] > tb.min[0] + 0.3 && b.at[0] < tb.max[0] - 0.3 && b.at[2] > tb.min[1] + 0.3 && b.at[2] < tb.max[1] - 0.3);
    if (items.length)
      parts.push({
        id: 'sidewalk',
        shape: { kind: 'boxes', items },
        material: 'white',
        color: '#DCD8D0',
        tags: ['ground', 'street', 'sidewalk'],
        castShadow: false,
        anim: 'none',
      });
  }

  // Scrub and rocks dotting the natural lot (cleared in p1-clearing).
  const rand = rng(43);
  const b = bbox2(ctx.lot.boundary);
  let bushes = 0;
  let rocks = 0;
  for (let tries = 0; tries < 400 && bushes + rocks < 22; tries++) {
    const p: Vec2 = [b.min[0] + rand() * (b.max[0] - b.min[0]), b.min[1] + rand() * (b.max[1] - b.min[1])];
    if (!pointInPolygon(p, ctx.lot.boundary)) continue;
    const isRock = rand() < 0.38;
    if (isRock && rocks >= 8) continue;
    if (!isRock && bushes >= 14) continue;
    const y = ctx.heightAt(p[0], p[1]);
    const s = isRock ? 0.45 + rand() * 0.5 : 0.7 + rand() * 0.8;
    parts.push({
      id: `scrub-${bushes + rocks + 1}`,
      shape: { kind: 'model', name: isRock ? 'rock' : 'bush', seed: Math.floor(rand() * 1000), size: [s, isRock ? s * 0.6 : s * 0.8, s] },
      material: 'white',
      position: [p[0], y - 0.04, p[1]],
      rotationY: rand() * Math.PI * 2,
      tags: ['scrub', 'model'],
      anim: { type: 'grow', delay: 0.6 + (bushes + rocks) * 0.05, duration: 0.6 },
      exit: 'shrink',
      highlight: false,
      ghost: false,
    });
    if (isRock) rocks += 1;
    else bushes += 1;
  }

  const builtArea = polygonArea(ctx.footprint.entrance) + polygonArea(ctx.footprint.lower);
  return [
    {
      id: 'p0-plan',
      phase: 0,
      titleHe: 'התוכנית על המגרש',
      materials: [
        line('שטח המגרש', ctx.lot.area, 'מ״ר', 0),
        line('שטח בנוי בשתי הקומות', builtArea, 'מ״ר', 0),
        line('הפרש גבהים במגרש', Math.max(...natural.heights) - Math.min(...natural.heights), 'מ׳', 1),
      ],
      costILS: EXTRA_RATES.designLump,
      parts,
      camera: { fit: 'site', polar: 42, azimuth: 28 },
      view: { xray: false },
    },
  ];
}
