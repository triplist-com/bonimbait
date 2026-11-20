/** Phase 2 · עבודות עפר — excavation of the lower floor, compaction + gravel bed. */
import {
  add2,
  angleOfDir,
  bbox2,
  dist2,
  norm2,
  offsetPolygon,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  sampleGrid,
  scale2,
  sub2,
  volumeBetween,
} from '../house/geometry';
import type { CameraHint, Part, StepDef, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { EXTRA_RATES, PRICES, line, model, roundCost } from './kit';
import { siteLayout } from './p01-site';

/** Camera box around the pit (footprint + working space + slopes). */
export function pitBounds(ctx: BuildContext, grow = 3): CameraHint['bounds'] {
  const b = bbox2(offsetPolygon(ctx.footprint.lower, grow));
  const top = sampleGrid(ctx.terrain.natural, (b.min[0] + b.max[0]) / 2, b.max[1]);
  return { min: [b.min[0], ctx.y.pitFloor, b.min[1]], max: [b.max[0], Math.max(top, ctx.y.platform), b.max[1]] };
}

export function phaseEarthworks(ctx: BuildContext): StepDef[] {
  const { natural, excavated, baseY } = ctx.terrain;
  const lay = siteLayout(ctx);
  const fpLower = ctx.footprint.lower;
  const pc = polygonCentroid(fpLower);

  // Excavator: on undisturbed ground just beyond the slope, facing the pit, nearest the gate.
  let exAt: Vec2 = add2(pc, scale2(ctx.lot.street.inward, -1));
  let exBest = Infinity;
  const ring = offsetPolygon(fpLower, 4.2);
  for (let i = 0; i < ring.length; i++) {
    for (let k = 0; k < 6; k++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const p: Vec2 = [a[0] + ((b[0] - a[0]) * (k + 0.5)) / 6, a[1] + ((b[1] - a[1]) * (k + 0.5)) / 6];
      if (!pointInPolygon(p, offsetPolygon(ctx.lot.boundary, -1.5))) continue;
      const cut = sampleGrid(natural, p[0], p[1]) - sampleGrid(excavated, p[0], p[1]);
      if (cut > 0.2) continue;
      const d = dist2(p, ctx.lot.gate);
      if (d < exBest) {
        exBest = d;
        exAt = p;
      }
    }
  }
  const exY = sampleGrid(excavated, exAt[0], exAt[1]);
  const exRot = angleOfDir(norm2(sub2(pc, exAt)));

  const volume = volumeBetween(natural, excavated);
  const trucks = Math.ceil((volume * 1.25) / 12);
  const spoilY = sampleGrid(excavated, lay.spoil[0], lay.spoil[1]) - 0.15;

  const excavation: StepDef = {
    id: 'p2-excavation',
    phase: 2,
    titleHe: 'חפירה',
    materials: [
      line('חפירה ופינוי', volume, 'מ״ק', 0),
      line('משאיות פינוי (12 מ״ק)', trucks, 'נסיעות', 0),
      line('עומק חפירה מרבי', Math.max(0, ...natural.heights.map((h, i) => h - excavated.heights[i])), 'מ׳', 1),
    ],
    costILS: roundCost(volume * PRICES.excavationM3),
    remove: { ids: ['terrain-natural', 'survey-stakes', 'survey-ribbons', 'survey-strings'], tags: ['plan'] },
    parts: [
      {
        id: 'terrain-excavated',
        shape: { kind: 'terrain', grid: excavated, from: natural, ref: natural, baseY },
        material: 'soil',
        tags: ['ground', 'terrain'],
        anim: { type: 'morph', delay: 0.9, duration: 4.6, ease: 'inOut' },
      },
      model('excavator', 'excavator', [exAt[0], exY, exAt[1]], exRot, {
        tags: ['machine', 'dig'],
        anim: { type: 'slide', from: [ctx.lot.street.inward[0] * -6, 0, ctx.lot.street.inward[1] * -6], duration: 1.2 },
      }),
      model('dig-truck', 'dump-truck', [lay.truck[0], ctx.heightAt(lay.truck[0], lay.truck[1], excavated), lay.truck[1]], lay.truckRot, {
        tags: ['machine', 'dig'],
        anim: { type: 'slide', delay: 0.4, from: [-ctx.lot.street.inward[0] * 9, 0, -ctx.lot.street.inward[1] * 9], duration: 1.6 },
      }),
      {
        id: 'spoil-heap',
        shape: {
          kind: 'merge',
          shapes: [
            { kind: 'cylinder', radius: 2.1, radiusTop: 0.5, height: 1.5, segments: 18 },
            { kind: 'cylinder', radius: 1.2, radiusTop: 0.25, height: 1.0, at: [1.4, 0, 0.9], segments: 14 },
          ],
        },
        material: 'soilCut',
        position: [lay.spoil[0], spoilY, lay.spoil[1]],
        tags: ['site-temp', 'spoil'],
        edges: false,
        anim: { type: 'rise', delay: 2.4, duration: 3 },
      },
    ],
    camera: { bounds: pitBounds(ctx, 4), polar: 52, azimuth: 32 },
    view: { xray: false },
  };

  // Compaction + 10 cm gravel bed on the pit floor (inside the working space).
  const bed = offsetPolygon(fpLower, 0.7);
  const bedArea = polygonArea(bed);
  const rollerStart = add2(pc, scale2(norm2(sub2(fpLower[0], pc)), 1.2));
  const compaction: StepDef = {
    id: 'p2-compaction',
    phase: 2,
    titleHe: 'יישור והידוק',
    materials: [line('הידוק תחתית החפירה', bedArea, 'מ״ר', 0), line('מצע מהודק 10 ס״מ', bedArea * 0.1, 'מ״ק', 1)],
    costILS: roundCost(bedArea * EXTRA_RATES.compactionM2 + bedArea * 0.1 * EXTRA_RATES.gravelM3),
    remove: { tags: ['dig', 'setback'] },
    parts: [
      {
        id: 'gravel-bed',
        shape: { kind: 'extrude', outline: bed, y0: ctx.y.pitFloor + 0.005, y1: ctx.y.gravelTop },
        material: 'gravel',
        tags: ['gravel', 'level:lower'],
        edges: true,
        anim: { type: 'fade', delay: 0.8, duration: 2.2 },
      },
      model('roller', 'roller', [rollerStart[0], ctx.y.gravelTop, rollerStart[1]] as Vec3, 0, {
        tags: ['machine', 'compact'],
        anim: { type: 'slide', from: [3.5, 0, 0], duration: 3.2, ease: 'inOut' },
      }),
    ] as Part[],
    camera: { bounds: pitBounds(ctx, 1.5), polar: 50, azimuth: 36 },
    view: { xray: false },
  };

  return [excavation, compaction];
}
