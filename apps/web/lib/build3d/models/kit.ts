// Shared building kit for the procedural model library: material cache, geometry helpers and
// an accumulator that merges every primitive with the same material into one mesh.
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Euler,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];
export type Opts = { size?: [number, number, number]; seed?: number; color?: string };

/** Shared palette (SPEC §6 plus equipment colors). */
export const P = {
  yellow: '#F2B705',
  dark: '#3A3D42',
  tire: '#2B2D31',
  steel: '#B7BCC2',
  white: '#F4F2EE',
  plaster: '#F1EEE8',
  glass: '#9CC7E6@0.35',
  windowDark: '#2B3A47',
  wood: '#B98A55',
  woodLight: '#D2AE80',
  magenta: '#E61559',
  orange: '#F08A24',
  grass: '#7DB35A',
  block: '#A7A9AC',
  rust: '#6B4A3A',
  soil: '#C9A979',
  skin: '#E0AC8A',
};

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mats = new Map<string, MeshStandardMaterial>();
/**
 * One material per spec string. Spec = optional prefixes (`~` flat shading, `^` emissive,
 * `!` double sided) + hex color + optional `@opacity`.
 */
export function mat(spec: string): MeshStandardMaterial {
  const hit = mats.get(spec);
  if (hit) return hit;
  let s = spec;
  let flat = false;
  let emis = false;
  let dbl = false;
  for (;;) {
    if (s[0] === '~') flat = true;
    else if (s[0] === '^') emis = true;
    else if (s[0] === '!') dbl = true;
    else break;
    s = s.slice(1);
  }
  let opacity = 1;
  const at = s.indexOf('@');
  if (at > 0) {
    opacity = Number(s.slice(at + 1));
    s = s.slice(0, at);
  }
  const m = new MeshStandardMaterial({
    color: s,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: flat,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: dbl || opacity < 1 ? DoubleSide : FrontSide,
    emissive: emis ? s : '#000000',
    emissiveIntensity: emis ? 0.9 : 0,
  });
  mats.set(spec, m);
  return m;
}

/** Mix a hex color toward white (amt>0) or black (amt<0). */
export function shade(hex: string, amt: number): string {
  const c = new Color(hex);
  c.lerp(new Color(amt >= 0 ? '#ffffff' : '#000000'), Math.abs(amt));
  return `#${c.getHexString()}`;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _p = new Vector3();
const _s = new Vector3();

/** Transform a freshly created geometry in place (Euler order YXZ). */
export function xf(g: BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry {
  _e.set(r[0], r[1], r[2], 'YXZ');
  _q.setFromEuler(_e);
  _p.set(p[0], p[1], p[2]);
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Merges primitives per material; y arguments of *B helpers are the bottom of the shape. */
export class Acc {
  private groups = new Map<string, BufferGeometry[]>();

  add(g: BufferGeometry, c: string, p?: V3, r?: V3, s?: V3 | number): this {
    xf(g, p, r, s);
    const out = g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    for (const k of Object.keys(out.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
    }
    out.clearGroups();
    const list = this.groups.get(c);
    if (list) list.push(out);
    else this.groups.set(c, [out]);
    return this;
  }
  /** Box centered at p. */
  box(w: number, h: number, d: number, c: string, p?: V3, r?: V3): this {
    return this.add(new BoxGeometry(w, h, d), c, p, r);
  }
  /** Box standing on yb. */
  bx(w: number, h: number, d: number, c: string, x = 0, yb = 0, z = 0, ry = 0): this {
    return this.add(new BoxGeometry(w, h, d), c, [x, yb + h / 2, z], [0, ry, 0]);
  }
  /** Rounded box standing on yb. */
  rb(w: number, h: number, d: number, c: string, x = 0, yb = 0, z = 0, rad = 0.04, ry = 0, rz = 0): this {
    const rr = Math.min(rad, w / 2.2, h / 2.2, d / 2.2);
    return this.add(new RoundedBoxGeometry(w, h, d, 2, rr), c, [x, yb + h / 2, z], [0, ry, rz]);
  }
  /** Cylinder (axis Y) centered at p; rotate to change the axis. */
  cyl(rTop: number, rBot: number, h: number, c: string, p?: V3, r?: V3, seg = 14, s?: V3 | number): this {
    return this.add(new CylinderGeometry(rTop, rBot, h, seg), c, p, r, s);
  }
  cone(r: number, h: number, c: string, p?: V3, rot?: V3, seg = 8, s?: V3 | number): this {
    return this.add(new ConeGeometry(r, h, seg), c, p, rot, s);
  }
  sphere(r: number, c: string, p?: V3, s?: V3 | number, rot?: V3, seg = 12): this {
    return this.add(new SphereGeometry(r, seg, Math.max(6, seg >> 1)), c, p, rot, s);
  }
  ico(r: number, detail: number, c: string, p?: V3, s?: V3 | number, rot?: V3): this {
    return this.add(new IcosahedronGeometry(r, detail), c, p, rot, s);
  }
  /** Round rod between two points. */
  rod(a: V3, b: V3, r: number, c: string, seg = 6): this {
    const va = new Vector3(...a);
    const vb = new Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
    const e = new Euler().setFromQuaternion(q, 'YXZ');
    const mid = va.add(vb).multiplyScalar(0.5);
    return this.add(new CylinderGeometry(r, r, len, seg), c, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
  }
  /** Wheel with axle along Z. */
  wheel(x: number, y: number, z: number, r: number, w: number, hub = P.steel): this {
    this.cyl(r, r, w, P.tire, [x, y, z], [Math.PI / 2, 0, 0], 16);
    const side = z >= 0 ? 1 : -1;
    return this.cyl(r * 0.55, r * 0.55, 0.03, hub, [x, y, z + side * (w / 2 + 0.005)], [Math.PI / 2, 0, 0], 12);
  }

  build(): Group {
    const g = new Group();
    this.groups.forEach((list, c) => {
      const merged = mergeGeometries(list, false);
      if (!merged) return;
      for (const l of list) l.dispose();
      const m = new Mesh(merged, mat(c));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    });
    return g;
  }
}

/** Pivot group helper: place `inner` content in a group positioned at p. */
export function pivot(content: Group, p: V3): Group {
  const g = new Group();
  g.position.set(p[0], p[1], p[2]);
  g.add(content);
  return g;
}

/** Slightly displace the vertices of a (non-indexed) geometry, consistently per position. */
export function jitter(g: BufferGeometry, amt: number, r: () => number): void {
  const pos = g.getAttribute('position');
  const seen = new Map<string, V3>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let o = seen.get(k);
    if (!o) {
      o = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt];
      seen.set(k, o);
    }
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
  pos.needsUpdate = true;
}
