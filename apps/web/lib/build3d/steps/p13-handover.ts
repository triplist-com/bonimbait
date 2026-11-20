/**
 * Phase 13 · מסירת מפתח — furniture move-in, the two cars, and the finished house at dusk.
 */
import {
  bbox2,
  clipPolygonToRect,
  dist2,
  lerp2,
  offsetPolygon,
  pointInPolygon,
  wallFrame,
} from '../house/geometry';
import type { Fixture, FixtureKind, Vec2 } from '../house/types';
import type { Part, StepDef } from '../engine/types';
import type { BuildContext } from './context';
import { boxesPart, fixtureModel, houseBounds, polyBounds, roomsOf } from './finish-kit';
import { line, roundCost } from './kit';

const MODEL_OF: Partial<Record<FixtureKind, 'bed-double' | 'bed-single' | 'sofa' | 'armchair' | 'coffee-table' | 'dining-set' | 'tv' | 'wardrobe' | 'desk' | 'washer'>> = {
  'bed-double': 'bed-double',
  'bed-single': 'bed-single',
  sofa: 'sofa',
  armchair: 'armchair',
  'coffee-table': 'coffee-table',
  'dining-table': 'dining-set',
  tv: 'tv',
  wardrobe: 'wardrobe',
  desk: 'desk',
  washer: 'washer',
};

export function phaseHandover(ctx: BuildContext): StepDef[] {
  const { house } = ctx;
  const steps: StepDef[] = [];

  // ===================================================================== furniture
  {
    const fx = house.fixtures.filter((f) => f.level !== 'site' && MODEL_OF[f.kind]);
    const parts: Part[] = [];
    // Largest pieces first, spread through the step.
    fx.forEach((f, i) => {
      const name = MODEL_OF[f.kind]!;
      let extra: Parameters<typeof fixtureModel>[5] = {};
      let sizeFix: Fixture = f;
      if (f.kind === 'tv') {
        // The plan symbol is just the screen; keep the model's proportions.
        const k = f.size[0] / 1.6;
        sizeFix = { ...f, size: [f.size[0], 0.4 * k] };
        extra = { height: 1.3 * k };
      }
      parts.push(
        fixtureModel(
          ctx,
          sizeFix,
          name,
          `p13-furn-${f.id}`,
          {
            tags: ['furniture', 'interior'],
            anim: { type: 'drop', from: [0, 2.2, 0], delay: (i % 12) * 0.2 + (f.level === 'lower' ? 0 : 0.5), duration: 0.8, ease: 'bounce' },
          },
          extra,
        ),
      );
    });

    // Rugs, pictures and plants make the rooms feel lived in.
    const rugs: Array<{ at: [number, number, number]; size: [number, number, number]; rotY: number }> = [];
    const living = roomsOf(ctx, 'entrance', ['living'])[0];
    const coffee = house.fixtures.find((f) => f.kind === 'coffee-table');
    if (living && coffee) {
      const inner = offsetPolygon(living.polygon, -0.5);
      const rect: Vec2[] = clipPolygonToRect(inner, [coffee.center[0] - 1.9, coffee.center[1] - 1.9], [coffee.center[0] + 2.1, coffee.center[1] + 1.9]);
      if (rect.length >= 3) {
        const b = bbox2(rect);
        rugs.push({ at: [(b.min[0] + b.max[0]) / 2, 0.012, (b.min[1] + b.max[1]) / 2], size: [b.max[0] - b.min[0], 0.024, b.max[1] - b.min[1]], rotY: 0 });
      }
    }
    const master = house.fixtures.find((f) => f.kind === 'bed-double');
    const pics: Array<{ at: [number, number, number]; size: [number, number, number]; rotY: number }> = [];
    const canvases: typeof pics = [];
    if (master) {
      const fr: Vec2 = [Math.sin(master.rotation), Math.cos(master.rotation)];
      const c: Vec2 = [master.center[0] + fr[0] * 0.45, master.center[1] + fr[1] * 0.45];
      rugs.push({ at: [c[0], 0.012, c[1]], size: [master.size[0] + 1.0, 0.024, master.size[1] + 0.2], rotY: master.rotation });
      const hb: Vec2 = [master.center[0] - fr[0] * (master.size[1] / 2 + 0.03), master.center[1] - fr[1] * (master.size[1] / 2 + 0.03)];
      pics.push({ at: [hb[0], 1.55, hb[1]], size: [1.3, 0.8, 0.04], rotY: master.rotation });
      canvases.push({ at: [hb[0] + fr[0] * 0.02, 1.55, hb[1] + fr[1] * 0.02], size: [1.2, 0.7, 0.03], rotY: master.rotation });
    }
    const placedPts = fx.map((f) => f.center);
    const plantPts: Array<{ p: Vec2; y: number }> = [];
    for (const kind of ['living', 'dining', 'master'] as const) {
      const r = roomsOf(ctx, 'entrance', [kind])[0];
      if (!r) continue;
      const b = bbox2(r.polygon);
      const corners: Vec2[] = [
        [b.min[0] + 0.5, b.min[1] + 0.5],
        [b.max[0] - 0.5, b.min[1] + 0.5],
        [b.max[0] - 0.5, b.max[1] - 0.5],
        [b.min[0] + 0.5, b.max[1] - 0.5],
      ];
      const ok = corners.filter((p) => pointInPolygon(p, r.polygon) && placedPts.every((q) => dist2(p, q) > 1.5) && house.openings.every((o) => o.level !== 'entrance' || dist2(p, wallFrameMid(ctx, o.wallId, o.offset)) > 1.1));
      if (ok[0]) plantPts.push({ p: ok[0], y: 0 });
      if (kind === 'living' && ok[1]) plantPts.push({ p: ok[1], y: 0 });
    }
    plantPts.forEach((pt, i) =>
      parts.push({
        id: `p13-plant-${i}`,
        shape: { kind: 'model', name: 'planter', size: [0.7, 1.4, 0.7] },
        material: 'white',
        position: [pt.p[0], pt.y, pt.p[1]],
        tags: ['furniture', 'interior', 'model', 'level:entrance'],
        anim: { type: 'grow', delay: 2.6 + i * 0.25, duration: 0.6, ease: 'back' },
      }),
    );
    if (rugs.length) parts.push(boxesPart('p13-rugs', rugs, 'paint', ['furniture', 'rug', 'level:entrance'], { type: 'fade', duration: 0.8 }, { color: '#C9C2B6', edges: false }));
    if (pics.length) {
      parts.push(boxesPart('p13-picture-frames', pics, 'wood', ['furniture', 'decor', 'level:entrance'], { type: 'fade', delay: 2.2, duration: 0.6 }, { color: '#4A3A2C' }));
      parts.push(boxesPart('p13-picture-art', canvases, 'paint', ['furniture', 'decor', 'level:entrance'], { type: 'fade', delay: 2.4, duration: 0.6 }, { color: '#C77D5B', edges: false }));
    }
    steps.push({
      id: 'p13-furniture',
      phase: 13,
      titleHe: 'ריהוט',
      materials: [line('מיטות וארונות', fx.filter((f) => ['bed-double', 'bed-single', 'wardrobe'].includes(f.kind)).length, 'יח׳', 0), line('ספות, שולחנות ושולחן אוכל', fx.filter((f) => ['sofa', 'armchair', 'coffee-table', 'dining-table'].includes(f.kind)).length, 'יח׳', 0), line('מכונת כביסה ומייבש', 2, 'יח׳', 0)],
      costILS: roundCost(95000),
      parts,
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY, 3.2), polar: 50 },
      view: { ghostAbove: -0.45 },
    });
  }

  // ===================================================================== cars
  {
    const cars = house.fixtures.filter((f) => f.kind === 'car');
    const colors = ['#2F5F8F', '#D6D8D6'];
    const parts: Part[] = cars.map((f, i) => {
      const p = fixtureModel(ctx, f, 'car', `p13-car-${i + 1}`, {
        tags: ['car', 'level:site'],
        anim: { type: 'slide', from: [0, 0, 9 + i * 3], delay: i * 1.3, duration: 2.4, ease: 'out' },
      });
      if (p.shape.kind === 'model') p.shape = { ...p.shape, color: colors[i % colors.length] };
      return p;
    });
    const pk = house.outdoor.find((o) => o.kind === 'parking');
    steps.push({
      id: 'p13-cars',
      phase: 13,
      titleHe: 'הרכבים בחניה',
      materials: [line('חניות מקורות למכוניות', cars.length, 'יח׳', 0)],
      costILS: 0,
      parts,
      camera: pk ? { bounds: polyBounds(pk.outline, 0, 3, 3), azimuth: 15, polar: 62 } : { fit: 'site' },
      view: { xray: false },
    });
  }

  // ===================================================================== done
  {
    const parts: Part[] = [];
    // Garden uplights at the trees + pergola LED line + porch down-light.
    const trees = house.fixtures.filter((f) => f.kind === 'tree');
    const up = trees.map((t) => ({ at: [t.center[0] + 0.5, (t.y ?? 0) + 0.05, t.center[1] + 0.5] as [number, number, number] }));
    if (up.length)
      parts.push({
        id: 'p13-uplights',
        shape: { kind: 'instances', of: { kind: 'cylinder', radius: 0.1, height: 0.08, segments: 12 }, items: up },
        material: 'light',
        tags: ['lighting', 'level:site'],
        edges: false,
        castShadow: false,
        anim: { type: 'sequence', stagger: 0.25, duration: 0.8 },
      });
    const pg = house.outdoor.find((o) => o.kind === 'pergola');
    if (pg) {
      const strips = pg.outline.map((a, i) => {
        const b = pg.outline[(i + 1) % pg.outline.length];
        const m = lerp2(a, b, 0.5);
        const f = wallFrame({ a, b });
        return { at: [m[0], pg.y - 0.27, m[1]] as [number, number, number], size: [f.length, 0.02, 0.035] as [number, number, number], rotY: f.rotY };
      });
      parts.push(boxesPart('p13-pergola-led', strips, 'light', ['lighting', 'level:site'], { type: 'fade', delay: 0.4, duration: 1.4 }, { edges: false, castShadow: false }));
    }
    // Terrace edge glow.
    const ter = house.rooms.find((r) => r.kind === 'terrace');
    if (ter) {
      const b = bbox2(ter.polygon);
      parts.push(
        boxesPart(
          'p13-terrace-glow',
          [{ at: [(b.min[0] + b.max[0]) / 2, 0.01, b.max[1] - 0.04], size: [b.max[0] - b.min[0] - 0.3, 0.02, 0.04] }],
          'light',
          ['lighting', 'level:entrance'],
          { type: 'fade', delay: 0.8, duration: 1.2 },
          { edges: false, castShadow: false },
        ),
      );
    }
    steps.push({
      id: 'p13-done',
      phase: 13,
      titleHe: 'הבית מוכן',
      materials: [line('בית פרטי מוכן למגורים', 1, 'יח׳', 0)],
      costILS: 12000,
      parts,
      camera: { fit: 'house', azimuth: 155, polar: 68, zoom: 0.86, orbit: true },
      view: { lighting: 'dusk', xray: false },
    });
  }

  return steps;
}

function wallFrameMid(ctx: BuildContext, wallId: string, offset: number): Vec2 {
  const w = ctx.house.walls.find((q) => q.id === wallId);
  if (!w) return [1e6, 1e6];
  const f = wallFrame(w);
  return [w.a[0] + f.dir[0] * offset, w.a[1] + f.dir[1] * offset];
}
