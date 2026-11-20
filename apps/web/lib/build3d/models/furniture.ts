import { Group, LatheGeometry, Vector2 } from 'three';
import { Acc, P, shade, type Opts } from './kit';

const LEG = '#5A4634';

export function sofa(o: Opts): Group {
  const c = o.color ?? '#8DA2B0';
  const c2 = shade(c, 0.18);
  const a = new Acc();
  for (const x of [-0.38, 0.38]) for (const z of [-0.95, 0.95]) a.cyl(0.03, 0.025, 0.12, LEG, [x, 0.06, z]);
  a.rb(0.95, 0.3, 2.1, c, 0, 0.12, 0, 0.06);
  a.rb(0.26, 0.58, 2.1, c, -0.345, 0.42, 0, 0.08);
  for (const z of [-0.94, 0.94]) a.rb(0.95, 0.27, 0.22, c, 0, 0.42, z, 0.07);
  for (const z of [-0.45, 0.45]) {
    a.rb(0.68, 0.15, 0.87, c2, 0.13, 0.42, z, 0.06);
    a.rb(0.2, 0.42, 0.85, c2, -0.15, 0.56, z, 0.07, 0, -0.14);
  }
  a.rb(0.12, 0.36, 0.36, '#E8C27A', -0.08, 0.6, 0.62, 0.05, 0, -0.2);
  return a.build();
}

export function armchair(o: Opts): Group {
  const c = o.color ?? '#C9A27A';
  const a = new Acc();
  for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3]) a.cyl(0.03, 0.025, 0.14, LEG, [x, 0.07, z]);
  a.rb(0.85, 0.28, 0.85, c, 0, 0.14, 0, 0.06);
  a.rb(0.22, 0.56, 0.85, c, -0.315, 0.4, 0, 0.07, 0, -0.1);
  for (const z of [-0.36, 0.36]) a.rb(0.85, 0.25, 0.14, c, 0, 0.4, z, 0.06);
  a.rb(0.6, 0.13, 0.58, shade(c, 0.2), 0.08, 0.42, 0, 0.05);
  return a.build();
}

export function coffeeTable(o: Opts): Group {
  const a = new Acc();
  a.rb(0.6, 0.05, 1.1, o.color ?? '#C9A27A', 0, 0.34, 0, 0.02);
  a.rb(0.5, 0.03, 0.95, '#9C7A55', 0, 0.12, 0, 0.01);
  for (const x of [-0.25, 0.25]) for (const z of [-0.5, 0.5]) a.cyl(0.025, 0.02, 0.36, '#3A3D42', [x, 0.18, z], undefined, 8);
  a.rb(0.2, 0.14, 0.25, P.white, 0.05, 0.16, 0.1, 0.02);
  a.cyl(0.07, 0.05, 0.1, '#6FA34C', [0, 0.44, -0.3], undefined, 8);
  return a.build();
}

function bed(o: Opts, len: number, wid: number, double: boolean): Group {
  const a = new Acc();
  const blanket = o.color ?? (double ? '#8DA2B0' : '#E8C27A');
  a.rb(len, 0.24, wid, P.wood, 0, 0.06, 0, 0.03);
  a.rb(len - 0.1, 0.22, wid - 0.1, P.white, 0.02, 0.28, 0, 0.07);
  a.rb(len * 0.62, 0.05, wid - 0.07, blanket, 0.32, 0.47, 0, 0.025);
  a.rb(0.1, 0.95, wid + 0.08, '#9C7A55', -len / 2 + 0.03, 0.05, 0, 0.03);
  const pz = double ? [-wid * 0.25, wid * 0.25] : [0];
  for (const z of pz) a.rb(0.34, 0.13, double ? 0.55 : 0.5, P.white, -len / 2 + 0.32, 0.49, z, 0.05, 0, 0.08);
  for (const x of [-1, 1]) for (const z of [-1, 1]) a.bx(0.07, 0.06, 0.07, '#5A4634', x * (len / 2 - 0.06), 0, z * (wid / 2 - 0.06));
  return a.build();
}
export const bedDouble = (o: Opts): Group => bed(o, 2.1, 1.6, true);
export const bedSingle = (o: Opts): Group => bed(o, 2.0, 0.9, false);

/** Chair whose back is at local +x; rotate by `ry` to face the table. */
function chair(a: Acc, x: number, z: number, ry: number, seat: string, frame: string): void {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  // rotate offsets (ox, oz) by ry about the chair center
  const at = (ox: number, oz: number): [number, number] => [x + ox * cs + oz * sn, z - ox * sn + oz * cs];
  const [sx, sz] = at(0, 0);
  a.rb(0.42, 0.05, 0.42, seat, sx, 0.43, sz, 0.02, ry);
  const [bx2, bz2] = at(0.2, 0);
  a.rb(0.05, 0.45, 0.42, seat, bx2, 0.48, bz2, 0.02, ry);
  for (const ox of [-0.18, 0.18]) for (const oz of [-0.18, 0.18]) {
    const [lx, lz] = at(ox, oz);
    a.bx(0.04, 0.43, 0.04, frame, lx, 0, lz);
  }
}

export function diningSet(o: Opts): Group {
  const a = new Acc();
  const wood = o.color ?? '#C9A27A';
  a.rb(0.9, 0.05, 1.8, wood, 0, 0.72, 0, 0.02);
  for (const x of [-0.38, 0.38]) for (const z of [-0.8, 0.8]) a.bx(0.07, 0.72, 0.07, '#9C7A55', x, 0, z);
  for (const z of [-0.6, 0, 0.6]) {
    chair(a, 0.65, z, 0, '#D9D4CC', '#9C7A55');
    chair(a, -0.65, z, Math.PI, '#D9D4CC', '#9C7A55');
  }
  a.cyl(0.08, 0.06, 0.2, '#F4F2EE', [0, 0.85, 0], undefined, 10);
  return a.build();
}

export function kitchenIsland(o: Opts): Group {
  const a = new Acc();
  a.bx(0.9, 0.04, 2.2, '#3A3D42', 0, 0, 0);
  a.rb(0.88, 0.82, 2.18, o.color ?? P.plaster, 0, 0.04, 0, 0.02);
  a.bx(1.0, 0.04, 2.3, '#E3D3B4', 0, 0.86, 0);
  for (const z of [-0.73, 0, 0.73]) a.bx(0.02, 0.5, 0.5, '#3A3D42', 0.45, 0.2, z * 0.98 + (z === 0 ? 0 : 0));
  for (const z of [-0.37, 0.37, 1.1, -1.1]) a.bx(0.012, 0.78, 0.012, '#B7BCC2', 0.445, 0.06, z);
  for (const z of [-0.6, 0.6]) {
    a.cyl(0.19, 0.19, 0.05, '#C9A27A', [0.78, 0.68, z], undefined, 12);
    a.cyl(0.025, 0.025, 0.66, '#3A3D42', [0.78, 0.33, z], undefined, 6);
    a.cyl(0.17, 0.17, 0.02, '#3A3D42', [0.78, 0.01, z], undefined, 10);
  }
  return a.build();
}

export function kitchenCounter(o: Opts): Group {
  const a = new Acc();
  a.bx(0.58, 0.1, 2.4, '#3A3D42', 0.01, 0, 0);
  a.rb(0.6, 0.76, 2.4, o.color ?? P.plaster, 0, 0.1, 0, 0.015);
  a.bx(0.64, 0.04, 2.4, '#4A4D52', 0.01, 0.86, 0);
  a.bx(0.4, 0.01, 0.5, P.steel, 0.02, 0.9, -0.65);
  a.cyl(0.015, 0.015, 0.24, P.steel, [-0.2, 1.02, -0.65], undefined, 6);
  a.bx(0.012, 0.012, 0.16, P.steel, -0.12, 1.14, -0.65);
  a.bx(0.5, 0.01, 0.55, '#16181B', 0.02, 0.9, 0.6);
  for (const dx of [-0.1, 0.1]) for (const dz of [-0.12, 0.12]) a.cyl(0.07, 0.07, 0.012, '#5B5F66', [0.02 + dx, 0.912, 0.6 + dz], undefined, 12);
  a.rb(0.34, 0.72, 2.4, o.color ?? P.plaster, -0.13, 1.3, 0, 0.015);
  for (const z of [-0.6, 0, 0.6, 1.2, -1.2]) a.bx(0.012, 1.3, 0.012, '#B7BCC2', 0.045, 0.06 + (Math.abs(z) > 1.1 ? 0 : 0), z * 0.98).bx(0.01, 0.01, 0.01, '#B7BCC2');
  for (const z of [-0.9, 0.3]) a.bx(0.02, 0.02, 0.2, '#3A3D42', 0.31, 0.7, z);
  return a.build();
}

export function toilet(o: Opts): Group {
  const w = o.color ?? '#F7F6F3';
  const a = new Acc();
  a.cyl(0.11, 0.13, 0.26, w, [0.06, 0.13, 0], undefined, 10, [1.4, 1, 1]);
  a.cyl(0.2, 0.12, 0.2, w, [0.1, 0.36, 0], undefined, 16, [1.45, 1, 1.0]);
  a.cyl(0.215, 0.215, 0.035, '#E8E6E1', [0.1, 0.475, 0], undefined, 16, [1.45, 1, 1.0]);
  a.cyl(0.15, 0.15, 0.02, '#D3E4EE', [0.12, 0.45, 0], undefined, 14, [1.35, 1, 0.95]);
  a.rb(0.2, 0.4, 0.4, w, -0.27, 0.35, 0, 0.04);
  a.cyl(0.03, 0.03, 0.02, P.steel, [-0.27, 0.77, 0], undefined, 8);
  a.rb(0.22, 0.03, 0.42, '#E8E6E1', -0.27, 0.75, 0, 0.012);
  return a.build();
}

export function sink(o: Opts): Group {
  const a = new Acc();
  a.rb(0.5, 0.62, 0.6, o.color ?? '#B88C60', 0, 0.12, 0, 0.015);
  a.bx(0.42, 0.12, 0.5, '#3A3D42', 0, 0, 0);
  a.rb(0.52, 0.05, 0.62, P.white, 0, 0.74, 0, 0.015);
  a.cyl(0.19, 0.15, 0.03, '#E8E6E1', [0.01, 0.8, 0], undefined, 16, [1.1, 1, 1.25]);
  a.cyl(0.015, 0.015, 0.16, P.steel, [-0.15, 0.87, 0], undefined, 6);
  a.bx(0.12, 0.014, 0.014, P.steel, -0.09, 0.94, 0);
  a.bx(0.015, 0.7, 0.5, '#CFE3EE', -0.255, 1.1, 0);
  a.bx(0.012, 0.74, 0.54, P.steel, -0.262, 1.08, 0);
  for (const z of [-0.12, 0.12]) a.bx(0.02, 0.02, 0.1, P.steel, 0.255, 0.55, z);
  return a.build();
}

export function shower(): Group {
  const a = new Acc();
  a.bx(0.9, 0.07, 0.9, P.white, 0, 0, 0);
  a.cyl(0.05, 0.05, 0.01, P.steel, [0, 0.075, 0], undefined, 8);
  a.bx(0.02, 2.0, 0.9, P.glass, 0.44, 0.07, 0);
  a.bx(0.9, 2.0, 0.02, P.glass, 0, 0.07, 0.44);
  for (const [x, z] of [[0.44, 0.44], [0.44, -0.44], [-0.44, 0.44]]) a.bx(0.035, 2.05, 0.035, '#3A3D42', x, 0.05, z);
  a.bx(0.9, 0.035, 0.035, '#3A3D42', 0, 2.07, 0.44);
  a.bx(0.035, 0.035, 0.9, '#3A3D42', 0.44, 2.07, 0);
  a.bx(0.03, 1.2, 0.03, P.steel, -0.43, 0.9, -0.2);
  a.bx(0.25, 0.02, 0.02, P.steel, -0.31, 2.0, -0.2);
  a.cyl(0.1, 0.1, 0.02, P.steel, [-0.2, 1.98, -0.2], undefined, 12);
  a.cyl(0.03, 0.03, 0.05, '#3A3D42', [-0.42, 1.1, 0.1], [0, 0, Math.PI / 2], 8);
  return a.build();
}

export function bathtub(o: Opts): Group {
  const w = o.color ?? '#F7F6F3';
  const a = new Acc();
  a.rb(1.7, 0.2, 0.75, w, 0, 0, 0, 0.05);
  for (const z of [-0.335, 0.335]) a.rb(1.7, 0.55, 0.08, w, 0, 0, z, 0.03);
  for (const x of [-0.81, 0.81]) a.rb(0.08, 0.55, 0.75, w, x, 0, 0, 0.03);
  a.bx(1.54, 0.01, 0.58, '#D3E4EE', 0, 0.2, 0);
  a.cyl(0.015, 0.015, 0.18, P.steel, [-0.8, 0.62, 0], undefined, 6);
  a.bx(0.012, 0.012, 0.14, P.steel, -0.74, 0.7, 0);
  return a.build();
}

export function wardrobe(o: Opts): Group {
  const a = new Acc();
  const c = o.color ?? '#E8E1D6';
  a.bx(0.58, 0.08, 1.74, '#3A3D42', -0.01, 0, 0);
  a.rb(0.6, 2.12, 1.8, c, 0, 0.08, 0, 0.015);
  for (const z of [-0.45, 0, 0.45]) a.bx(0.012, 2.0, 0.012, '#9C9588', 0.302, 0.14, z);
  for (const z of [-0.06, 0.06, -0.51, 0.51]) a.bx(0.02, 0.4, 0.02, '#3A3D42', 0.31, 1.0, z * 1.0 + (Math.abs(z) > 0.3 ? 0 : 0));
  return a.build();
}

export function tv(): Group {
  const a = new Acc();
  a.rb(0.4, 0.45, 1.6, '#B88C60', 0, 0, 0, 0.02);
  a.bx(0.012, 0.28, 0.5, '#8A6240', 0.203, 0.08, -0.4);
  a.bx(0.012, 0.28, 0.5, '#8A6240', 0.203, 0.08, 0.4);
  a.bx(0.05, 0.05, 0.25, '#1E2125', 0, 0.45, 0);
  a.rb(0.04, 0.78, 1.35, '#1E2125', 0, 0.5, 0, 0.012);
  a.bx(0.01, 0.72, 1.29, '#3A4A5C', 0.022, 0.53, 0);
  a.bx(0.012, 0.3, 0.5, '#566B82', 0.028, 0.6, -0.25);
  return a.build();
}

function officeChair(a: Acc, x: number, z: number): void {
  a.cyl(0.25, 0.25, 0.03, '#3A3D42', [x, 0.04, z], undefined, 5);
  a.cyl(0.025, 0.025, 0.4, '#3A3D42', [x, 0.25, z], undefined, 6);
  a.rb(0.46, 0.07, 0.46, '#3F7BD9', x, 0.44, z, 0.03);
  a.rb(0.07, 0.5, 0.44, '#3F7BD9', x + 0.22, 0.5, z, 0.03);
}

export function desk(o: Opts): Group {
  const a = new Acc();
  a.rb(0.7, 0.04, 1.4, o.color ?? '#C9A27A', 0, 0.72, 0, 0.015);
  for (const z of [-0.65, 0.65]) a.bx(0.6, 0.72, 0.04, '#3A3D42', 0, 0, z);
  a.bx(0.4, 0.5, 0.04, '#9C7A55', -0.05, 0.1, 0.45);
  a.rb(0.03, 0.34, 0.58, '#1E2125', -0.1, 0.9, 0, 0.01);
  a.bx(0.012, 0.3, 0.54, '#3A4A5C', -0.085, 0.92, 0);
  a.bx(0.1, 0.18, 0.04, '#1E2125', -0.1, 0.76, 0);
  a.rb(0.2, 0.015, 0.4, '#E8E6E1', 0.12, 0.76, 0.1, 0.005);
  officeChair(a, 0.72, 0);
  return a.build();
}

export function outdoorTable(o: Opts): Group {
  const a = new Acc();
  a.rb(0.9, 0.05, 1.6, o.color ?? '#C9A27A', 0, 0.72, 0, 0.015);
  for (const x of [-0.38, 0.38]) for (const z of [-0.7, 0.7]) a.bx(0.05, 0.72, 0.05, '#3A3D42', x, 0, z);
  for (const z of [-0.45, 0.45]) {
    chair(a, 0.62, z, 0, '#C9A27A', '#3A3D42');
    chair(a, -0.62, z, Math.PI, '#C9A27A', '#3A3D42');
  }
  return a.build();
}

export function loungeChair(o: Opts): Group {
  const a = new Acc();
  const th = 0.9;
  const hx = -0.2;
  const hy = 0.34;
  a.rb(0.8, 0.05, 0.62, '#3A3D42', 0.2, hy - 0.03, 0, 0.015);
  a.rb(0.55, 0.05, 0.62, '#3A3D42', 0.8, hy - 0.08, 0, 0.015, 0, -0.2);
  a.rb(0.9, 0.05, 0.62, '#3A3D42', hx - 0.45 * Math.cos(th), hy + 0.45 * Math.sin(th) - 0.03, 0, 0.015, 0, -th);
  const c = o.color ?? P.white;
  a.rb(0.78, 0.07, 0.56, c, 0.2, hy + 0.02, 0, 0.03);
  a.rb(0.9, 0.07, 0.56, c, hx - 0.45 * Math.cos(th) - 0.03 * Math.sin(th), hy + 0.45 * Math.sin(th) + 0.02, 0, 0.03, 0, -th);
  for (const z of [-0.27, 0.27]) {
    a.bx(0.04, 0.32, 0.04, '#3A3D42', 0.55, 0, z);
    a.bx(0.04, 0.3, 0.04, '#3A3D42', -0.2, 0, z);
    a.rod([hx, hy, z], [-0.55, 0.0, z * 1.1], 0.015, '#3A3D42');
  }
  a.cyl(0.04, 0.04, 0.62, '#3A3D42', [0.78, 0.07, 0], [Math.PI / 2, 0, 0], 8);
  return a.build();
}

export function washer(): Group {
  const a = new Acc();
  a.rb(0.6, 0.85, 0.6, '#F4F2EE', 0, 0, 0, 0.03);
  a.cyl(0.23, 0.23, 0.03, '#B7BCC2', [0.3, 0.38, 0], [0, 0, Math.PI / 2], 20);
  a.cyl(0.18, 0.18, 0.04, '#5A6B7A', [0.31, 0.38, 0], [0, 0, Math.PI / 2], 20);
  a.bx(0.012, 0.1, 0.5, '#CFD3D8', 0.302, 0.74, 0);
  a.cyl(0.03, 0.03, 0.02, '#3A3D42', [0.31, 0.79, 0.15], [0, 0, Math.PI / 2], 10);
  a.bx(0.015, 0.025, 0.12, '#3A3D42', 0.31, 0.77, -0.1);
  return a.build();
}

export function lampPendant(o: Opts): Group {
  const a = new Acc();
  const pts: Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new Vector2(0.32 * Math.cos(t * Math.PI * 0.5) + 0.025, 0.28 * Math.sin(t * Math.PI * 0.5)));
  }
  a.add(new LatheGeometry(pts, 20), '!' + (o.color ?? P.white), [0, 0.03, 0]);
  a.sphere(0.07, '^#FFE6A8', [0, 0.08, 0], undefined, undefined, 10);
  a.cyl(0.007, 0.007, 0.95, '#3A3D42', [0, 0.78, 0], undefined, 5);
  a.cyl(0.05, 0.05, 0.02, '#3A3D42', [0, 1.26, 0], undefined, 10);
  return a.build();
}

export function planter(o: Opts): Group {
  const a = new Acc();
  a.cyl(0.36, 0.27, 0.5, o.color ?? '#D6D1C8', [0, 0.25, 0], undefined, 16);
  a.cyl(0.33, 0.33, 0.02, '#7A5C3E', [0, 0.49, 0], undefined, 16);
  for (let i = 0; i < 5; i++) {
    const ang = i * 1.26;
    a.ico(0.2, 1, '~' + (i % 2 ? '#6FA34C' : '#7DB35A'), [Math.cos(ang) * 0.17, 0.72 + (i % 3) * 0.08, Math.sin(ang) * 0.17], [1, 1.3, 1], [i, i * 2, 0]);
  }
  for (let i = 0; i < 4; i++) a.sphere(0.045, '#E61559', [Math.cos(i * 1.6 + 0.4) * 0.26, 0.84 + (i % 2) * 0.1, Math.sin(i * 1.6 + 0.4) * 0.26], 1, undefined, 6);
  return a.build();
}

