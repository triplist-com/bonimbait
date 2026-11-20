/**
 * Phase 11 · גמרים — flooring, bathroom tiles, gypsum ceilings, windows, doors, stairs,
 * kitchen, sanitary ware, paint, lighting. Everything is derived from the house model
 * (rooms, openings, stairs, fixtures); repeated items are instanced.
 */
import {
  angleOfDir,
  offsetPolygon,
  pointInPolygon as pointInPoly,
  polygonArea,
  rng,
  wallPieces,
} from '../house/geometry';
import type { Part, PrimitiveShape, StepDef, Vec2, Vec3, ViewFlags } from '../engine/types';
import type { Fixture, Room, RoomKind } from '../house/types';
import type { BuildContext } from './context';
import {
  boxesPart,
  fixtureModel,
  fixturePt,
  fixtureY,
  houseBounds,
  lvlTag,
  nearWindow,
  openingGeos,
  roomsOf,
  sideInRoom,
  stagger,
  subtractOpenings,
  sum,
  swingNormal,
  tilePolygon,
  wallInfos,
  wallPt,
  wbox,
  faceRuns,
  type BoxItem,
  type OpeningGeo,
} from './finish-kit';
import { PRICES, line, roundCost } from './kit';

const FINISH_RATES = {
  parquetM2: 520,
  stairClad: 2600, // per flight-meter incl. risers
  mirror: 900,
  rug: 1200,
} as const;

const BOTH_LEVELS: ViewFlags = { ghostAbove: -0.45 };
const ENTRANCE_VIEW: ViewFlags = { ghostAbove: 2.3 };

/** Rooms that get a dropped gypsum ceiling (ducts / wet rooms). */
const DROPPED: RoomKind[] = ['hall', 'closet', 'bath', 'wc', 'laundry'];
const WET: RoomKind[] = ['bath', 'wc', 'laundry'];
const BEDROOMS: RoomKind[] = ['master', 'bedroom', 'closet'];

/** Underside of the dropped ceiling above a room's floor. */
const dropBottom = (floorY: number, ceilingHeight: number) => floorY + ceilingHeight - 0.4;

export function phaseFinishes(ctx: BuildContext): StepDef[] {
  const { house } = ctx;
  const geos = openingGeos(ctx);
  const floorOf = (r: Room) => (r.level === 'lower' ? ctx.lower : ctx.entrance);
  const roomsAll = house.rooms.filter((r) => r.kind !== 'terrace');
  const steps: StepDef[] = [];

  // ===================================================================== flooring
  {
    const parts: Part[] = [];
    let porcelainM2 = 0;
    let parquetM2 = 0;
    let bathM2 = 0;
    (['lower', 'entrance'] as const).forEach((lvl, li) => {
      const floorY = lvl === 'lower' ? ctx.lower.floorY : ctx.entrance.floorY;
      const groups: Record<'main' | 'bath' | 'parquet', BoxItem[]> = { main: [], bath: [], parquet: [] };
      const rand = rng(11 + li);
      for (const r of roomsAll.filter((x) => x.level === lvl)) {
        const kind: 'main' | 'bath' | 'parquet' = BEDROOMS.includes(r.kind) ? 'parquet' : WET.includes(r.kind) ? 'bath' : 'main';
        const poly = offsetPolygon(r.polygon, -0.008);
        const area = polygonArea(r.polygon);
        const tile: Vec2 = kind === 'parquet' ? [1.2, 0.16] : kind === 'bath' ? [0.6, 0.6] : [0.8, 0.8];
        const pieces = tilePolygon(poly, tile, kind === 'parquet' ? { gap: 0.004, random: rand } : { gap: 0.008, bond: 0 });
        for (const p of pieces) groups[kind].push({ at: [p.at[0], floorY - 0.04, p.at[1]], size: [p.size[0], 0.08, p.size[1]] });
        if (kind === 'parquet') parquetM2 += area;
        else if (kind === 'bath') bathM2 += area;
        else porcelainM2 += area;
      }
      const delay = lvl === 'lower' ? 0 : 1.1;
      const spec: Array<[keyof typeof groups, 'porcelain' | 'parquet', string | undefined]> = [
        ['main', 'porcelain', '#E6E1D8'],
        ['bath', 'porcelain', '#B7C3C8'],
        ['parquet', 'parquet', undefined],
      ];
      for (const [k, mat, color] of spec) {
        const items = groups[k];
        if (!items.length) continue;
        parts.push(
          boxesPart(
            `p11-floor-${lvl}-${k}`,
            items,
            mat,
            ['floor-finish', lvlTag(lvl)],
            { type: 'sequence', delay, stagger: stagger(items.length, 2.4, 0.06), order: 'z', duration: 0.35 },
            { color },
          ),
        );
      }
    });
    steps.push({
      id: 'p11-flooring',
      phase: 11,
      titleHe: 'ריצוף',
      materials: [
        line('אריחי פורצלן 80×80', porcelainM2, 'מ״ר', 0),
        line('פרקט למינציה בחדרי השינה', parquetM2, 'מ״ר', 0),
        line('אריחים 60×60 בחדרי רחצה', bathM2, 'מ״ר', 0),
        line('דבק וגרוט', (porcelainM2 + bathM2) * 6, 'ק״ג', 0),
      ],
      costILS: roundCost((porcelainM2 + bathM2) * PRICES.porcelainFloorM2 + parquetM2 * FINISH_RATES.parquetM2),
      parts,
      remove: { tags: ['mep-under-floor'] },
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY, 0.5), polar: 52 },
      view: BOTH_LEVELS,
    });
  }

  // ===================================================================== bath tiles
  {
    const items: BoxItem[] = [];
    const H = 2.4;
    const th = 0.3;
    const tw = 0.6;
    let areaM2 = 0;
    for (const { wall, f, floorY } of wallInfos(ctx)) {
      for (const side of [1, -1] as const) {
        const runs = faceRuns(ctx, wall, f, side, ['bath', 'wc'], []);
        for (const run of runs) {
          for (let j = 0; j < Math.round(H / th); j++) {
            const y0 = floorY + j * th;
            const y1 = y0 + th;
            for (const [a, b] of subtractOpenings(geos, wall, run, y0, y1)) {
              const shift = (j % 2) * (tw / 2);
              for (let s = a - shift; s < b - 0.01; s += tw) {
                const s0 = Math.max(a, s);
                const s1 = Math.min(b, s + tw);
                if (s1 - s0 < 0.04) continue;
                const it = wbox(wall, f, (s0 + s1) / 2, y0 + 0.003, y1 - 0.003, s1 - s0 - 0.006, 0.012, side * (wall.thickness / 2 + 0.028));
                items.push(it);
                areaM2 += (s1 - s0) * th;
              }
            }
          }
        }
      }
    }
    steps.push({
      id: 'p11-bath-tiles',
      phase: 11,
      titleHe: 'חיפוי קירות בחדרי הרחצה',
      materials: [line('חיפוי קרמיקה 30×60', areaM2, 'מ״ר', 0), line('דבק אריחים', areaM2 * 5, 'ק״ג', 0), line('פינות ופרופילים', 40, 'מ׳', 0)],
      costILS: roundCost(areaM2 * PRICES.wallTilesM2),
      parts: [
        boxesPart(
          'p11-bath-tiles-skin',
          items,
          'porcelain',
          ['wall-tiles', 'level:lower', 'level:entrance'],
          { type: 'courses', stagger: stagger(items.length / 12, 3.2, 0.2), duration: 0.3 },
          { color: '#D3E2E7', castShadow: false },
        ),
      ],
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY, 2.5), polar: 52 },
      view: BOTH_LEVELS,
    });
  }

  // ===================================================================== gypsum
  {
    const parts: Part[] = [];
    let area = 0;
    (['lower', 'entrance'] as const).forEach((lvl, li) => {
      const lv = lvl === 'lower' ? ctx.lower : ctx.entrance;
      const y0 = dropBottom(lv.floorY, lv.ceilingHeight);
      const rooms = roomsOf(ctx, lvl, DROPPED);
      if (!rooms.length) return;
      const shapes: PrimitiveShape[] = rooms.map((r) => ({ kind: 'extrude', outline: offsetPolygon(r.polygon, -0.004), y0, y1: y0 + 0.05 }));
      area += sum(rooms, (r) => polygonArea(r.polygon));
      parts.push({
        id: `p11-gypsum-${lvl}`,
        shape: { kind: 'merge', shapes },
        material: 'paint',
        color: '#FCFBF8',
        tags: ['gypsum', lvlTag(lvl)],
        anim: { type: 'drop', from: [0, 1.4, 0], delay: li * 0.8, duration: 1.2, ease: 'back' },
      });
    });
    steps.push({
      id: 'p11-gypsum',
      phase: 11,
      titleHe: 'תקרות גבס',
      materials: [line('לוחות גבס ירוק ורגיל', area, 'מ״ר', 0), line('פרופילי פלדה מגולוונת', area * 2.6, 'מ׳', 0), line('חיבורי תלייה', area * 2, 'יח׳', 0)],
      costILS: roundCost(area * PRICES.gypsumCeilingM2),
      parts,
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY, 3), polar: 50 },
      view: { ghostAbove: dropBottom(0, ctx.entrance.ceilingHeight) - 0.3 },
    });
  }

  // ===================================================================== windows
  {
    const sel = geos.filter((g) => g.o.kind === 'window' || g.o.kind === 'vitrine' || g.o.kind === 'sliding-door');
    const frames: BoxItem[] = [];
    const glass: BoxItem[] = [];
    const sills: BoxItem[] = [];
    const guards: BoxItem[] = [];
    const guardRods: BoxItem[] = [];
    const FW = 0.055;
    let area = 0;
    for (const g of sel) {
      const { wall, f, o, y0, y1, w, h } = g;
      const fd = 0.09;
      const s = o.offset;
      area += w * h;
      frames.push(wbox(wall, f, s, y0, y0 + FW, w, fd));
      frames.push(wbox(wall, f, s, y1 - FW, y1, w, fd));
      for (const e of [-1, 1]) frames.push(wbox(wall, f, s + e * (w / 2 - FW / 2), y0 + FW, y1 - FW, FW, fd));
      glass.push(wbox(wall, f, s, y0 + FW - 0.01, y1 - FW + 0.01, w - 2 * FW + 0.02, 0.014));
      if (o.kind === 'sliding-door') {
        for (const nOff of [-0.026, 0.026]) frames.push(wbox(wall, f, s, y0 + FW, y1 - FW, FW * 0.8, 0.032, nOff));
        // Overlapping sash rails.
        frames.push(wbox(wall, f, s - w / 4, y1 - FW - 0.05, y1 - FW, w / 2 - FW, 0.05, -0.03));
        frames.push(wbox(wall, f, s + w / 4, y0 + FW, y0 + FW + 0.05, w / 2 - FW, 0.05, 0.03));
        frames.push(wbox(wall, f, s + 0.1, y0 + 0.95, y0 + 1.2, 0.02, 0.07, 0.05));
      } else {
        const panels = o.kind === 'vitrine' ? Math.max(2, Math.round(w / 1.3)) : w > 1.9 ? 3 : w > 1.0 ? 2 : 1;
        for (let k = 1; k < panels; k++) frames.push(wbox(wall, f, s - w / 2 + (k * w) / panels, y0 + FW, y1 - FW, FW * 0.9, fd * 0.85));
        if (o.kind === 'vitrine') frames.push(wbox(wall, f, s, y1 - 0.45, y1 - 0.45 + FW * 0.8, w - 2 * FW, fd * 0.8));
      }
      if (o.kind === 'window' && o.sill > 0.5) {
        sills.push(wbox(wall, f, s, y0 - 0.04, y0 - 0.005, w + 0.14, wall.thickness + 0.1));
      }
      // Standard guard rail in front of a full-height opening that looks down into the garden.
      if (o.kind === 'vitrine') {
        const out = sideInRoom(ctx, wall, f, s, null);
        const outside = (out === 0 ? 1 : (-out as 1 | -1)) as 1 | -1;
        const p = wallPt(wall, f, s, outside * (wall.thickness / 2 + 0.2));
        if (ctx.heightAt(p[0], p[1], ctx.terrain.finished) < g.floorY - 0.6) {
          const nOff = outside * (wall.thickness / 2 + 0.12);
          guards.push(wbox(wall, f, s, y0 + 0.05, y0 + 1.0, w - 0.1, 0.012, nOff));
          guardRods.push(wbox(wall, f, s, y0 + 1.0, y0 + 1.04, w, 0.05, nOff));
          for (const e of [-1, 1]) guardRods.push(wbox(wall, f, s + e * (w / 2 - 0.03), y0, y0 + 1.04, 0.045, 0.045, nOff));
        }
      }
    }
    const lines = [
      line('חלונות ודלתות אלומיניום', sel.length, 'יח׳', 0),
      line('זכוכית מבודדת כפולה', area, 'מ״ר', 1),
      line('אדני אבן', sills.length * 1.4, 'מ׳', 0),
    ];
    const near = { type: 'sequence' as const, order: 'near' as const, origin: ctx.lot.gate };
    steps.push({
      id: 'p11-windows',
      phase: 11,
      titleHe: 'חלונות ודלתות אלומיניום',
      materials: lines,
      costILS: roundCost(area * PRICES.aluminumWindowM2),
      parts: [
        boxesPart('p11-window-frames', frames, 'aluminum', ['windows', 'frames', 'level:lower', 'level:entrance'], { ...near, stagger: stagger(frames.length, 2.6, 0.05), duration: 0.3 }),
        boxesPart('p11-window-glass', glass, 'glassLit', ['windows', 'glass', 'level:lower', 'level:entrance'], { type: 'fade', delay: 1.8, duration: 1.0 }, { edges: false, castShadow: false }),
        boxesPart('p11-window-sills', sills, 'stone', ['windows', 'sills'], { type: 'fade', delay: 0.6, duration: 0.6 }),
        ...(guards.length
          ? [
              boxesPart('p11-guard-glass', guards, 'glass', ['windows', 'railing', 'level:entrance'], { type: 'fade', delay: 2.2, duration: 0.8 }, { edges: false }),
              boxesPart('p11-guard-rails', guardRods, 'steel', ['windows', 'railing', 'level:entrance'], { type: 'fade', delay: 2.2, duration: 0.8 }),
            ]
          : []),
      ],
      camera: { fit: 'house', azimuth: 25, polar: 58, zoom: 0.92 },
    });
  }

  // ===================================================================== mamad
  {
    const door = geos.find((g) => g.o.kind === 'mamad-door');
    const win = geos.find((g) => g.o.kind === 'mamad-window');
    const frames: BoxItem[] = [];
    const steel: BoxItem[] = [];
    const details: BoxItem[] = [];
    const glass: BoxItem[] = [];
    const swing = (g: OpeningGeo, hingeAtStart: boolean, angle: number, side: 1 | -1, len: number, thick: number, y0: number, y1: number) => {
      const sn = swingNormal(g.f);
      const hs = hingeAtStart ? g.o.offset - g.w / 2 + 0.03 : g.o.offset + g.w / 2 - 0.03;
      const hp = wallPt(g.wall, g.f, hs, 0);
      const k = hingeAtStart ? 1 : -1;
      const d: Vec2 = [g.f.dir[0] * Math.cos(angle) * k + sn[0] * side * Math.sin(angle), g.f.dir[1] * Math.cos(angle) * k + sn[1] * side * Math.sin(angle)];
      const c: Vec2 = [hp[0] + (d[0] * len) / 2, hp[1] + (d[1] * len) / 2];
      return { at: [c[0], (y0 + y1) / 2, c[1]] as Vec3, size: [len, y1 - y0, thick] as Vec3, rotY: angleOfDir(d), dir: d, hinge: hp };
    };
    let lump = 0;
    if (door) {
      const { wall, f, y0, y1, w } = door;
      const s = door.o.offset;
      const fd = wall.thickness + 0.06;
      frames.push(wbox(wall, f, s, y1 - 0.12, y1, w, fd));
      for (const e of [-1, 1]) frames.push(wbox(wall, f, s + e * (w / 2 - 0.06), y0, y1 - 0.12, 0.12, fd));
      const side = (door.o.swingSide ?? -1) as 1 | -1;
      const lf = swing(door, true, 1.15, side, w - 0.2, 0.1, y0 + 0.01, y1 - 0.14);
      steel.push({ at: lf.at, size: lf.size, rotY: lf.rotY });
      // Locking bolts along the free edge + wheel handle.
      const sn = swingNormal(f);
      for (const yy of [0.35, 0.85, 1.35]) {
        const p: Vec2 = [lf.hinge[0] + lf.dir[0] * (w - 0.2 - 0.04), lf.hinge[1] + lf.dir[1] * (w - 0.2 - 0.04)];
        details.push({ at: [p[0] + sn[0] * side * 0.07, y0 + yy, p[1] + sn[1] * side * 0.07], size: [0.16, 0.05, 0.05], rotY: lf.rotY });
      }
      const wheel: Vec2 = [lf.hinge[0] + lf.dir[0] * (w - 0.2) * 0.55 + sn[0] * side * 0.08, lf.hinge[1] + lf.dir[1] * (w - 0.2) * 0.55 + sn[1] * side * 0.08];
      details.push({ at: [wheel[0], y0 + 1.0, wheel[1]], size: [0.2, 0.04, 0.06], rotY: lf.rotY });
      details.push({ at: [wheel[0], y0 + 1.0, wheel[1]], size: [0.04, 0.2, 0.06], rotY: lf.rotY });
      lump += 1;
    }
    if (win) {
      const { wall, f, y0, y1, w } = win;
      const s = win.o.offset;
      const fd = wall.thickness + 0.04;
      frames.push(wbox(wall, f, s, y0, y0 + 0.1, w, fd));
      frames.push(wbox(wall, f, s, y1 - 0.1, y1, w, fd));
      for (const e of [-1, 1]) frames.push(wbox(wall, f, s + e * (w / 2 - 0.05), y0 + 0.1, y1 - 0.1, 0.1, fd));
      glass.push(wbox(wall, f, s, y0 + 0.1, y1 - 0.1, w - 0.2, 0.03));
      const inside = sideInRoom(ctx, wall, f, s, ['mamad']) || 1;
      for (const atStart of [true, false]) {
        const lf = swing(win, atStart, 1.75, inside as 1 | -1, (w - 0.2) / 2 - 0.01, 0.06, y0 + 0.11, y1 - 0.11);
        steel.push({ at: lf.at, size: lf.size, rotY: lf.rotY });
      }
      lump += 1;
    }
    steps.push({
      id: 'p11-mamad-door',
      phase: 11,
      titleHe: 'דלת הדף וחלון ממ״ד',
      materials: [line('דלת הדף מפלדה (מאושרת פיקוד העורף)', 1, 'יח׳', 0), line('חלון הדף עם תריסי פלדה', 1, 'יח׳', 0), line('חומרי הידוק ואיטום', 12, 'ק״ג', 0)],
      costILS: PRICES.mamadDoorAndWindow * Math.max(1, lump) / 1,
      parts: [
        boxesPart('p11-mamad-frames', frames, 'steel', ['mamad', 'frames', 'level:entrance'], { type: 'drop', from: [0, 1.6, 0], duration: 0.9 }),
        boxesPart('p11-mamad-leaves', steel, 'steel', ['mamad', 'leaves', 'level:entrance'], { type: 'fade', delay: 0.7, duration: 0.7 }, { color: '#7E8C84' }),
        boxesPart('p11-mamad-hardware', details, 'galvanized', ['mamad', 'hardware', 'level:entrance'], { type: 'fade', delay: 1.1, duration: 0.5 }),
        boxesPart('p11-mamad-glass', glass, 'glass', ['mamad', 'glass', 'level:entrance'], { type: 'fade', delay: 1.1, duration: 0.6 }, { edges: false }),
      ],
      camera: { fit: 'parts', zoom: 1.9, azimuth: 30, polar: 62 },
      view: ENTRANCE_VIEW,
    });
  }

  // ===================================================================== entry door
  {
    const g = geos.find((x) => x.o.kind === 'entry-door');
    const slats: BoxItem[] = [];
    const frame: BoxItem[] = [];
    const glass: BoxItem[] = [];
    const steel: BoxItem[] = [];
    const step: BoxItem[] = [];
    if (g) {
      const { wall, f, y0, y1, w } = g;
      const s = g.o.offset;
      const fd = 0.1;
      const outside = (sideInRoom(ctx, wall, f, s, ['entry']) || 1) as 1 | -1;
      frame.push(wbox(wall, f, s, y1 - 0.07, y1, w, fd));
      for (const e of [-1, 1]) frame.push(wbox(wall, f, s + e * (w / 2 - 0.035), y0, y1 - 0.07, 0.07, fd));
      const leafW = w - 0.07 * 2 - 0.34;
      const sL = s - w / 2 + 0.07 + leafW / 2;
      const n = 9;
      const pitch = leafW / n;
      for (let k = 0; k < n; k++) slats.push(wbox(wall, f, s - w / 2 + 0.07 + (k + 0.5) * pitch, y0 + 0.01, y1 - 0.08, pitch - 0.012, 0.055));
      // Side light glass + slim divider.
      const sG = s + w / 2 - 0.07 - 0.15;
      glass.push(wbox(wall, f, sG, y0 + 0.01, y1 - 0.08, 0.3, 0.016));
      frame.push(wbox(wall, f, s - w / 2 + 0.07 + leafW + 0.02, y0, y1 - 0.07, 0.04, 0.07));
      // Long steel pull handle on the outside.
      steel.push(wbox(wall, f, sL + leafW / 2 - 0.09, y0 + 0.8, y0 + 1.65, 0.03, 0.03, outside * 0.085));
      steel.push(wbox(wall, f, sL + leafW / 2 - 0.09, y0 + 0.82, y0 + 0.86, 0.03, 0.03, outside * 0.045));
      steel.push(wbox(wall, f, sL + leafW / 2 - 0.09, y0 + 1.59, y0 + 1.63, 0.03, 0.03, outside * 0.045));
      // Stone threshold.
      step.push(wbox(wall, f, s, y0 - 0.03, y0 + 0.01, w + 0.1, wall.thickness + 0.16));
    }
    steps.push({
      id: 'p11-entry-door',
      phase: 11,
      titleHe: 'דלת כניסה',
      materials: [line('דלת כניסה בטיחותית עם חיפוי עץ', 1, 'יח׳', 0), line('משקוף פלדה', 1, 'יח׳', 0), line('מפתן אבן', 1, 'יח׳', 0)],
      costILS: PRICES.entryDoor,
      parts: [
        boxesPart('p11-entry-frame', frame, 'aluminum', ['door', 'entry', 'level:entrance'], { type: 'fade', duration: 0.6 }),
        boxesPart('p11-entry-slats', slats, 'wood', ['door', 'entry', 'level:entrance'], { type: 'sequence', delay: 0.4, stagger: 0.09, duration: 0.4, order: 'index' }, { color: '#6E4A2E' }),
        boxesPart('p11-entry-glass', glass, 'glassLit', ['door', 'entry', 'level:entrance'], { type: 'fade', delay: 1.2, duration: 0.7 }, { edges: false }),
        boxesPart('p11-entry-handle', steel, 'galvanized', ['door', 'entry', 'level:entrance'], { type: 'fade', delay: 1.4, duration: 0.5 }),
        boxesPart('p11-entry-step', step, 'stone', ['door', 'entry', 'level:entrance'], { type: 'fade', duration: 0.5 }),
      ],
      camera: { fit: 'parts', zoom: 2.2, azimuth: 280, polar: 72 },
      view: ENTRANCE_VIEW,
    });
  }

  // ===================================================================== interior doors
  {
    const doors = geos.filter((x) => x.o.kind === 'door' || x.o.kind === 'opening');
    const leaves: BoxItem[] = [];
    const casing: BoxItem[] = [];
    const handles: BoxItem[] = [];
    const rand = rng(77);
    let nLeaves = 0;
    for (const g of doors) {
      const { wall, f, y0, y1, w } = g;
      const s = g.o.offset;
      const cd = wall.thickness + 0.07;
      casing.push(wbox(wall, f, s, y1 - 0.06, y1 + 0.005, w + 0.1, cd));
      for (const e of [-1, 1]) casing.push(wbox(wall, f, s + e * (w / 2 + 0.025), y0, y1 - 0.06, 0.05, cd));
      if (g.o.kind !== 'door') continue;
      nLeaves += 1;
      const side = (g.o.swingSide ?? 1) as 1 | -1;
      const hingeStart = side === 1;
      const ang = 0.35 + rand() * 0.35;
      const len = w - 0.02;
      const sn = swingNormal(f);
      const hp = wallPt(wall, f, hingeStart ? s - w / 2 + 0.012 : s + w / 2 - 0.012, 0);
      const k = hingeStart ? 1 : -1;
      const d: Vec2 = [f.dir[0] * Math.cos(ang) * k + sn[0] * side * Math.sin(ang), f.dir[1] * Math.cos(ang) * k + sn[1] * side * Math.sin(ang)];
      const c: Vec2 = [hp[0] + (d[0] * len) / 2, hp[1] + (d[1] * len) / 2];
      leaves.push({ at: [c[0], (y0 + y1) / 2 + 0.005, c[1]], size: [len, y1 - y0 - 0.02, 0.04], rotY: angleOfDir(d) });
      const hx: Vec2 = [hp[0] + d[0] * (len - 0.1), hp[1] + d[1] * (len - 0.1)];
      handles.push({ at: [hx[0], y0 + 1.0, hx[1]], size: [0.12, 0.025, 0.07], rotY: angleOfDir(d) });
    }
    steps.push({
      id: 'p11-interior-doors',
      phase: 11,
      titleHe: 'דלתות פנים',
      materials: [line('דלתות פנים עם משקוף', nLeaves, 'יח׳', 0), line('ציר ומנעול', nLeaves, 'סט', 0), line('חיפוי משקוף (בגרונג)', casing.length / 3, 'יח׳', 0)],
      costILS: roundCost(nLeaves * PRICES.interiorDoor),
      parts: [
        boxesPart('p11-door-casing', casing, 'paint', ['door', 'casing', 'level:lower', 'level:entrance'], { type: 'sequence', order: 'near', origin: ctx.lot.gate, stagger: stagger(casing.length, 2, 0.06), duration: 0.3 }, { color: '#F8F5EF' }),
        boxesPart('p11-door-leaves', leaves, 'wood', ['door', 'leaf', 'level:lower', 'level:entrance'], { type: 'sequence', order: 'near', origin: ctx.lot.gate, delay: 0.5, stagger: 0.12, duration: 0.5 }, { color: '#D9BC93' }),
        boxesPart('p11-door-handles', handles, 'galvanized', ['door', 'hardware', 'level:lower', 'level:entrance'], { type: 'fade', delay: 1.6, duration: 0.5 }),
      ],
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY, 2.4), polar: 50 },
      view: BOTH_LEVELS,
    });
  }

  // ===================================================================== stairs
  {
    const st = house.stairs[0];
    const parts: Part[] = [];
    if (st) {
      const fy0 = ctx.lower.floorY;
      const fy1 = ctx.entrance.floorY;
      const rise = (fy1 - fy0) / st.risers;
      const w = st.width;
      const xe = st.path[0][0];
      const xw = st.path[1][0];
      const z1 = st.path[0][1];
      const z2 = st.path[st.path.length - 1][1];
      const n1 = Math.floor((st.risers - 1) / 2);
      const n2 = st.risers - n1 - 2;
      const t1 = 0.3;
      const xL = xe - n1 * t1;
      const d2 = (xe - xL) / n2;
      const yk = (k: number) => fy0 + k * rise;
      const treads: BoxItem[] = [];
      const risers: BoxItem[] = [];
      const core: BoxItem[] = [];
      const zFront1 = z1;
      const addCore = (x0: number, x1: number, z: number, wd: number, top: number) =>
        core.push({ at: [(x0 + x1) / 2, top - 0.035 - 0.17, z], size: [x1 - x0, 0.34, wd], rotY: 0 });
      for (let k = 1; k <= n1; k++) {
        const xf = xe - (k - 1) * t1;
        treads.push({ at: [xf - t1 / 2 + 0.015, yk(k) - 0.0175, zFront1], size: [t1 + 0.03, 0.035, w] });
        risers.push({ at: [xf - 0.012, (yk(k) + yk(k - 1)) / 2, zFront1], size: [0.02, rise, w] });
        addCore(xf - t1, xf, zFront1, w, yk(k));
      }
      // Landing (riser n1 + 1) spanning both flights.
      const xwEdge = xw - w / 2;
      const zLo = z1 - w / 2;
      const zHi = z2 + w / 2;
      treads.push({ at: [(xwEdge + xL) / 2, yk(n1 + 1) - 0.0175, (zLo + zHi) / 2], size: [xL - xwEdge, 0.035, zHi - zLo] });
      risers.push({ at: [xL - 0.012, (yk(n1 + 1) + yk(n1)) / 2, zFront1], size: [0.02, rise, w] });
      addCore(xwEdge, xL, (zLo + zHi) / 2, zHi - zLo, yk(n1 + 1));
      for (let k = n1 + 2; k <= n1 + 1 + n2; k++) {
        const xf = xL + (k - n1 - 2) * d2;
        treads.push({ at: [xf + d2 / 2 - 0.015, yk(k) - 0.0175, z2], size: [d2 + 0.03, 0.035, w] });
        risers.push({ at: [xf + 0.012, (yk(k) + yk(k - 1)) / 2, z2], size: [0.02, rise, w] });
        addCore(xf, xf + d2, z2, w, yk(k));
      }
      risers.push({ at: [xe - 0.012, (yk(st.risers) + yk(st.risers - 1)) / 2, z2], size: [0.02, rise, w] });
      parts.push(
        boxesPart('p11-stair-core', core, 'concrete', ['stair', 'level:lower', 'level:entrance'], { type: 'sequence', order: 'y', stagger: 0.07, duration: 0.3 }),
        boxesPart('p11-stair-treads', treads, 'parquet', ['stair', 'cladding', 'level:lower', 'level:entrance'], { type: 'sequence', order: 'y', delay: 0.5, stagger: 0.09, duration: 0.35 }),
        boxesPart('p11-stair-risers', risers, 'paint', ['stair', 'cladding', 'level:lower', 'level:entrance'], { type: 'sequence', order: 'y', delay: 0.5, stagger: 0.09, duration: 0.35 }),
      );
      // Glass railing: sloped along the open edge of the upper flight + flat guards at the stair opening.
      const slope = Math.atan2(rise, d2);
      const run = xe - xL;
      const zr = z2 - w / 2 + 0.11;
      const L = run / Math.cos(slope);
      const yMidLine = yk(n1 + 2) + (rise / d2) * (run / 2) - 0.0;
      const glassItems: BoxItem[] = [
        { at: [(xL + xe) / 2, yMidLine + 0.52, zr], size: [L, 0.9, 0.012], rot: [0, 0, slope] },
        { at: [(1.9 + xe + 0.1) / 2, fy1 + 0.5, zHi - 0.01], size: [xe + 0.1 - 1.9, 0.95, 0.012] },
        { at: [xe + 0.12, fy1 + 0.5, (z1 - w / 2 + 0.03 + z1 + w / 2) / 2], size: [0.012, 0.95, w - 0.03] },
      ];
      const handrails: Part['shape'][] = [
        { kind: 'rod', a: [xL, yk(n1 + 2) + 0.98, zr], b: [xe, yk(st.risers) + 0.98, zr], radius: 0.02, segments: 8 },
        { kind: 'rod', a: [1.9, fy1 + 0.97, zHi - 0.01], b: [xe + 0.12, fy1 + 0.97, zHi - 0.01], radius: 0.02, segments: 8 },
        { kind: 'rod', a: [xe + 0.12, fy1 + 0.97, zHi - 0.01], b: [xe + 0.12, fy1 + 0.97, z1 - w / 2 + 0.03], radius: 0.02, segments: 8 },
      ];
      parts.push(boxesPart('p11-stair-glass', glassItems, 'glass', ['stair', 'railing', 'level:entrance'], { type: 'fade', delay: 2.6, duration: 0.9 }, { edges: false }));
      handrails.forEach((shape, i) =>
        parts.push({ id: `p11-stair-handrail-${i}`, shape, material: 'steel', tags: ['stair', 'railing', 'level:entrance'], anim: { type: 'fade', delay: 2.9, duration: 0.5 }, edges: false }),
      );
    }
    const railM = 2.9 + 2.1 + 1.0;
    steps.push({
      id: 'p11-stairs',
      phase: 11,
      titleHe: 'חיפוי מדרגות ומעקה זכוכית',
      materials: [line('חיפוי מדרגות (משטח וקופינג)', (st?.risers ?? 19) * 1.0, 'מ״א', 0), line('מעקה זכוכית מחוסמת + מאחז יד', railM, 'מ״א', 1), line('דבק ופרופילי קצה', 38, 'מ׳', 0)],
      costILS: roundCost((st?.risers ?? 19) * 1.0 * FINISH_RATES.stairClad * 0.4 + railM * PRICES.glassRailingM),
      parts,
      camera: { fit: 'parts', zoom: 1.5, azimuth: 330, polar: 52 },
      view: BOTH_LEVELS,
    });
  }

  // ===================================================================== kitchen
  const cabinetRuns = kitchenRuns(ctx, geos);
  {
    const kit = house.fixtures.filter((f) => f.level === 'entrance' && (f.kind === 'kitchen-island' || f.kind === 'kitchen-counter'));
    const parts: Part[] = [];
    const baseB: BoxItem[] = [];
    const tops: BoxItem[] = [];
    const uppers: BoxItem[] = [];
    const splash: BoxItem[] = [];
    const hardware: BoxItem[] = [];
    let linear = 0;
    for (const f of kit) {
      linear += Math.max(f.size[0], f.size[1]);
      const run = cabinetRuns.find((r) => r.fixture.id === f.id);
      if (!run) {
        parts.push(
          fixtureModel(ctx, f, f.kind === 'kitchen-island' ? 'kitchen-island' : 'kitchen-counter', `p11-kit-${f.id}`, {
            tags: ['kitchen', 'level:entrance'],
            anim: { type: 'drop', from: [0, 1.8, 0], duration: 0.9, delay: parts.length * 0.35, ease: 'bounce' },
          }),
        );
        continue;
      }
      // Built from boxes so cabinets can skip the windows above the counter.
      const [w, d] = f.size;
      const y = fixtureY(ctx, f);
      const n = Math.max(1, Math.round(w / 0.6));
      const mod = w / n;
      const lz = (lx: number, lzv: number): Vec2 => fixturePt(f, lx, lzv);
      for (let i = 0; i < n; i++) {
        const lx = -w / 2 + (i + 0.5) * mod;
        const cb = lz(lx, 0);
        baseB.push({ at: [cb[0], y + 0.1 + 0.38, cb[1]], size: [mod - 0.008, 0.76, d - 0.04], rotY: f.rotation });
        const handle = lz(lx, d / 2);
        hardware.push({ at: [handle[0], y + 0.78, handle[1]], size: [0.012, 0.012, 0.22].map((v, k) => (k === 2 ? 0.22 : v)) as Vec3, rotY: f.rotation + Math.PI / 2 });
        const back = lz(lx, -d / 2);
        if (!nearWindow(geos, 'entrance', back, 0.05)) {
          const cu = lz(lx, -d / 2 + 0.175);
          uppers.push({ at: [cu[0], y + 1.45 + 0.35, cu[1]], size: [mod - 0.008, 0.7, 0.35], rotY: f.rotation });
          const sp = lz(lx, -d / 2 + 0.008);
          splash.push({ at: [sp[0], y + 0.9 + 0.275, sp[1]], size: [mod - 0.002, 0.55, 0.014], rotY: f.rotation });
        }
      }
      const toeC = lz(0, -0.01);
      baseB.push({ at: [toeC[0], y + 0.05, toeC[1]], size: [w - 0.02, 0.1, d - 0.12], rotY: f.rotation });
      const topC = lz(0, 0);
      tops.push({ at: [topC[0], y + 0.88, topC[1]], size: [w, 0.04, d + 0.04], rotY: f.rotation });
      // Sink basin and cooktop on this run.
      const sinkX = run.sinkX;
      const sc = lz(sinkX, 0);
      hardware.push({ at: [sc[0], y + 0.9, sc[1]], size: [0.55, 0.012, 0.4], rotY: f.rotation });
      const hob = lz(Math.min(w / 2 - 0.5, sinkX + 1.2), 0);
      tops.push({ at: [hob[0], y + 0.902, hob[1]], size: [0.6, 0.006, 0.5], rotY: f.rotation });
    }
    if (baseB.length) {
      const dly = parts.length * 0.35;
      parts.push(
        boxesPart('p11-kit-base', baseB, 'paint', ['kitchen', 'cabinets', 'level:entrance'], { type: 'sequence', order: 'near', origin: ctx.lot.gate, delay: dly, stagger: 0.05, duration: 0.35 }, { color: '#EDE7DC' }),
        boxesPart('p11-kit-tops', tops, 'stone', ['kitchen', 'counter', 'level:entrance'], { type: 'fade', delay: dly + 0.6, duration: 0.6 }, { color: '#4A4D52' }),
        boxesPart('p11-kit-uppers', uppers, 'paint', ['kitchen', 'cabinets', 'level:entrance'], { type: 'sequence', order: 'near', origin: ctx.lot.gate, delay: dly + 0.8, stagger: 0.07, duration: 0.35 }, { color: '#F6F2EA' }),
        boxesPart('p11-kit-splash', splash, 'porcelain', ['kitchen', 'level:entrance'], { type: 'fade', delay: dly + 1.2, duration: 0.5 }, { color: '#CDD9DB' }),
        boxesPart('p11-kit-hardware', hardware, 'galvanized', ['kitchen', 'level:entrance'], { type: 'fade', delay: dly + 1.4, duration: 0.5 }, { edges: false }),
      );
    }
    steps.push({
      id: 'p11-kitchen',
      phase: 11,
      titleHe: 'מטבח',
      materials: [line('מטבח כולל ארונות ושיש', linear, 'מ״א', 1), line('אי מטבח עם שרפרפים', 1, 'יח׳', 0), line('ארונות עליונים', uppers.length, 'יח׳', 0)],
      costILS: roundCost(linear * PRICES.kitchenLinearM),
      parts,
      camera: { bounds: { min: [4.6, 0, 9.4], max: [11, 3, 16.2] }, azimuth: 20, polar: 52 },
      view: ENTRANCE_VIEW,
    });
  }

  // ===================================================================== sanitary
  {
    const fx = house.fixtures.filter((f) => f.kind === 'toilet' || f.kind === 'sink' || f.kind === 'shower');
    const parts: Part[] = [];
    fx.forEach((f, i) => {
      const name = f.kind === 'toilet' ? 'toilet' : f.kind === 'sink' ? 'sink' : 'shower';
      parts.push(
        fixtureModel(ctx, f, name, `p11-san-${f.id}`, {
          tags: ['sanitary', lvlTag(f.level)],
          anim: { type: 'drop', from: [0, 1.4, 0], delay: i * 0.18, duration: 0.7, ease: 'bounce' },
        }, f.kind === 'shower' ? { height: 0 } : {}),
      );
    });
    const baths = roomsOf(ctx, 'entrance', ['bath', 'wc']).length + roomsOf(ctx, 'lower', ['bath', 'wc']).length;
    steps.push({
      id: 'p11-sanitary',
      phase: 11,
      titleHe: 'כלים סניטריים',
      materials: [
        line('אסלות תלויות עם מיכל סמוי', fx.filter((f) => f.kind === 'toilet').length, 'יח׳', 0),
        line('כיורים וארונות אמבט', fx.filter((f) => f.kind === 'sink').length, 'יח׳', 0),
        line('מקלחונים עם זכוכית מחוסמת', fx.filter((f) => f.kind === 'shower').length, 'יח׳', 0),
      ],
      costILS: roundCost(baths * PRICES.sanitarySet),
      parts,
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY, 2.4), polar: 48 },
      view: BOTH_LEVELS,
    });
  }

  // ===================================================================== paint
  {
    const items: BoxItem[] = [];
    let area = 0;
    const stairPolys: Vec2[][] = house.stairs.map((s) => s.footprint);
    for (const { wall, f, level, floorY } of wallInfos(ctx)) {
      if (!level) continue;
      const pieces = wallPieces(wall, house.openings, floorY);
      for (const side of [1, -1] as const) {
        const runs = faceRuns(ctx, wall, f, side, null, ['terrace'], stairPolys);
        for (const run of runs) {
          for (const p of pieces) {
            const s0 = Math.max(p.s0, run[0]);
            const s1 = Math.min(p.s1, run[1]);
            if (s1 - s0 < 0.04) continue;
            items.push(wbox(wall, f, (s0 + s1) / 2, p.y0, p.y1, s1 - s0, 0.011, side * (wall.thickness / 2 + 0.0175)));
            area += (s1 - s0) * (p.y1 - p.y0);
          }
        }
      }
    }
    steps.push({
      id: 'p11-paint',
      phase: 11,
      titleHe: 'צבע',
      materials: [line('צבע אקרילי לבן-חם (שתי שכבות)', area, 'מ״ר', 0), line('שפכטל וסיוד יסוד', area * 0.35, 'ק״ג', 0), line('צבע לתקרות', 190, 'מ״ר', 0)],
      costILS: roundCost(area * PRICES.paintM2),
      parts: [
        boxesPart(
          'p11-paint-skin',
          items,
          'paint',
          ['paint-interior', 'level:lower', 'level:entrance'],
          { type: 'fade', duration: 1.6 },
          { color: '#F9F5EC', edges: false, castShadow: false },
        ),
      ],
      remove: { tags: ['plaster-interior'] },
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY, 3.2), polar: 50 },
      view: BOTH_LEVELS,
    });
  }

  // ===================================================================== lighting
  {
    const spots: Array<{ at: Vec3; rotY?: number; scale?: number }> = [];
    const strips: BoxItem[] = [];
    const parts: Part[] = [];
    for (const r of roomsAll) {
      const lv = floorOf(r);
      const ceilY = DROPPED.includes(r.kind) ? dropBottom(lv.floorY, lv.ceilingHeight) : lv.floorY + lv.ceilingHeight;
      const inner = offsetPolygon(r.polygon, -0.4);
      const xs = r.polygon.map((p) => p[0]);
      const zs = r.polygon.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      const spacing = r.kind === 'hall' || r.kind === 'entry' ? 1.7 : 1.9;
      const nx = Math.max(1, Math.round((x1 - x0) / spacing));
      const nz = Math.max(1, Math.round((z1 - z0) / spacing));
      let cnt = 0;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          const p: Vec2 = [x0 + ((i + 0.5) * (x1 - x0)) / nx, z0 + ((j + 0.5) * (z1 - z0)) / nz];
          if (!pointInPoly(p, inner)) continue;
          spots.push({ at: [p[0], ceilY - 0.012, p[1]] });
          cnt += 1;
        }
      if (!cnt) {
        const c = r.labelAt;
        spots.push({ at: [c[0], ceilY - 0.012, c[1]] });
      }
    }
    // Under-cabinet strips.
    for (const run of cabinetRuns) {
      const f = run.fixture;
      const y = fixtureY(ctx, f);
      for (const m of run.upperMods) strips.push({ at: [m.at[0], y + 1.43, m.at[1]], size: [m.len - 0.06, 0.012, 0.03], rotY: f.rotation });
    }
    const pendants: Part[] = [];
    const dining = house.fixtures.find((f) => f.kind === 'dining-table');
    const island = house.fixtures.find((f) => f.kind === 'kitchen-island');
    const entCeil = ctx.entrance.floorY + ctx.entrance.ceilingHeight;
    const addPend = (f: Fixture, n: number, spread: number, id: string, axis: 'x' | 'z') => {
      for (let i = 0; i < n; i++) {
        const t = (i - (n - 1) / 2) * spread;
        const p = axis === 'x' ? fixturePt(f, t, 0) : fixturePt(f, 0, t);
        pendants.push({
          id: `${id}-${i}`,
          shape: { kind: 'model', name: 'lamp-pendant' },
          material: 'white',
          position: [p[0], entCeil - 1.3, p[1]],
          tags: ['lighting', 'pendant', 'level:entrance'],
          anim: { type: 'drop', from: [0, 1.2, 0], delay: 0.8 + pendants.length * 0.15, duration: 0.7, ease: 'bounce' },
        });
      }
    };
    if (dining) addPend(dining, 3, 0.7, 'p11-pend-dining', 'x');
    if (island) addPend(island, 3, 0.75, 'p11-pend-island', 'x');
    parts.push({
      id: 'p11-spots',
      shape: { kind: 'instances', of: { kind: 'cylinder', radius: 0.07, height: 0.014, segments: 14 }, items: spots },
      material: 'light',
      tags: ['lighting', 'spot', 'level:lower', 'level:entrance'],
      edges: false,
      castShadow: false,
      anim: { type: 'sequence', order: 'near', origin: ctx.lot.gate, stagger: stagger(spots.length, 2.6, 0.05), duration: 0.35 },
    });
    if (strips.length)
      parts.push(boxesPart('p11-strips', strips, 'light', ['lighting', 'strip', 'level:entrance'], { type: 'fade', delay: 1.2, duration: 0.6 }, { edges: false, castShadow: false }));
    // Wall sconces flanking the entry door inside the porch.
    const porch = roomsOf(ctx, 'entrance', ['entry'])[0];
    if (porch) {
      const xs = porch.polygon.map((p) => p[0]);
      const zs = porch.polygon.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2 - 0.15;
      const sc = [Math.min(...zs) + 0.07, Math.max(...zs) - 0.07].map((z) => ({ at: [cx, ctx.entrance.floorY + 1.95, z] as Vec3, size: [0.14, 0.26, 0.07] as Vec3 }));
      parts.push(boxesPart('p11-sconces', sc, 'light', ['lighting', 'sconce', 'level:entrance'], { type: 'fade', delay: 1.6, duration: 0.6 }, { edges: false, castShadow: false }));
    }
    parts.push(...pendants);
    steps.push({
      id: 'p11-lighting',
      phase: 11,
      titleHe: 'גופי תאורה',
      materials: [line('ספוטים שקועים LED', spots.length, 'יח׳', 0), line('מנורות תלייה', pendants.length, 'יח׳', 0), line('פסי תאורה מתחת לארונות', strips.length, 'יח׳', 0)],
      costILS: roundCost((spots.length + pendants.length * 3 + strips.length) * PRICES.lightingFixture),
      parts,
      camera: { bounds: houseBounds(ctx, ctx.lower.floorY, 3.2), polar: 50 },
      view: BOTH_LEVELS,
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// helpers local to the phase
// ---------------------------------------------------------------------------

interface CabinetRun {
  fixture: Fixture;
  sinkX: number;
  upperMods: Array<{ at: Vec2; len: number }>;
}

/** Counter runs that have a window above them are built from boxes; returns their module layout. */
function kitchenRuns(ctx: BuildContext, geos: OpeningGeo[]): CabinetRun[] {
  const out: CabinetRun[] = [];
  for (const f of ctx.house.fixtures) {
    if (f.level !== 'entrance' || f.kind !== 'kitchen-counter') continue;
    const [w, d] = f.size;
    const n = Math.max(1, Math.round(w / 0.6));
    const mod = w / n;
    let anyWindow = false;
    const upperMods: CabinetRun['upperMods'] = [];
    const wins: number[] = [];
    for (let i = 0; i < n; i++) {
      const lx = -w / 2 + (i + 0.5) * mod;
      const back = fixturePt(f, lx, -d / 2);
      if (nearWindow(geos, 'entrance', back, 0.05)) {
        anyWindow = true;
        wins.push(lx);
      } else {
        const cu = fixturePt(f, lx, -d / 2 + 0.175);
        upperMods.push({ at: cu, len: mod });
      }
    }
    if (!anyWindow) continue;
    const sinkX = wins.length ? wins[Math.floor(wins.length / 2)] : 0;
    out.push({ fixture: f, sinkX, upperMods });
  }
  return out;
}

