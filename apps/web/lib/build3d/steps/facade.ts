/**
 * Facade skins (phase 10): white "שליכט" render + Jerusalem stone that cover EVERY exterior
 * face of the shell — wall faces, columns, wall corners and the slab edge bands between the
 * floors — plus parapet copings and plastered window/door reveals.
 *
 * Method: per storey band, the exterior walls, columns and exterior slab edges are rasterized
 * (5 cm) into an "owner" map; the outdoor area is flood-filled from the border (only full-
 * height walls and columns block it, so terraces, porches and parapets read as outside).
 * Every owner cell edge that touches outdoor becomes part of a straight facade run, split by
 * owner. Each run gets the owner's height range (walls on the entrance floor reach down over
 * the slab edge below and up over the roof slab edge), minus its openings, and is extended
 * by the skin thickness at convex corners so corners close. Pure (no three.js).
 *
 * Limitations: axis-aligned facades come out exact; diagonal walls would be staircased.
 */
import { pointInPolygon, rng, wallFrame } from '../house/geometry';
import type { Column, Opening, Vec2, Wall } from '../house/types';
import type { BuildContext } from './context';
import { subtractAll, type BoxItem, type Rect } from './envelope-kit';

/** Raster cell (m). Wall faces of this house sit on 5 cm multiples. */
const RES = 0.05;
/** Skin thickness (render) and how much of it sinks into the wall. Outer face stays proud of interior paint skins. */
const RENDER_T = 0.032;
const STONE_T = 0.04;
const EMBED = 0.004;
const PLINTH = 0.9;

type Band = 'lower' | 'entrance' | 'roof';

interface Owner {
  kind: 'wall' | 'column' | 'slab';
  band: Band;
  y0: number;
  y1: number;
  wall?: Wall;
  /** Skin style: render only, or stone allowed (entrance storey). */
  stone: boolean;
  /** No skin at all (buried retaining walls). */
  skip?: boolean;
}

interface Run {
  /** 'x' runs lie along +X (face is z = const), 'z' runs along +Z (face is x = const). */
  axis: 'x' | 'z';
  /** Face coordinate (z for x-runs, x for z-runs) and outward sign along the other axis. */
  face: number;
  out: 1 | -1;
  u0: number;
  u1: number;
  owner: number;
  ext0: boolean;
  ext1: boolean;
}

export interface FacadeSkins {
  /** Render boxes per storey band. */
  render: Record<Band, BoxItem[]>;
  /** Stone cladding boxes, split in 3 color variants. */
  stone: BoxItem[][];
  /** Plastered window/door reveals (jambs + heads). */
  reveals: BoxItem[];
  /** Parapet copings. */
  caps: BoxItem[];
  renderArea: number;
  stoneArea: number;
}

/** Oriented rectangle → raster cells (center inside). */
function rasterRect(
  grid: { x0: number; z0: number; nx: number; nz: number },
  c: Vec2,
  dir: Vec2,
  halfL: number,
  halfT: number,
  set: (idx: number) => void,
) {
  const ex = Math.abs(dir[0]) * halfL + Math.abs(dir[1]) * halfT;
  const ez = Math.abs(dir[1]) * halfL + Math.abs(dir[0]) * halfT;
  const i0 = Math.max(0, Math.floor((c[0] - ex - grid.x0) / RES));
  const i1 = Math.min(grid.nx - 1, Math.ceil((c[0] + ex - grid.x0) / RES));
  const j0 = Math.max(0, Math.floor((c[1] - ez - grid.z0) / RES));
  const j1 = Math.min(grid.nz - 1, Math.ceil((c[1] + ez - grid.z0) / RES));
  for (let j = j0; j <= j1; j++) {
    const z = grid.z0 + (j + 0.5) * RES - c[1];
    for (let i = i0; i <= i1; i++) {
      const x = grid.x0 + (i + 0.5) * RES - c[0];
      const u = x * dir[0] + z * dir[1];
      const v = -x * dir[1] + z * dir[0];
      if (Math.abs(u) < halfL - 1e-6 && Math.abs(v) < halfT - 1e-6) set(j * grid.nx + i);
    }
  }
}

export function facadeSkins(ctx: BuildContext): FacadeSkins {
  const house = ctx.house;
  const fpAll = ctx.footprint.house;
  let bx0 = Infinity;
  let bz0 = Infinity;
  let bx1 = -Infinity;
  let bz1 = -Infinity;
  for (const p of [...fpAll, ...ctx.footprint.lower]) {
    bx0 = Math.min(bx0, p[0]);
    bz0 = Math.min(bz0, p[1]);
    bx1 = Math.max(bx1, p[0]);
    bz1 = Math.max(bz1, p[1]);
  }
  const x0 = Math.floor(bx0 / RES) * RES - 0.5;
  const z0 = Math.floor(bz0 / RES) * RES - 0.5;
  const nx = Math.ceil((bx1 + 0.5 - x0) / RES);
  const nz = Math.ceil((bz1 + 0.5 - z0) / RES);
  const grid = { x0, z0, nx, nz };
  const N = nx * nz;

  const away: Vec2 = [-ctx.lot.street.inward[0], -ctx.lot.street.inward[1]];
  const porch = house.rooms.find((r) => r.kind === 'entry')?.polygon;
  const floorOf = (b: Band) => (b === 'lower' ? ctx.lower.floorY : b === 'entrance' ? ctx.entrance.floorY : ctx.roof.floorY);
  const roofSlab = house.slabs.find((s) => s.role === 'roof');
  const roofTop = roofSlab?.topY ?? ctx.roof.floorY;
  const entSlabs = house.slabs.filter((s) => s.level === 'entrance');

  const out: FacadeSkins = { render: { lower: [], entrance: [], roof: [] }, stone: [[], [], []], reveals: [], caps: [], renderArea: 0, stoneArea: 0 };
  const rand = rng(4310);
  const stoneColorPick = () => Math.floor(rand() * 3);

  for (const band of ['lower', 'entrance', 'roof'] as const) {
    const owners: Owner[] = [];
    const owner = new Int16Array(N).fill(-1);
    const block = new Uint8Array(N);
    /** Owner cells (the per-cell passes below only visit these). */
    const cells: number[] = [];
    const own = (o: Owner) => {
      owners.push(o);
      const k = owners.length - 1;
      return (idx: number) => {
        if (owner[idx] < 0) {
          owner[idx] = k;
          cells.push(idx);
        }
      };
    };
    const walls = house.walls.filter((w) => w.level === band && (band === 'roof' ? w.role === 'parapet' : ['exterior', 'mamad', 'retaining', 'parapet'].includes(w.role)));
    for (const w of walls) {
      const f = wallFrame(w);
      const parapet = w.role === 'parapet';
      // Entrance storey: from the slab bottom below (covers the slab edge) to the roof slab top
      // when the roof sits on it. Lower storey: from below grade to the slab underside.
      let y0 = w.baseY;
      let y1 = w.baseY + w.height;
      if (band === 'lower') y0 = w.baseY - 0.25;
      if (band === 'entrance') {
        y0 = w.baseY - 0.25;
        if (!parapet && roofSlab && pointInPolygon(f.mid, roofSlab.outline)) y1 = roofTop;
      }
      const set = own({ kind: 'wall', band, y0, y1, wall: w, stone: band === 'entrance' && !parapet, skip: w.role === 'retaining' });
      rasterRect(grid, f.mid, f.dir, f.length / 2, w.thickness / 2, set);
      if (band !== 'roof' && !parapet)
        rasterRect(grid, f.mid, f.dir, f.length / 2 + 0.03, w.thickness / 2, (idx) => {
          block[idx] = 1;
        });
    }
    if (band !== 'roof') {
      for (const c of house.columns.filter((x: Column) => x.level === band)) {
        const r = c.rotation ?? 0;
        const dir: Vec2 = [Math.cos(r), -Math.sin(r)];
        const y0 = c.baseY - 0.25;
        const y1 = band === 'entrance' && roofSlab && pointInPolygon(c.center, roofSlab.outline) ? roofTop : c.baseY + c.height;
        const set = own({ kind: 'column', band, y0, y1, stone: band === 'entrance' });
        rasterRect(grid, c.center, dir, c.size[0] / 2, c.size[1] / 2, (idx) => {
          set(idx);
          block[idx] = 1;
        });
      }
    }
    if (band === 'entrance') {
      // Exposed slab edges (entrance slabs + roof slab): a 3 cm strip inside every outline edge
      // that faces open air (not another slab of the same level). Walls own those cells first.
      const slabEdges = (outline: Vec2[], y0: number, y1: number, others: Vec2[][]) => {
        for (let i = 0; i < outline.length; i++) {
          const a = outline[i];
          const b = outline[(i + 1) % outline.length];
          const f = wallFrame({ a, b });
          if (f.length < 0.05) continue;
          // Outward = the side whose probe is outside this outline.
          let n: Vec2 = [f.normal[0], f.normal[1]];
          if (pointInPolygon([f.mid[0] + n[0] * 0.05, f.mid[1] + n[1] * 0.05], outline)) n = [-n[0], -n[1]];
          const probe: Vec2 = [f.mid[0] + n[0] * 0.06, f.mid[1] + n[1] * 0.06];
          if (others.some((o) => pointInPolygon(probe, o))) continue;
          const set = own({ kind: 'slab', band, y0, y1, stone: true });
          rasterRect(grid, [f.mid[0] - n[0] * 0.015, f.mid[1] - n[1] * 0.015], f.dir, f.length / 2, 0.015, set);
        }
      };
      for (const s of entSlabs)
        slabEdges(
          s.outline,
          s.topY - s.thickness,
          s.topY,
          entSlabs.filter((o) => o !== s).map((o) => o.outline),
        );
      if (roofSlab) slabEdges(roofSlab.outline, roofSlab.topY - roofSlab.thickness, roofSlab.topY, []);
    }

    // Outdoor: flood from the border through non-blocking cells (roof: everything not a parapet).
    const outdoor = new Uint8Array(N);
    if (band === 'roof') {
      outdoor.fill(1);
      for (const k of cells) outdoor[k] = 0;
    } else {
      // Span flood fill (row segments) from every free border cell.
      const stack: number[] = [];
      const seed = (k: number) => {
        if (!outdoor[k] && !block[k]) stack.push(k);
      };
      for (let i = 0; i < nx; i++) {
        seed(i);
        seed((nz - 1) * nx + i);
      }
      for (let j = 0; j < nz; j++) {
        seed(j * nx);
        seed(j * nx + nx - 1);
      }
      while (stack.length) {
        const k = stack.pop() as number;
        if (outdoor[k] || block[k]) continue;
        const row = k - (k % nx);
        let l = k;
        while (l > row && !outdoor[l - 1] && !block[l - 1]) l--;
        let r = k;
        while (r < row + nx - 1 && !outdoor[r + 1] && !block[r + 1]) r++;
        let upOpen = false;
        let dnOpen = false;
        for (let c = l; c <= r; c++) {
          outdoor[c] = 1;
          if (c >= nx) {
            const u = c - nx;
            const free = !outdoor[u] && !block[u];
            if (free && !upOpen) stack.push(u);
            upOpen = free;
          }
          if (c + nx < N) {
            const d = c + nx;
            const free = !outdoor[d] && !block[d];
            if (free && !dnOpen) stack.push(d);
            dnOpen = free;
          }
        }
      }
    }
    // Open sides of every owner cell: bit 0 = -Z, 1 = +Z, 2 = -X, 3 = +X neighbour is outdoor.
    const open = new Uint8Array(N);
    const isOutK = (k: number) => outdoor[k] === 1 && owner[k] < 0;
    for (const k of cells) {
      const i = k % nx;
      const j = (k - i) / nx;
      let f = 0;
      if (j === 0 || isOutK(k - nx)) f |= 1;
      if (j === nz - 1 || isOutK(k + nx)) f |= 2;
      if (i === 0 || isOutK(k - 1)) f |= 4;
      if (i === nx - 1 || isOutK(k + 1)) f |= 8;
      open[k] = f;
    }

    // Runs: open owner-cell sides merged along the face (same owner), walked from each run start.
    const runs: Run[] = [];
    const ownAt = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? -1 : owner[j * nx + i]);
    const SIDES = [
      { bit: 1, axis: 'x' as const, out: -1 as const },
      { bit: 2, axis: 'x' as const, out: 1 as const },
      { bit: 4, axis: 'z' as const, out: -1 as const },
      { bit: 8, axis: 'z' as const, out: 1 as const },
    ];
    for (const k of cells) {
      const f = open[k];
      if (!f) continue;
      const o = owner[k];
      const i = k % nx;
      const j = (k - i) / nx;
      for (const sd of SIDES) {
        if (!(f & sd.bit)) continue;
        const step = sd.axis === 'x' ? 1 : nx;
        const a = sd.axis === 'x' ? i : j;
        const lenA = sd.axis === 'x' ? nx : nz;
        // Not a run start if the previous cell continues the same run.
        if (a > 0 && owner[k - step] === o && open[k - step] & sd.bit) continue;
        let a1 = a;
        while (a1 + 1 < lenA && owner[k + (a1 + 1 - a) * step] === o && open[k + (a1 + 1 - a) * step] & sd.bit) a1++;
        const b = sd.axis === 'x' ? j : i;
        const base = sd.axis === 'x' ? x0 : z0;
        const faceBase = sd.axis === 'x' ? z0 : x0;
        runs.push({
          axis: sd.axis,
          face: faceBase + (sd.out > 0 ? b + 1 : b) * RES,
          out: sd.out,
          u0: base + a * RES,
          u1: base + (a1 + 1) * RES,
          owner: o,
          // Convex end: the cell beyond the run end (same row) is empty → wrap the corner.
          ext0: (sd.axis === 'x' ? ownAt(a - 1, b) : ownAt(b, a - 1)) < 0,
          ext1: (sd.axis === 'x' ? ownAt(a1 + 1, b) : ownAt(b, a1 + 1)) < 0,
        });
      }
    }

    for (const run of runs) {
      const o = owners[run.owner];
      if (o.skip || run.u1 - run.u0 < 0.02) continue;
      const nrm: Vec2 = run.axis === 'x' ? [0, run.out] : [run.out, 0];
      const uMid = (run.u0 + run.u1) / 2;
      const mid: Vec2 = run.axis === 'x' ? [uMid, run.face] : [run.face, uMid];
      // Stone: full height on street-facing facades and in the entry porch; a plinth elsewhere.
      const facing = nrm[0] * away[0] + nrm[1] * away[1];
      const inPorch = !!porch && pointInPolygon([mid[0] + nrm[0] * 0.15, mid[1] + nrm[1] * 0.15], porch);
      // The plinth sits where the entrance floor stands on the ground; above an exposed lower
      // floor (garden side) the render runs through instead of a stone band mid-facade.
      const overLower = pointInPolygon([mid[0] - nrm[0] * 0.6, mid[1] - nrm[1] * 0.6], ctx.footprint.lower);
      const stoneTop = !o.stone ? -Infinity : facing > 0.5 || inPorch ? Infinity : overLower ? -Infinity : floorOf('entrance') + PLINTH;
      const T = (y: number) => (y < stoneTop ? STONE_T : RENDER_T);
      // Openings of the owning wall, projected onto the run axis.
      const holes: Rect[] = [];
      const ops: Opening[] = o.wall ? house.openings.filter((x) => x.wallId === o.wall?.id) : [];
      const wf = o.wall ? wallFrame(o.wall) : null;
      // Openings only cut the wall's long faces (runs parallel to it), never its end faces.
      const parallel = !!wf && Math.abs(run.axis === 'x' ? wf.dir[0] : wf.dir[1]) > 0.7;
      for (const op of parallel ? ops : []) {
        const w = o.wall as Wall;
        const f = wf as NonNullable<typeof wf>;
        const cu = run.axis === 'x' ? w.a[0] + f.dir[0] * op.offset : w.a[1] + f.dir[1] * op.offset;
        const fl = floorOf(band === 'roof' ? 'roof' : (w.level as Band));
        holes.push({ s0: cu - op.width / 2, s1: cu + op.width / 2, y0: fl + op.sill, y1: fl + op.head });
      }
      const ext = Math.max(RENDER_T, STONE_T) - EMBED;
      const full: Rect = { s0: run.u0 - (run.ext0 ? ext : 0), s1: run.u1 + (run.ext1 ? ext : 0), y0: o.y0, y1: o.y1 };
      // Split at the plinth line so stone and render meet on a clean course.
      const bands: Array<{ r: Rect; stone: boolean }> = [];
      if (stoneTop === Infinity) bands.push({ r: full, stone: true });
      else if (stoneTop === -Infinity || stoneTop <= full.y0) bands.push({ r: full, stone: false });
      else {
        bands.push({ r: { ...full, y1: Math.min(full.y1, stoneTop) }, stone: true });
        if (full.y1 > stoneTop) bands.push({ r: { ...full, y0: stoneTop }, stone: false });
      }
      for (const { r, stone } of bands) {
        const pieces = subtractAll(r, holes.filter((h) => h.s1 > r.s0 && h.s0 < r.s1 && h.y1 > r.y0 && h.y0 < r.y1));
        for (const p of pieces) {
          if (p.s1 - p.s0 < 0.01 || p.y1 - p.y0 < 0.01) continue;
          const t = stone ? STONE_T : RENDER_T;
          if (stone) {
            stoneCourses(run, p, t, out.stone, stoneColorPick, rand);
            out.stoneArea += (p.s1 - p.s0) * (p.y1 - p.y0);
          } else {
            out.render[band].push(skinBox(run, p, t));
            out.renderArea += (p.s1 - p.s0) * (p.y1 - p.y0);
          }
        }
      }
      // Reveals: plaster returns on the jambs and head of every opening on this run.
      if (o.wall && parallel) {
        const w = o.wall;
        for (const h of holes) {
          if (h.s1 <= run.u0 + 0.01 || h.s0 >= run.u1 - 0.01) continue;
          const depth = w.thickness + T(h.y0);
          const inward = depth / 2 - T(h.y0);
          const along = (u: number): Vec2 => (run.axis === 'x' ? [u, run.face - run.out * inward] : [run.face - run.out * inward, u]);
          const rotY = run.axis === 'x' ? 0 : -Math.PI / 2;
          const jh = h.y1 - h.y0;
          for (const u of [h.s0 + 0.01, h.s1 - 0.01]) {
            if (u < run.u0 - 0.02 || u > run.u1 + 0.02) continue;
            const c = along(u);
            out.reveals.push({ at: [c[0], (h.y0 + h.y1) / 2, c[1]], size: [0.02, jh, depth], rotY });
          }
          const hc = along((h.s0 + h.s1) / 2);
          if (h.y1 < o.y1 - 0.02) out.reveals.push({ at: [hc[0], h.y1 - 0.01, hc[1]], size: [h.s1 - h.s0, 0.02, depth], rotY });
        }
      }
    }

    // Parapet copings.
    for (const w of walls.filter((x) => x.role === 'parapet')) {
      const f = wallFrame(w);
      const top = w.baseY + w.height;
      out.caps.push({ at: [f.mid[0], top + 0.02, f.mid[1]], size: [f.length + 0.06, 0.04, w.thickness + 2 * RENDER_T + 0.02], rotY: f.rotY });
    }
  }
  return out;
}

function skinBox(run: Run, p: Rect, t: number): BoxItem {
  const off = run.out * (t / 2 - EMBED);
  const u = (p.s0 + p.s1) / 2;
  const at: [number, number, number] = run.axis === 'x' ? [u, (p.y0 + p.y1) / 2, run.face + off] : [run.face + off, (p.y0 + p.y1) / 2, u];
  return { at, size: [p.s1 - p.s0, p.y1 - p.y0, t], rotY: run.axis === 'x' ? 0 : -Math.PI / 2 };
}

/** Coursed Jerusalem stone (12–24 cm courses on a global grid, 25–55 cm stones, 8 mm joints). */
const COURSES = [0.2, 0.14, 0.24, 0.17, 0.2, 0.14];
function stoneCourses(run: Run, p: Rect, t: number, groups: BoxItem[][], pick: () => number, rand: () => number) {
  const joint = 0.008;
  // Global course lines from -0.4 m so courses line up around corners; slivers merge up.
  const lines: number[] = [];
  for (let y = -0.4, k = 0; y < p.y1 + 0.3; y += COURSES[k++ % COURSES.length]) lines.push(y);
  const rows: Array<[number, number]> = [];
  let prev = p.y0;
  for (const l of lines) {
    if (l <= prev + 0.05) continue;
    if (l >= p.y1 - 0.05) break;
    rows.push([prev, l]);
    prev = l;
  }
  rows.push([prev, p.y1]);
  rows.forEach(([a, b], ri) => {
    let s = p.s0 - (ri % 2 ? rand() * 0.2 : 0);
    while (s < p.s1 - 0.01) {
      const len = 0.25 + rand() * 0.3;
      const s0 = Math.max(p.s0, s);
      let s1 = Math.min(p.s1, s + len);
      if (p.s1 - s1 < 0.12) s1 = p.s1;
      if (s1 - s0 > 0.02) {
        const box = skinBox(run, { s0, s1: s1 - (s1 < p.s1 ? joint : 0), y0: a, y1: b - (b < p.y1 ? joint : 0) }, t);
        groups[pick()].push(box);
      }
      s = s1;
    }
  });
}
