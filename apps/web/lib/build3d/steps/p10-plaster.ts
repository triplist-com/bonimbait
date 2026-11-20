/**
 * Phase 10 · טיח וחיפוי — scaffolding bays around the footprint, interior plaster skins on
 * every interior wall face (removes `mep-in-wall`), Jerusalem-stone cladding and white
 * "שליכט" exterior render, scaffolding removal.
 *
 * Facade (steps/facade.ts, typical for an Israeli private house): stone on the street-facing
 * (south) entrance-floor facade and the recessed entry porch, full height; a 90 cm stone plinth
 * where the entrance floor stands on grade; white render everywhere else, incl. slab edges,
 * columns, corners, both faces of the parapets (+ copings) and the window reveals. Interior
 * faces are the faces whose far side lies inside the level footprint.
 */
import { angleOfDir, bbox2, offsetPolygon, polygonSignedArea, sampleGrid, simplifyRing } from '../house/geometry';
import type { CameraHint, Part, PrimitiveShape, StepDef, Vec2, Vec3 } from '../engine/types';
import type { BuildContext } from './context';
import { PRICES, line, roundCost } from './kit';
import { boxesArea, faceInside, floorYOf, skinBoxes, wallsOfLevel, type BoxItem, type Face, type Lvl } from './envelope-kit';
import { facadeSkins } from './facade';

const FACES: Face[] = [1, -1];
const BAY_L = 2.5;
const TIER_H = 4.0;

/** One scaffold bay (local +X = away from the facade, Z along it): posts, ledgers, braces + timber decks. */
function scaffoldFrame(): { steel: PrimitiveShape; planks: PrimitiveShape } {
  const hx = 0.45;
  const hl = BAY_L / 2;
  const steel: PrimitiveShape[] = [];
  for (const x of [-hx, hx]) for (const z of [-hl, hl]) steel.push({ kind: 'rod', a: [x, 0, z], b: [x, TIER_H, z], radius: 0.027, segments: 6 });
  for (const y of [0.3, 2.0, 4.0]) {
    for (const x of [-hx, hx]) steel.push({ kind: 'rod', a: [x, y, -hl], b: [x, y, hl], radius: 0.022, segments: 5 });
    for (const z of [-hl, hl]) steel.push({ kind: 'rod', a: [-hx, y, z], b: [hx, y, z], radius: 0.022, segments: 5 });
  }
  for (const y of [3.0, 3.5]) steel.push({ kind: 'rod', a: [hx, y, -hl], b: [hx, y, hl], radius: 0.018, segments: 5 });
  steel.push({ kind: 'rod', a: [hx, 0.3, -hl], b: [hx, 2.0, hl], radius: 0.015, segments: 4 }, { kind: 'rod', a: [hx, 2.0, hl], b: [hx, 4.0, -hl], radius: 0.015, segments: 4 });
  const planks: PrimitiveShape[] = [];
  for (const y of [2.0, 4.0]) for (let i = 0; i < 4; i++) planks.push({ kind: 'box', size: [0.21, 0.04, BAY_L - 0.06], at: [-0.33 + i * 0.22, y + 0.03, 0] });
  return { steel: { kind: 'merge', shapes: steel }, planks: { kind: 'merge', shapes: planks } };
}

function houseBounds(ctx: BuildContext, y0: number, y1: number, grow = 2): CameraHint['bounds'] {
  const b = bbox2(ctx.footprint.house);
  return { min: [b.min[0] - grow, y0, b.min[1] - grow], max: [b.max[0] + grow, y1, b.max[1] + grow] };
}

const skinPart = (id: string, items: BoxItem[], material: Part['material'], tags: string[], color?: string, delay = 0): Part => ({
  id,
  shape: { kind: 'boxes', items },
  material,
  color,
  tags,
  edges: false,
  anim: { type: 'rise', delay, stagger: Math.min(0.03, 4 / Math.max(1, items.length)), duration: 0.5, ease: 'out', order: 'y' },
});

export function phasePlaster(ctx: BuildContext): StepDef[] {
  const topY = ctx.roof.floorY + 1.0;

  // ------------------------------------------------------------ scaffolding
  const ring = offsetPolygon(simplifyRing(ctx.footprint.house, 0.3), 0.9);
  const sign = polygonSignedArea(ring) > 0 ? 1 : -1;
  const scaffTop = topY + 0.4;
  const items: Array<{ at: Vec3; rotY: number; scale: Vec3 }> = [];
  let scaffArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.8) continue;
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const out: Vec2 = [dir[1] * sign, -dir[0] * sign];
    const n = Math.max(1, Math.ceil(len / BAY_L));
    const bayLen = len / n;
    for (let k = 0; k < n; k++) {
      const c: Vec2 = [a[0] + dir[0] * bayLen * (k + 0.5), a[1] + dir[1] * bayLen * (k + 0.5)];
      const g = Math.max(ctx.lower.floorY - 0.2, Math.min(0.3, sampleGrid(ctx.terrain.finished, c[0], c[1])));
      const H = scaffTop - g;
      const tiers = Math.max(1, Math.ceil(H / (TIER_H * 1.1)));
      const tierH = H / tiers;
      for (let t = 0; t < tiers; t++) items.push({ at: [c[0], g + t * tierH, c[1]], rotY: angleOfDir(out), scale: [1, tierH / TIER_H, bayLen / BAY_L] });
      scaffArea += bayLen * H;
    }
  }
  const frame = scaffoldFrame();
  const bays: Part[] = [
    {
      id: 'p10-scaffolding:frames',
      shape: { kind: 'instances', of: frame.steel, items },
      material: 'steel',
      tags: ['scaffolding', 'level:site'],
      edges: false,
      anim: { type: 'sequence', stagger: Math.min(0.06, 5 / Math.max(1, items.length)), duration: 0.6, ease: 'out', order: 'near', origin: ctx.lot.gate },
    },
    {
      id: 'p10-scaffolding:decks',
      shape: { kind: 'instances', of: frame.planks, items },
      material: 'timber',
      tags: ['scaffolding', 'level:site'],
      edges: false,
      anim: { type: 'sequence', delay: 0.4, stagger: Math.min(0.06, 5 / Math.max(1, items.length)), duration: 0.5, ease: 'out', order: 'near', origin: ctx.lot.gate },
    },
  ];
  const scaffolding: StepDef = {
    id: 'p10-scaffolding',
    phase: 10,
    titleHe: 'פיגומים',
    materials: [line('מודולי פיגום', items.length, 'יח׳', 0), line('שטח חזיתות מכוסה', scaffArea, 'מ״ר', 0), line('לוחות עבודה ומעקות', items.length * 8, 'יח׳', 0)],
    costILS: roundCost(scaffArea * PRICES.scaffoldingM2),
    parts: bays,
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, scaffTop, 3), polar: 52, azimuth: 35 },
    view: { xray: false },
  };

  // ------------------------------------------------------------ interior plaster
  const interiorParts: Part[] = [];
  let interiorArea = 0;
  (['lower', 'entrance'] as const).forEach((lvl: Lvl, li) => {
    const fp = ctx.footprint[lvl];
    const items: BoxItem[] = [];
    for (const w of wallsOfLevel(ctx, lvl)) {
      if (w.role === 'fence' || w.role === 'site-retaining' || w.role === 'parapet') continue;
      for (const face of FACES) if (faceInside(w, face, fp)) items.push(...skinBoxes(w, ctx.house.openings, floorYOf(ctx, lvl), face, { thickness: 0.025 }));
    }
    interiorArea += boxesArea(items);
    interiorParts.push(skinPart(`p10-plaster-interior:${lvl}`, items, 'plaster', ['plaster-interior', `level:${lvl}`], undefined, li * 1.5));
  });
  const plasterInterior: StepDef = {
    id: 'p10-plaster-interior',
    phase: 10,
    titleHe: 'טיח פנים',
    materials: [line('שטח טיח פנים', interiorArea, 'מ״ר', 0), line('טיח מוכן (שלוש שכבות)', interiorArea * 0.02, 'מ״ק', 1), line('רשת פיברגלס בחיבורים', interiorArea * 0.08, 'מ״ר', 0)],
    costILS: roundCost(interiorArea * PRICES.plasterInteriorM2),
    remove: { tags: ['mep-in-wall'] },
    parts: interiorParts,
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, ctx.entrance.floorY + 3.1, 1), polar: 58 },
    view: { xray: true, ghostAbove: ctx.roof.floorY - 0.3 },
  };

  // ------------------------------------------------------------ stone cladding + exterior render
  // Facade skins cover every exterior face (walls, columns, corners, slab edges): see facade.ts.
  const fac = facadeSkins(ctx);
  const stoneArea = fac.stoneArea;
  const stoneColors = ['#E9DABD', '#E1D0B0', '#D8C6A3'];
  // Facade work is seen from outside: scaffolding fades to a ghost so the new skin reads.
  const facadeView = { xray: false, ghostTags: ['scaffolding'] };
  const stoneStep: StepDef = {
    id: 'p10-stone-cladding',
    phase: 10,
    titleHe: 'חיפוי אבן',
    materials: [line('אבן ירושלמית לחיפוי', stoneArea, 'מ״ר', 0), line('דבק צמנטי ועוגני נירוסטה', stoneArea * 6, 'ק״ג', 0), line('אבני פינה', Math.round(stoneArea * 0.4), 'יח׳', 0)],
    costILS: roundCost(stoneArea * PRICES.stoneCladdingM2),
    parts: fac.stone.map((items, i) => ({
      id: `p10-stone-cladding:stones-${i + 1}`,
      shape: { kind: 'boxes' as const, items },
      material: 'stone' as const,
      color: stoneColors[i],
      tags: ['stone', 'level:entrance'],
      edges: false,
      anim: { type: 'courses' as const, stagger: 0.1, duration: 0.3, ease: 'out' as const },
    })),
    camera: { bounds: houseBounds(ctx, ctx.entrance.floorY - 0.5, ctx.roof.floorY + 0.5, 0.5), polar: 66, azimuth: 24 },
    view: facadeView,
  };

  const renderParts: Part[] = (['lower', 'entrance', 'roof'] as const)
    .filter((b) => fac.render[b].length)
    .map((b, i) => skinPart(`p10-plaster-exterior:${b}`, fac.render[b], 'plaster', ['plaster-exterior', `level:${b}`], '#FAF8F2', i * 1.2));
  if (fac.reveals.length) renderParts.push(skinPart('p10-plaster-exterior:reveals', fac.reveals, 'plaster', ['plaster-exterior', 'reveals'], '#F6F3EC', 2.4));
  if (fac.caps.length)
    renderParts.push({
      id: 'p10-plaster-exterior:copings',
      shape: { kind: 'boxes', items: fac.caps },
      material: 'plaster',
      color: '#ECE7DD',
      tags: ['plaster-exterior', 'coping', 'parapet'],
      anim: { type: 'drop', from: [0, 0.6, 0], delay: 3.0, stagger: Math.min(0.06, 1.2 / fac.caps.length), duration: 0.4, ease: 'out' },
    });
  const renderArea = fac.renderArea;
  const exterior: StepDef = {
    id: 'p10-plaster-exterior',
    phase: 10,
    titleHe: 'טיח חוץ ושליכט',
    materials: [line('שטח טיח חוץ ושליכט', renderArea, 'מ״ר', 0), line('שליכט לבן (צבע גמר)', renderArea * 3, 'ק״ג', 0), line('רשת זיגוג בפינות', renderArea * 0.1, 'מ״ר', 0)],
    costILS: roundCost(renderArea * PRICES.plasterExteriorM2),
    parts: renderParts,
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, topY, 0.5), polar: 64, azimuth: 160 },
    view: facadeView,
  };

  // ------------------------------------------------------------ scaffolding down
  const down: StepDef = {
    id: 'p10-scaffolding-down',
    phase: 10,
    titleHe: 'פירוק פיגומים',
    materials: [line('פירוק מודולי פיגום', items.length, 'יח׳', 0), line('שטח חזיתות', scaffArea, 'מ״ר', 0)],
    costILS: 0,
    remove: { tags: ['scaffolding'] },
    parts: [],
    camera: { bounds: houseBounds(ctx, ctx.lower.floorY, topY, 3), polar: 52, azimuth: 35, orbit: true },
    view: { xray: false },
  };

  return [scaffolding, plasterInterior, stoneStep, exterior, down];
}

