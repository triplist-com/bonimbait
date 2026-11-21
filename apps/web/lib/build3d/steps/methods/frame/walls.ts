/**
 * Wall framing for the steel / timber methods: cross-sections inside each house wall's own
 * thickness, studs @ 60 cm, king + jack studs and headers at every opening, cripples, rough
 * sills, bottom / top plates (steel tracks), blocking (timber noggins / steel bridging channel),
 * X-straps (steel), hold-downs, temporary braces, and the conversion of all of it to instanced
 * parts (steel C-studs and U-tracks as instanced profiles, timber as plain boxes).
 *
 * A wall is split into shop-sized panels (breaks never inside an opening), and panels are
 * grouped by position around the house so a step can raise them group by group.
 */
import { wallFrame, wallPoint, type WallFrame } from '../../../house/geometry';
import type { Column, Opening, Vec2, Vec3, Wall } from '../../../house/types';
import type { Anim, PrimitiveShape } from '../../../engine/types';
import type { BuildContext } from '../../context';
import { cornerCuts, subtractAll, type Face, type Rect } from '../../envelope-kit';
import { CB_T, DRY_EMBED, STEEL_KG_M, type FrameSpec } from './spec';

export interface Box {
  at: Vec3;
  size: Vec3;
  rotY: number;
}
export interface Rod {
  a: Vec3;
  b: Vec3;
}
export interface Inst {
  at: Vec3;
  rotY: number;
  scale: Vec3;
}

export type WallKind = 'ext' | 'int' | 'par';

/** Cross-section of one framed wall (n = offset along the wall normal from the centerline). */
export interface Section {
  kind: WallKind;
  /** Exterior face (ext / par) or 0 (interior partition, both faces get gypsum). */
  e: Face | 0;
  /** Stud zone [n0, n1] (n0 < n1). */
  stud: [number, number];
  /** Faces that get exterior boards (cement board) in the sheathing step. */
  boardFaces: Face[];
}

export type MemberKind = 'base' | 'bottom' | 'stud' | 'king' | 'jack' | 'cripple' | 'top' | 'sill' | 'header' | 'beam' | 'block';

export interface Member {
  kind: MemberKind;
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

export interface Panel {
  fw: FramedWall;
  s0: number;
  s1: number;
  members: Member[];
  /** Stud centers (all kinds) for bays. */
  studs: Array<{ s: number; y0: number; y1: number }>;
  /** Rough openings inside the panel. */
  ros: RO[];
  /** X-strap diagonals in wall coords (s, y). */
  straps: Array<[[number, number], [number, number]]>;
  /** Hold-down positions (s). */
  holds: number[];
  /** Panel center (world XZ). */
  center: Vec2;
}

export interface RO {
  s0: number;
  s1: number;
  yb: number;
  yt: number;
  door: boolean;
}

export interface FramedWall {
  wall: Wall;
  f: WallFrame;
  sec: Section;
  floorY: number;
  /** Framed s-range after corner trims. */
  S0: number;
  S1: number;
  panels: Panel[];
  /** Net framed face area (openings out). */
  area: number;
  /** Pseudo wall built for a column (stud pack / post). */
  post?: boolean;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** n range for the band d0..d1 (distances inward from face f). */
export const zoneN = (w: Wall, f: Face, d0: number, d1: number): [number, number] => {
  const a = f * (w.thickness / 2 - d0);
  const b = f * (w.thickness / 2 - d1);
  return [Math.min(a, b), Math.max(a, b)];
};

export function sectionOf(spec: FrameSpec, w: Wall, kind: WallKind, outside: (p: Vec2) => boolean): Section {
  const t = w.thickness;
  const probe = (face: Face): Vec2 => wallPoint(w, wallFrame(w).length / 2, face * (t / 2 + 0.25));
  if (kind === 'int') return { kind, e: 0, stud: zoneN(w, 1, DRY_EMBED, t - DRY_EMBED), boardFaces: [] };
  const out1 = outside(probe(1));
  const outm = outside(probe(-1));
  let e: Face = out1 && !outm ? 1 : outm && !out1 ? -1 : 1;
  if (!out1 && !outm) {
    // Both faces inside (a wall between two interior zones): treat as a partition.
    return { kind: 'int', e: 0, stud: zoneN(w, 1, DRY_EMBED, t - DRY_EMBED), boardFaces: [] };
  }
  if (out1 && outm && kind === 'ext') e = 1;
  if (kind === 'par') {
    const inner = (-e) as Face;
    return { kind, e, stud: zoneN(w, e, spec.outerT, t - CB_T), boardFaces: [e, inner] };
  }
  return { kind, e, stud: zoneN(w, e, spec.outerT, t - DRY_EMBED), boardFaces: [e] };
}

// ---------------------------------------------------------------------------
// Framing one wall
// ---------------------------------------------------------------------------

export interface FrameOpts {
  /** s-intervals owned by other walls (corner overlaps). */
  trims?: Array<[number, number]>;
  spacing?: number;
  panelMax?: number;
  /** Timber: treated sole plate under the panel's bottom plate (walls on concrete). */
  sole?: boolean;
  /** Hold-downs at wall ends and big openings. */
  holds?: boolean;
  /** Steel X-straps on the exterior face of solid panels. */
  straps?: boolean;
  post?: boolean;
}

const headerDepth = (span: number) => (span <= 1.0 ? 0.2 : span <= 2.0 ? 0.25 : 0.3);

export function frameWall(spec: FrameSpec, w: Wall, sec: Section, ops: Opening[], floorY: number, o: FrameOpts = {}): FramedWall {
  const f = wallFrame(w);
  const L = f.length;
  const W = spec.studW;
  const sp = o.spacing ?? spec.spacing;
  let S0 = 0;
  let S1 = L;
  for (const [c0, c1] of o.trims ?? []) {
    if (c0 <= 0.06) S0 = Math.max(S0, c1);
    else if (c1 >= L - 0.06) S1 = Math.min(S1, c0);
  }
  const base = w.baseY;
  const top = w.baseY + w.height;
  const steel = spec.method === 'steel';
  const soleH = !steel && o.sole ? spec.soleH : 0;
  // Steel studs sit inside the U-tracks; timber studs between the plates.
  const yA = steel ? base + 0.003 : base + soleH + spec.plateH;
  const yB = steel ? top - 0.003 : top - spec.plateH * spec.topPlates;
  const plateTop = steel ? base + spec.plateH : yA;

  const ros: RO[] = ops
    .filter((x) => x.wallId === w.id)
    .map((x) => ({
      s0: Math.max(S0, x.offset - x.width / 2),
      s1: Math.min(S1, x.offset + x.width / 2),
      yb: floorY + x.sill,
      yt: Math.min(floorY + x.head, yB),
      door: x.sill < 0.05,
    }))
    .filter((r) => r.s1 - r.s0 > 0.05)
    .sort((a, b) => a.s0 - b.s0);

  const fw: FramedWall = { wall: w, f, sec, floorY, S0, S1, panels: [], area: 0, post: o.post };
  fw.area = (S1 - S0) * (top - base) - ros.reduce((s, r) => s + (r.s1 - r.s0) * (r.yt - Math.max(base, r.door ? base : r.yb)), 0);

  // Full-width opening (a vitrine between two posts): only a beam + cripples + top plate.
  if (ros.length === 1 && ros[0].s0 <= S0 + 0.06 && ros[0].s1 >= S1 - 0.06) {
    const r = ros[0];
    const members: Member[] = [];
    const avail = yB - r.yt;
    const hd = Math.min(0.4, avail);
    if (hd > 0.05) members.push({ kind: 'beam', s0: S0, s1: S1, y0: r.yt, y1: r.yt + hd });
    if (yB - (r.yt + hd) > 0.06) for (const s of gridIn(S0, S0 + W, S1 - W, sp)) members.push({ kind: 'cripple', s0: s - W / 2, s1: s + W / 2, y0: r.yt + hd, y1: yB });
    pushTop(spec, members, S0, S1, top, steel);
    fw.panels.push(mkPanel(fw, S0, S1, members, [], [r], [], []));
    return fw;
  }

  // ---- panel breaks (never inside an opening zone)
  const zones = ros.map((r) => [r.s0 - 2 * W - 0.03, r.s1 + 2 * W + 0.03] as [number, number]);
  const inZone = (s: number) => zones.find(([a, b]) => s > a && s < b);
  const pmax = o.panelMax ?? spec.panelMax;
  const breaks = [S0];
  let cur = S0;
  for (let guard = 0; S1 - cur > pmax + 0.3 && guard < 40; guard++) {
    let b = cur + pmax;
    let z = inZone(b);
    while (z && z[0] - cur > 0.6) {
      b = z[0];
      z = inZone(b - 1e-6);
    }
    if (inZone(b) || b - cur < 0.6) {
      b = cur + pmax;
      z = inZone(b);
      while (z) {
        b = z[1];
        z = inZone(b + 1e-6);
      }
    }
    if (S1 - b < 0.6) break;
    breaks.push(b);
    cur = b;
  }
  breaks.push(S1);

  for (let pi = 0; pi < breaks.length - 1; pi++) {
    const p0 = breaks[pi];
    const p1 = breaks[pi + 1];
    const members: Member[] = [];
    const studs: Array<{ s: number; kind: MemberKind; y0: number; y1: number }> = [];
    const add = (s: number, kind: MemberKind, y0 = yA, y1 = yB) => {
      if (s < p0 + W / 2 - 1e-6 || s > p1 - W / 2 + 1e-6) return;
      if (studs.some((x) => Math.abs(x.s - s) < W * 0.98 && x.y0 < y1 && x.y1 > y0)) return;
      studs.push({ s, kind, y0, y1 });
    };
    const pros = ros.filter((r) => r.s1 > p0 && r.s0 < p1);
    add(p0 + W / 2, 'stud');
    add(p1 - W / 2, 'stud');
    for (const r of pros) {
      if (r.s0 > p0 + W) add(r.s0 - W / 2, 'jack', yA, r.yt);
      if (r.s1 < p1 - W) add(r.s1 + W / 2, 'jack', yA, r.yt);
      if (r.s0 > p0 + 2 * W) add(r.s0 - 1.5 * W, 'king');
      if (r.s1 < p1 - 2 * W) add(r.s1 + 1.5 * W, 'king');
    }
    for (const s of gridIn(S0, p0 + W, p1 - W, sp)) if (!pros.some((r) => s > r.s0 - 2.2 * W && s < r.s1 + 2.2 * W)) add(s, 'stud');
    for (const r of pros) {
      const span = r.s1 - r.s0;
      const hs0 = Math.max(p0, r.s0 - W);
      const hs1 = Math.min(p1, r.s1 + W);
      const avail = yB - r.yt;
      let hTop = r.yt;
      if (avail > 0.04) {
        const hd = Math.min(headerDepth(span), avail);
        members.push({ kind: 'header', s0: hs0, s1: hs1, y0: r.yt, y1: r.yt + hd });
        hTop = r.yt + hd;
      }
      const cr = gridIn(S0, r.s0 + W / 2, r.s1 - W / 2, sp);
      if (!cr.length && span > 0.7) cr.push((r.s0 + r.s1) / 2);
      if (yB - hTop > 0.06) for (const s of cr) members.push({ kind: 'cripple', s0: s - W / 2, s1: s + W / 2, y0: hTop, y1: yB });
      if (!r.door && r.yb - spec.plateH > yA + 0.06) {
        members.push({ kind: 'sill', s0: r.s0, s1: r.s1, y0: r.yb - spec.plateH, y1: r.yb });
        for (const s of cr) members.push({ kind: 'cripple', s0: s - W / 2, s1: s + W / 2, y0: yA, y1: r.yb - spec.plateH });
        studs.push(...cr.map((s) => ({ s, kind: 'cripple' as MemberKind, y0: yA, y1: r.yb - spec.plateH })));
      }
      studs.push(...cr.map((s) => ({ s, kind: 'cripple' as MemberKind, y0: hTop, y1: yB })));
    }
    for (const st of studs) if (st.kind !== 'cripple') members.push({ kind: st.kind, s0: st.s - W / 2, s1: st.s + W / 2, y0: st.y0, y1: st.y1 });

    // Bottom plates: cut at doors. Steel: the track is the anchored base; timber: sole plate (base) + panel plate.
    const doorCuts: Rect[] = pros.filter((r) => r.door).map((r) => ({ s0: r.s0, s1: r.s1, y0: -1e9, y1: 1e9 }));
    for (const r of subtractAll({ s0: p0, s1: p1, y0: 0, y1: 1 }, doorCuts)) {
      if (r.s1 - r.s0 < 0.03) continue;
      if (steel) members.push({ kind: 'base', s0: r.s0, s1: r.s1, y0: base, y1: plateTop });
      else {
        if (soleH) members.push({ kind: 'base', s0: r.s0, s1: r.s1, y0: base, y1: base + soleH });
        members.push({ kind: 'bottom', s0: r.s0, s1: r.s1, y0: base + soleH, y1: yA });
      }
    }
    pushTop(spec, members, p0, p1, top, steel);

    // Blocking between consecutive full-height studs (not across openings).
    const tall = studs.filter((x) => x.kind === 'stud' || x.kind === 'king').sort((a, b) => a.s - b.s);
    const rows = steel ? bridgingRows(yA, yB) : [(yA + yB) / 2];
    for (let i = 0; i < tall.length - 1; i++) {
      const a = tall[i].s;
      const b = tall[i + 1].s;
      const m = (a + b) / 2;
      if (b - a < W + 0.06 || pros.some((r) => m > r.s0 - W && m < r.s1 + W)) continue;
      rows.forEach((y) => {
        const dy = steel ? 0 : i % 2 ? 0.03 : -0.03;
        const h = steel ? 0.019 : spec.plateH;
        if (steel) members.push({ kind: 'block', s0: a, s1: b, y0: y + dy - h / 2, y1: y + dy + h / 2 });
        else members.push({ kind: 'block', s0: a + W / 2, s1: b - W / 2, y0: y + dy - h / 2, y1: y + dy + h / 2 });
      });
    }

    const straps: Panel['straps'] = [];
    if (o.straps && steel && !pros.length && p1 - p0 >= 1.0 && sec.e !== 0) {
      straps.push([[p0 + W, yA + 0.05], [p1 - W, yB - 0.05]], [[p1 - W, yA + 0.05], [p0 + W, yB - 0.05]]);
    }
    const holds: number[] = [];
    if (o.holds) {
      if (Math.abs(p0 - S0) < 1e-6) holds.push(p0 + W + 0.035);
      if (Math.abs(p1 - S1) < 1e-6) holds.push(p1 - W - 0.035);
      for (const r of pros) if (r.s1 - r.s0 >= 1.4) {
        if (r.s0 - 2 * W - 0.035 > p0 + 0.05) holds.push(r.s0 - 2 * W - 0.035);
        if (r.s1 + 2 * W + 0.035 < p1 - 0.05) holds.push(r.s1 + 2 * W + 0.035);
      }
    }
    fw.panels.push(mkPanel(fw, p0, p1, members, studs.map((x) => ({ s: x.s, y0: x.y0, y1: x.y1 })), pros, straps, holds));
  }
  return fw;
}

function pushTop(spec: FrameSpec, members: Member[], s0: number, s1: number, top: number, steel: boolean) {
  if (steel) members.push({ kind: 'top', s0, s1, y0: top - spec.plateH, y1: top });
  else for (let k = 0; k < spec.topPlates; k++) members.push({ kind: 'top', s0, s1, y0: top - spec.plateH * (k + 1), y1: top - spec.plateH * k });
}

/** Steel bridging channel heights: every ~1.2 m between the tracks. */
function bridgingRows(yA: number, yB: number): number[] {
  const n = Math.max(1, Math.floor((yB - yA) / 1.2));
  return Array.from({ length: n }, (_, i) => yA + ((i + 1) * (yB - yA)) / (n + 1));
}

/** Grid positions origin + k·sp strictly inside (lo, hi). */
function gridIn(origin: number, lo: number, hi: number, sp: number): number[] {
  const out: number[] = [];
  for (let k = Math.ceil((lo - origin) / sp + 1e-6); origin + k * sp < hi - 1e-6; k++) out.push(origin + k * sp);
  return out;
}

function mkPanel(fw: FramedWall, s0: number, s1: number, members: Member[], studs: Panel['studs'], ros: RO[], straps: Panel['straps'], holds: number[]): Panel {
  return { fw, s0, s1, members, studs, ros, straps, holds, center: wallPoint(fw.wall, (s0 + s1) / 2) };
}

// ---------------------------------------------------------------------------
// Column posts (stud packs) and wall sets
// ---------------------------------------------------------------------------

/** A column footprint as a pseudo wall along its long axis (framed as a stud pack). */
export function postWall(c: Column): Wall {
  const [sx, sz] = c.size;
  const along = sx >= sz;
  const L = Math.max(sx, sz);
  const a: Vec2 = along ? [c.center[0] - L / 2, c.center[1]] : [c.center[0], c.center[1] - L / 2];
  const b: Vec2 = along ? [c.center[0] + L / 2, c.center[1]] : [c.center[0], c.center[1] + L / 2];
  return { id: `post-${c.id}`, level: c.level, material: 'block', role: 'exterior', a, b, thickness: Math.min(sx, sz), baseY: c.baseY, height: c.height };
}

export function frameSet(ctx: BuildContext, spec: FrameSpec, walls: Wall[], kind: WallKind, outside: (p: Vec2) => boolean, o: Omit<FrameOpts, 'trims'> = {}): FramedWall[] {
  return walls.map((w, i) => {
    const sec = sectionOf(spec, w, kind, outside);
    const floorY = w.level === 'lower' ? ctx.lower.floorY : w.level === 'entrance' ? ctx.entrance.floorY : ctx.roof.floorY;
    return frameWall(spec, w, sec, ctx.house.openings, floorY, { ...o, trims: cornerCuts(w, walls.slice(0, i)) });
  });
}

export function framePosts(ctx: BuildContext, spec: FrameSpec, cols: Column[], outside: (p: Vec2) => boolean): FramedWall[] {
  return cols.map((c) => {
    const w = postWall(c);
    const L = Math.max(c.size[0], c.size[1]);
    const sp = L / Math.max(1, Math.round(L / 0.14));
    const sec = sectionOf(spec, w, 'ext', outside);
    return frameWall(spec, w, sec, [], ctx.entrance.floorY, { spacing: sp, panelMax: 99, sole: true, post: true });
  });
}

/** Panels of several walls grouped by angle around `center` (starting nearest `start`), `n` groups. */
export function groupPanels(fws: FramedWall[], n: number, center: Vec2, start: Vec2): Panel[][] {
  const panels = fws.flatMap((f) => f.panels);
  const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const ang = (p: Panel) => {
    let a = Math.atan2(p.center[1] - center[1], p.center[0] - center[0]) - a0;
    while (a < 0) a += Math.PI * 2;
    return a;
  };
  const sorted = [...panels].sort((a, b) => ang(a) - ang(b));
  const groups: Panel[][] = Array.from({ length: Math.min(n, sorted.length) }, () => []);
  sorted.forEach((p, i) => groups[Math.min(groups.length - 1, Math.floor((i * groups.length) / sorted.length))].push(p));
  return groups.filter((g) => g.length);
}

// ---------------------------------------------------------------------------
// World conversion
// ---------------------------------------------------------------------------

export const P3 = (w: Wall, s: number, n: number, y: number): Vec3 => {
  const p = wallPoint(w, s, n);
  return [p[0], y, p[1]];
};

export function memberBox(fw: FramedWall, m: { s0: number; s1: number; y0: number; y1: number }, n0: number, n1: number): Box {
  return { at: P3(fw.wall, (m.s0 + m.s1) / 2, (n0 + n1) / 2, (m.y0 + m.y1) / 2), size: [m.s1 - m.s0, m.y1 - m.y0, n1 - n0], rotY: fw.f.rotY };
}

/** Instanced profile shapes (unit sizes; scaled per instance). Local x = along the wall, z = across. */
export const PROFILE_D0 = 0.1;
const T = 0.004;
export function cStud(W: number): PrimitiveShape {
  const D = PROFILE_D0;
  const b = (size: Vec3, at: Vec3): PrimitiveShape => ({ kind: 'box', size, at });
  return {
    kind: 'merge',
    shapes: [
      b([T, 1, D], [-W / 2 + T / 2, 0.5, 0]),
      b([W, 1, T], [0, 0.5, D / 2 - T / 2]),
      b([W, 1, T], [0, 0.5, -D / 2 + T / 2]),
      b([T, 1, 0.013], [W / 2 - T / 2, 0.5, D / 2 - 0.0065]),
      b([T, 1, 0.013], [W / 2 - T / 2, 0.5, -D / 2 + 0.0065]),
    ],
  };
}
/** U-track, web at the bottom (`up` = flanges up) or at the top. */
export function uTrack(H: number, webBottom: boolean): PrimitiveShape {
  const D = PROFILE_D0;
  const b = (size: Vec3, at: Vec3): PrimitiveShape => ({ kind: 'box', size, at });
  return {
    kind: 'merge',
    shapes: [b([1, T, D], [0, webBottom ? T / 2 : H - T / 2, 0]), b([1, H, T], [0, H / 2, D / 2 - T / 2]), b([1, H, T], [0, H / 2, -D / 2 + T / 2])],
  };
}

/** Member buckets of a set of panels, in world space. */
export interface Buckets {
  /** Steel: C-studs (instances) / timber: everything in `boxes`. */
  studs: Inst[];
  baseTracks: Inst[];
  topTracks: Inst[];
  boxes: Box[];
  base: Box[];
  beams: Box[];
  straps: Rod[];
  /** Running meters per family (BOM). */
  m: { stud: number; plate: number; header: number; block: number; beam: number; strap: number; base: number };
  /** Timber volume (m³), steel weight (kg). */
  m3: number;
  kg: number;
}

export const emptyBuckets = (): Buckets => ({ studs: [], baseTracks: [], topTracks: [], boxes: [], base: [], beams: [], straps: [], m: { stud: 0, plate: 0, header: 0, block: 0, beam: 0, strap: 0, base: 0 }, m3: 0, kg: 0 });

export function emitPanel(spec: FrameSpec, p: Panel, b: Buckets, opts: { base: boolean; frame: boolean }) {
  const fw = p.fw;
  const [n0, n1] = fw.sec.stud;
  const D = n1 - n0;
  const nc = (n0 + n1) / 2;
  const steel = spec.method === 'steel';
  const ext = fw.sec.kind !== 'int' && !fw.post;
  const kgStud = ext ? STEEL_KG_M.studExt : STEEL_KG_M.studInt;
  const kgTrack = ext ? STEEL_KG_M.track : STEEL_KG_M.trackInt;
  for (const m of p.members) {
    const len = m.s1 - m.s0;
    const h = m.y1 - m.y0;
    const isBase = m.kind === 'base';
    if (isBase ? !opts.base : !opts.frame) continue;
    if (isBase) {
      b.m.base += len;
      if (steel) {
        b.baseTracks.push({ at: P3(fw.wall, (m.s0 + m.s1) / 2, nc, m.y0), rotY: fw.f.rotY, scale: [len, 1, D / PROFILE_D0] });
        b.kg += len * kgTrack;
      } else {
        b.base.push(memberBox(fw, m, n0, n1));
        b.m3 += len * h * D;
      }
      continue;
    }
    switch (m.kind) {
      case 'stud':
      case 'king':
      case 'jack':
      case 'cripple':
        b.m.stud += h;
        if (steel) {
          b.studs.push({ at: P3(fw.wall, (m.s0 + m.s1) / 2, nc, m.y0), rotY: fw.f.rotY, scale: [1, h, (D - 0.008) / PROFILE_D0] });
          b.kg += h * kgStud;
        } else {
          b.boxes.push(memberBox(fw, m, n0, n1));
          b.m3 += len * h * D;
        }
        break;
      case 'top':
      case 'sill':
      case 'bottom':
        b.m.plate += len;
        if (steel) {
          b.topTracks.push({ at: P3(fw.wall, (m.s0 + m.s1) / 2, nc, m.y0), rotY: fw.f.rotY, scale: [len, 1, D / PROFILE_D0] });
          b.kg += len * kgTrack;
        } else {
          b.boxes.push(memberBox(fw, m, n0, n1));
          b.m3 += len * h * D;
        }
        break;
      case 'header':
        b.m.header += len;
        b.boxes.push(memberBox(fw, m, n0 + 0.004, n1 - 0.004));
        if (steel) b.kg += len * STEEL_KG_M.header;
        else b.m3 += len * h * D;
        break;
      case 'beam':
        b.m.beam += len;
        b.beams.push(memberBox(fw, m, n0 + 0.01, n1 - 0.01));
        if (steel) b.kg += len * STEEL_KG_M.beam;
        else b.m3 += len * h * D;
        break;
      case 'block':
        b.m.block += len;
        if (steel) {
          b.boxes.push(memberBox(fw, m, nc - 0.019, nc + 0.019));
          b.kg += len * STEEL_KG_M.bridge;
        } else {
          b.boxes.push(memberBox(fw, m, n0, n1));
          b.m3 += len * h * D;
        }
        break;
    }
  }
  if (opts.frame && p.straps.length && fw.sec.e !== 0) {
    const ns = fw.sec.e > 0 ? n1 + 0.002 : n0 - 0.002;
    for (const [a, c] of p.straps) {
      b.straps.push({ a: P3(fw.wall, a[0], ns, a[1]), b: P3(fw.wall, c[0], ns, c[1]) });
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      b.m.strap += l;
      b.kg += l * STEEL_KG_M.strap;
    }
  }
}

/** Hold-downs (bracket + anchor) and anchor bolts every ~1 m along the base plates. */
export function anchorParts(p: Panel, holds: Box[], bolts: Rod[]) {
  const fw = p.fw;
  const [n0, n1] = fw.sec.stud;
  const nc = (n0 + n1) / 2;
  const base = fw.wall.baseY;
  for (const s of p.holds) {
    holds.push({ at: P3(fw.wall, s, nc, base + 0.2), size: [0.06, 0.34, Math.min(0.07, n1 - n0 - 0.01)], rotY: fw.f.rotY });
    bolts.push({ a: P3(fw.wall, s, nc, base - 0.02), b: P3(fw.wall, s, nc, base + 0.42) });
  }
  for (const m of p.members) {
    if (m.kind !== 'base') continue;
    const len = m.s1 - m.s0;
    const k = Math.max(1, Math.round(len / 1.0));
    for (let i = 0; i < k; i++) {
      const s = m.s0 + ((i + 0.5) * len) / k;
      bolts.push({ a: P3(fw.wall, s, nc, base - 0.01), b: P3(fw.wall, s, nc, base + 0.075) });
    }
  }
}

/** Temporary diagonal braces on the interior side of each panel (tag formwork). */
export function braceRods(p: Panel, floorAt: (p: Vec2) => number): { rods: Rod[]; feet: Box[] } {
  const fw = p.fw;
  const rods: Rod[] = [];
  const feet: Box[] = [];
  if (fw.sec.e === 0 || fw.post || p.s1 - p.s0 < 0.9) return { rods, feet };
  const inner = -fw.sec.e;
  const t = fw.wall.thickness;
  const s = (p.s0 + p.s1) / 2 + (p.ros.length ? 0 : 0.25);
  const sOk = p.ros.some((r) => s > r.s0 - 0.1 && s < r.s1 + 0.1) ? p.s0 + 0.35 : s;
  const top = P3(fw.wall, sOk, inner * (t / 2 + 0.03), fw.wall.baseY + 2.15);
  const footXZ = wallPoint(fw.wall, sOk, inner * (t / 2 + 1.65));
  const fy = floorAt(footXZ);
  rods.push({ a: [footXZ[0], fy + 0.04, footXZ[1]], b: top });
  feet.push({ at: [footXZ[0], fy + 0.025, footXZ[1]], size: [0.16, 0.05, 0.12], rotY: fw.f.rotY });
  return { rods, feet };
}

/** Group entry: the panels drop in together (shop panels lowered into place). */
export const groupAnim = (k: number, t0 = 0.2, dt = 0.55): Anim => ({ type: 'drop', from: [0, 1.3, 0], delay: t0 + k * dt, duration: 0.65, ease: 'out' });

/** Boards (OSB / cement board) covering rects: vertical sheets `bw` wide and `bh` high, alternating in two color groups. */
export function boardsOn(fw: FramedWall, rects: Rect[], n0: number, n1: number, bw: number, bh: number, gap = 0.003, origin = fw.S0): Box[][] {
  const out: Box[][] = [[], []];
  for (const r of rects) {
    for (let s = origin + Math.floor((r.s0 - origin) / bw) * bw; s < r.s1 - 1e-6; s += bw) {
      const a = Math.max(r.s0, s);
      const b = Math.min(r.s1, s + bw);
      if (b - a < 0.02) continue;
      let j = 0;
      for (let y = r.y0; y < r.y1 - 1e-6; y += bh, j++) {
        const y1 = Math.min(r.y1, y + bh);
        if (y1 - y < 0.02) continue;
        const k = Math.round((s - origin) / bw) + j;
        out[((k % 2) + 2) % 2].push(memberBox(fw, { s0: a + gap / 2, s1: b - gap / 2, y0: y + gap / 2, y1: y1 - gap / 2 }, n0, n1));
      }
    }
  }
  return out;
}
