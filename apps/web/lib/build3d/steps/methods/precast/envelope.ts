/**
 * Precast phases 7 and 10: precast parapet units, block partitions (shared), blind frames (shared),
 * and the sealant along every panel joint before the plaster, stone and render go on.
 */
import { bbox2, wallFrame } from '../../../house/geometry';
import type { Part, StepDef, Vec2 } from '../../../engine/types';
import type { BuildContext } from '../../context';
import { cornerCuts } from '../../envelope-kit';
import { line, roundCost } from '../../kit';
import { phaseMasonry } from '../../p07-masonry';
import { phasePlaster } from '../../p10-plaster';
import { divide, fit, type BoxItem } from '../../structure-kit';
import { pick } from '../compose';
import { PRECAST_GREY, PRECAST_RATES, precastPlan } from './kit';

export function phasePrecastMasonry(ctx: BuildContext): StepDef[] {
  const plan = precastPlan(ctx);
  const parapets = plan.parapets;
  const groups: Array<[string, typeof parapets]> = [
    ['roof', parapets.filter((w) => w.level === 'roof')],
    ['terrace', parapets.filter((w) => w.level !== 'roof')],
  ];
  const parts: Part[] = [];
  let len = 0;
  let m2 = 0;
  let units = 0;
  const pts: Vec2[] = [];
  for (const [name, walls] of groups) {
    const items: BoxItem[] = [];
    for (const w of walls) {
      const f = wallFrame(w);
      const earlier = parapets.slice(0, parapets.indexOf(w));
      let spans: Array<[number, number]> = [[0, f.length]];
      for (const [c0, c1] of cornerCuts(w, earlier))
        spans = spans.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b] as [number, number]] : [[a, Math.max(a, c0)] as [number, number], [Math.min(b, c1), b] as [number, number]])).filter(([a, b]) => b - a > 0.03);
      for (const [a, b] of spans) {
        const cuts = divide(a, b, 2.7);
        for (let i = 0; i < cuts.length - 1; i++) {
          const s0 = cuts[i] + (i ? 0.002 : 0);
          const s1 = cuts[i + 1] - (i < cuts.length - 2 ? 0.002 : 0);
          const c: Vec2 = [w.a[0] + f.dir[0] * ((s0 + s1) / 2), w.a[1] + f.dir[1] * ((s0 + s1) / 2)];
          items.push({ at: [c[0], w.baseY + w.height / 2, c[1]], size: [s1 - s0, w.height, w.thickness], rotY: f.rotY });
          len += s1 - s0;
          m2 += (s1 - s0) * w.height;
          units++;
          pts.push(c);
        }
      }
    }
    if (!items.length) continue;
    const lvlTag = name === 'roof' ? 'level:roof' : 'level:entrance';
    parts.push({
      id: `p7p-parapets:${name}`,
      shape: { kind: 'boxes', items },
      material: 'block',
      color: PRECAST_GREY,
      tags: ['precast', 'parapet', lvlTag],
      anim: { type: 'drop', from: [0, 4, 0], delay: name === 'terrace' ? 3.2 : 0, duration: 0.6, stagger: fit(3.0, items.length, 0.2), order: 'x', ease: 'out' },
    });
  }
  const bb = bbox2(pts.length ? pts : ctx.footprint.house);
  const top = ctx.roof.floorY + 1.0;
  const parapetStep: StepDef = {
    id: 'p7p-parapets',
    phase: 7,
    titleHe: 'מעקות טרומיים',
    materials: [
      line('יחידות מעקה טרומיות', units, 'יח׳', 0),
      line('אורך מעקות', len, 'מ׳', 0),
      line('בטון ב-30 במעקות (יצוק במפעל)', m2 * 0.2, 'מ״ק', 1),
    ],
    costILS: roundCost(m2 * PRECAST_RATES.parapetM2),
    parts,
    camera: { bounds: { min: [bb.min[0] - 1.5, ctx.roof.floorY - 0.3, bb.min[1] - 1.5], max: [bb.max[0] + 1.5, top + 0.3, bb.max[1] + 1.5] }, azimuth: 35, polar: 52 },
    view: { xray: false },
  };
  const p7 = phaseMasonry(ctx);
  return [parapetStep, ...pick(p7, ['p7-blocks-interior', 'p7-blind-frames'])];
}

export function phasePrecastPlaster(ctx: BuildContext): StepDef[] {
  const plan = precastPlan(ctx);
  const p10 = phasePlaster(ctx);
  const items: BoxItem[] = plan.joints.map((j) => {
    const f = wallFrame(j.wall);
    const c: Vec2 = [j.wall.a[0] + f.dir[0] * j.s, j.wall.a[1] + f.dir[1] * j.s];
    return { at: [c[0], (j.y0 + j.y1) / 2, c[1]], size: [0.045, j.y1 - j.y0 - 0.02, j.wall.thickness + 0.012], rotY: f.rotY };
  });
  const len = plan.joints.reduce((s, j) => s + (j.y1 - j.y0), 0);
  // Frame the joints themselves (and the facade around them), not the whole house.
  const jp: Vec2[] = plan.joints.map((j) => {
    const f = wallFrame(j.wall);
    return [j.wall.a[0] + f.dir[0] * j.s, j.wall.a[1] + f.dir[1] * j.s];
  });
  const jb = bbox2(jp.length ? jp : ctx.footprint.house);
  const jointCam = { bounds: { min: [jb.min[0] - 1.5, ctx.entrance.floorY - 0.5, jb.min[1] - 1.5] as [number, number, number], max: [jb.max[0] + 1.5, ctx.entrance.floorY + 3.2, jb.max[1] + 1.5] as [number, number, number] }, azimuth: 35, polar: 52, zoom: 0.6 };
  const joints: StepDef = {
    id: 'p10p-joints',
    phase: 10,
    titleHe: 'איטום חיבורי פאנלים',
    materials: [
      line('אורך חיבורים לאיטום', len, 'מ׳', 0),
      line('חבל גב ואטם פוליאורתן', len, 'מ׳', 0),
      line('פריימר לשפות החיבור', len * 0.1, 'ליטר', 0),
    ],
    costILS: roundCost(len * PRECAST_RATES.sealantM),
    parts: [
      {
        id: 'p10p-joints:sealant',
        shape: { kind: 'boxes', items },
        material: 'ink',
        color: '#3B3E43',
        tags: ['joint-sealant', 'level:lower', 'level:entrance'],
        edges: false,
        anim: { type: 'rise', duration: 0.7, stagger: fit(3.4, items.length, 0.2), order: 'near', origin: ctx.lot.gate },
      },
    ],
    camera: jointCam,
    view: { xray: false, ghostTags: ['scaffolding'] },
  };
  const [scaff] = pick(p10, ['p10-scaffolding']);
  const rest = pick(p10, ['p10-plaster-interior', 'p10-stone-cladding', 'p10-plaster-exterior', 'p10-scaffolding-down']);
  return [scaff, joints, ...rest];
}
