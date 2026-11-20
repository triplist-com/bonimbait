import { BufferGeometry, ConeGeometry, Group, IcosahedronGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Acc, jitter, rng, xf, type Opts } from './kit';

const GREENS = ['#6FA34C', '#7DB35A', '#5E9444', '#88B85E'];

export function tree(o: Opts): Group {
  const r = rng(o.seed ?? 1);
  const h = 4.6 + r() * 1.8;
  const a = new Acc();
  const th = h * 0.42;
  a.cyl(0.11, 0.2, th, '#8A6240', [0, th / 2, 0], [0, 0, 0], 7);
  const g1 = o.color ?? GREENS[Math.floor(r() * GREENS.length)];
  const g2 = GREENS[Math.floor(r() * GREENS.length)];
  const R = h * 0.27;
  a.ico(R, 1, '~' + g1, [0, th + R * 0.9, 0], [1, 1.1, 1], [0, r() * 3, 0]);
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + r();
    const rr = R * (0.45 + r() * 0.2);
    a.ico(R * (0.55 + r() * 0.15), 1, '~' + (i % 2 ? g2 : g1), [Math.cos(ang) * rr, th + R * (0.55 + r() * 0.7), Math.sin(ang) * rr], 1, [r() * 3, r() * 3, 0]);
  }
  return a.build();
}

export function treeOlive(o: Opts): Group {
  const r = rng(o.seed ?? 1);
  const a = new Acc();
  const lean = 0.18 + r() * 0.12;
  a.cyl(0.14, 0.24, 1.5, '#7C6A55', [0, 0.7, 0], [0, 0, lean], 7);
  a.cyl(0.1, 0.16, 1.4, '#7C6A55', [0.15, 1.5, 0.05], [0.1, 0, -lean * 1.3], 7);
  a.cyl(0.07, 0.1, 1.2, '#8A7860', [-0.25, 1.6, -0.05], [0, 0, 0.5], 6);
  const c1 = o.color ?? '#9CAF88';
  const blobs: [number, number, number, number][] = [
    [0.1, 2.9, 0, 1.3], [-0.9, 2.6, 0.3, 0.95], [1.0, 2.5, -0.2, 1.0], [0.1, 2.5, 0.9, 0.85], [-0.2, 2.6, -0.9, 0.9], [0.3, 3.4, -0.1, 0.8],
  ];
  blobs.forEach(([x, y, z, s], i) => a.ico(0.7 * s, 1, '~' + (i % 2 ? '#8AA07A' : c1), [x, y, z], [1.15, 0.65, 1.15], [0, r() * 3, 0]));
  return a.build();
}

function frondGeo(len: number): BufferGeometry {
  const l1 = len * 0.5;
  const c1 = xf(new ConeGeometry(0.42, l1, 4), [0, l1 / 2, 0], [0, 0, 0], [0.16, 1, 1]);
  xf(c1, [0, 0, 0], [0, 0, -0.85]);
  const e1: [number, number] = [Math.sin(0.85) * l1, Math.cos(0.85) * l1];
  const c2 = xf(new ConeGeometry(0.36, l1 * 1.1, 4), [0, (l1 * 1.1) / 2, 0], [0, 0, 0], [0.16, 1, 1]);
  xf(c2, [e1[0], e1[1], 0], [0, 0, -1.9]);
  const m = mergeGeometries([c1.index ? c1.toNonIndexed() : c1, c2.index ? c2.toNonIndexed() : c2], false);
  return m ?? c1;
}

export function palm(o: Opts): Group {
  const r = rng(o.seed ?? 1);
  const a = new Acc();
  const n = 7;
  const segH = 0.85;
  const bend = 0.5 + r() * 0.5;
  let top: [number, number] = [0, 0];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const x0 = bend * t0 * t0 * 2;
    const t1 = (i + 1) / n;
    const x1 = bend * t1 * t1 * 2;
    const ang = Math.atan2(x1 - x0, segH);
    const y = i * segH;
    a.cyl(0.17 - i * 0.008, 0.2 - i * 0.008, segH * 1.04, i % 2 ? '#B79B6E' : '#A38A60', [(x0 + x1) / 2, y + segH / 2, 0], [0, 0, -ang], 8);
    top = [x1, y + segH];
  }
  const col = o.color ?? '#5E9444';
  for (let i = 0; i < 12; i++) {
    const yaw = (i / 12) * Math.PI * 2 + r() * 0.2;
    a.add(frondGeo(2.4 + r() * 0.6), '~' + (i % 2 ? col : '#4F8A3D'), [top[0], top[1], 0], [0, yaw, 0]);
  }
  for (let i = 0; i < 3; i++) a.sphere(0.13, '#7A5230', [top[0] + Math.cos(i * 2.1) * 0.2, top[1] - 0.15, Math.sin(i * 2.1) * 0.2], 1, undefined, 8);
  return a.build();
}

export function bush(o: Opts): Group {
  const r = rng(o.seed ?? 1);
  const a = new Acc();
  const c = o.color ?? '#6E9F4A';
  const spots: [number, number, number, number][] = [[0, 0.5, 0, 0.55], [0.5, 0.38, 0.15, 0.4], [-0.45, 0.4, -0.1, 0.42], [0.1, 0.35, -0.5, 0.36]];
  spots.forEach(([x, y, z, s], i) => a.ico(s, 1, '~' + (i % 2 ? '#7DB35A' : c), [x, y, z], [1, 0.85, 1], [r() * 3, r() * 3, 0]));
  if (r() > 0.45) for (let i = 0; i < 5; i++) a.sphere(0.05, '#E61559', [(r() - 0.5) * 1.0, 0.45 + r() * 0.5, (r() - 0.5) * 0.9], 1, undefined, 6);
  return a.build();
}

export function rock(o: Opts): Group {
  const r = rng(o.seed ?? 1);
  const a = new Acc();
  const make = (rad: number, x: number, z: number, c: string): void => {
    const g = new IcosahedronGeometry(rad, 1);
    jitter(g, rad * 0.45, r);
    g.scale(1.25, 0.7, 1);
    g.computeBoundingBox();
    const minY = g.boundingBox ? g.boundingBox.min.y : 0;
    a.add(g, '~' + c, [x, -minY * 0.85, z], [0, r() * 6, 0]);
  };
  make(0.55, 0, 0, o.color ?? '#A8A39A');
  make(0.3, 0.7, 0.25, '#9B968D');
  make(0.2, -0.55, 0.45, '#B2ADA3');
  return a.build();
}
