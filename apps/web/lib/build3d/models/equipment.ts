import { CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Object3D, Shape, Vector2 } from 'three';
import { Acc, P, pivot, rng, type Opts } from './kit';

const CAR_COLORS = ['#E8E6E1', '#2F4A63', '#B23A48', '#6C7A89', '#D8B04A', '#3E6B5B', '#8E9AA6', '#C96F3B'];

export function car(o: Opts): Group {
  const r = rng(o.seed ?? 1);
  const c = o.color ?? CAR_COLORS[Math.floor(r() * CAR_COLORS.length)];
  const a = new Acc();
  const prof = (pts: [number, number][], depth: number, bevel: number) => {
    const s = new Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  };
  a.add(prof([[-2.3, 0.3], [2.3, 0.3], [2.3, 0.82], [1.2, 0.95], [0.72, 1.45], [-1.15, 1.45], [-2.0, 0.95], [-2.3, 0.85]], 1.7, 0.05), c);
  a.add(prof([[1.05, 0.99], [0.7, 1.37], [-1.1, 1.37], [-1.75, 0.99]], 1.92, 0), P.windowDark);
  a.box(1.95, 0.08, 1.74, c, [-0.2, 1.41, 0]);
  a.box(0.04, 0.72, 1.55, P.windowDark, [0.97, 1.2, 0], [0, 0, 0.78]);
  a.box(0.04, 0.78, 1.55, P.windowDark, [-1.6, 1.2, 0], [0, 0, -1.0]);
  a.bx(0.2, 0.2, 1.84, '#2B2D31', 2.28, 0.25, 0);
  a.bx(0.2, 0.2, 1.84, '#2B2D31', -2.28, 0.25, 0);
  for (const z of [-0.62, 0.62]) {
    a.bx(0.06, 0.14, 0.3, '#FFF3C4', 2.36, 0.6, z);
    a.bx(0.06, 0.12, 0.3, '#C8321F', -2.36, 0.62, z);
  }
  a.bx(0.04, 0.22, 0.5, '#2B2D31', 2.36, 0.4, 0);
  for (const x of [-1.45, 1.45]) for (const z of [-0.8, 0.8]) a.wheel(x, 0.32, z, 0.32, 0.24);
  return a.build();
}

/** Tracks shared by the excavator and the drill rig. */
function undercarriage(a: Acc, len: number, w: number): void {
  for (const z of [-w / 2, w / 2]) {
    a.rb(len, 0.7, 0.75, P.dark, 0, 0.1, z, 0.3);
    for (const x of [-len * 0.38, 0, len * 0.38]) a.cyl(0.22, 0.22, 0.04, P.steel, [x, 0.45, z + Math.sign(z) * 0.38], [Math.PI / 2, 0, 0], 10);
  }
  a.bx(len * 0.8, 0.3, w, P.dark, 0, 0.45, 0);
}

export function excavator(): Group {
  const root = new Group();
  const base = new Acc();
  undercarriage(base, 3.6, 2.0);
  root.add(base.build());

  const swing = new Group();
  swing.position.set(0, 0.95, 0);
  const body = new Acc();
  body.cyl(0.9, 0.9, 0.12, P.dark, [0, 0, 0], undefined, 16);
  body.rb(2.7, 0.85, 2.3, P.yellow, -0.2, 0.06, 0, 0.1);
  body.rb(0.9, 0.9, 2.2, P.dark, -1.6, 0.06, 0, 0.2);
  body.rb(1.2, 1.35, 1.05, P.yellow, 0.4, 0.9, 0.65, 0.08);
  body.bx(0.02, 0.8, 0.95, P.windowDark, 1.01, 1.12, 0.65);
  body.bx(1.0, 0.7, 0.02, P.windowDark, 0.4, 1.18, 1.18);
  body.bx(1.3, 0.1, 1.15, P.dark, 0.4, 2.25, 0.65);
  body.bx(0.5, 0.25, 0.3, P.dark, 1.2, 1.5, -0.8);
  body.cyl(0.07, 0.07, 0.6, P.dark, [-0.9, 1.3, -0.8], undefined, 8);
  swing.add(body.build());

  const boom = new Group();
  boom.position.set(1.05, 0.55, 0);
  const bm = new Acc();
  bm.rb(2.7, 0.55, 0.6, P.yellow, 1.2, -0.25, 0, 0.12);
  bm.rb(1.95, 0.5, 0.6, P.yellow, 3.4, -0.64, 0, 0.12, 0, -0.46);
  bm.cyl(0.14, 0.14, 0.7, P.dark, [0, 0, 0], [Math.PI / 2, 0, 0], 10);
  bm.rod([0.6, -0.25, 0.4], [2.0, 0.45, 0.4], 0.07, P.steel);
  boom.add(bm.build());
  swing.add(boom);

  const stick = new Group();
  stick.position.set(4.22, -0.78, 0);
  const sk = new Acc();
  sk.rb(2.2, 0.38, 0.45, P.yellow, 1.05, -0.19, 0, 0.1);
  sk.cyl(0.12, 0.12, 0.6, P.dark, [0, 0, 0], [Math.PI / 2, 0, 0], 10);
  sk.cyl(0.12, 0.12, 0.6, P.dark, [2.1, 0, 0], [Math.PI / 2, 0, 0], 10);
  stick.add(sk.build());
  boom.add(stick);

  const bucket = new Group();
  bucket.position.set(2.1, 0, 0);
  const bk = new Acc();
  bk.add(new CylinderGeometry(0.5, 0.5, 0.95, 14, 1, true, 0, Math.PI), '!#4A4D52', [0.3, -0.1, 0], [Math.PI / 2, 0, 0]);
  for (const z of [-0.475, 0.475]) bk.add(new CircleGeometry(0.5, 14, 0, Math.PI), P.dark, [0.3, -0.1, z], [0, 0, 0]);
  bk.bx(0.4, 0.07, 0.95, P.steel, 0.55, -0.62, 0);
  for (const z of [-0.36, -0.12, 0.12, 0.36]) bk.cone(0.06, 0.2, P.steel, [0.82, -0.58, z], [0, 0, -Math.PI / 2], 4);
  const bkMesh = bk.build();
  bkMesh.rotation.z = -0.6;
  bucket.add(bkMesh);
  stick.add(bucket);

  root.add(swing);
  boom.rotation.z = 0.8;
  stick.rotation.z = -1.3;
  bucket.rotation.z = -0.9;
  root.userData.parts = { swing, boom, stick, bucket };
  root.userData.animate = (t: number): void => {
    const p = t * 0.55;
    swing.rotation.y = 0.28 * Math.sin(p * 0.5);
    boom.rotation.z = 0.8 + 0.2 * Math.sin(p);
    stick.rotation.z = -1.3 + 0.45 * Math.sin(p + 1.2);
    bucket.rotation.z = -0.9 + 0.65 * Math.sin(p + 2.4);
  };
  return root;
}

export function dumpTruck(o: Opts): Group {
  const root = new Group();
  const a = new Acc();
  const c = o.color ?? P.yellow;
  a.bx(7.2, 0.3, 1.1, P.dark, 0, 0.75, 0);
  a.rb(1.9, 1.65, 2.4, c, 2.7, 1.0, 0, 0.12);
  a.bx(0.02, 0.62, 2.1, P.windowDark, 3.66, 1.95, 0);
  a.bx(1.05, 0.55, 2.43, P.windowDark, 2.7, 1.9, 0);
  a.bx(0.25, 0.3, 2.5, P.dark, 3.75, 0.85, 0);
  a.bx(0.04, 0.35, 1.2, P.dark, 3.66, 1.15, 0);
  for (const z of [-0.95, 0.95]) a.bx(0.05, 0.14, 0.3, '#FFF3C4', 3.66, 1.35, z);
  a.bx(1.9, 0.1, 2.4, shadeOf(c), 2.7, 2.65, 0);
  for (const x of [2.7, -1.5, -2.8]) {
    a.bx(1.2, 0.12, 2.4, P.dark, x, 0.75, 0, 0).cyl(0.06, 0.06, 2.2, P.dark, [x, 0.55, 0], [Math.PI / 2, 0, 0], 8);
    for (const z of [-1.0, 1.0]) a.wheel(x, 0.55, z * 1.0, 0.55, 0.4);
  }
  root.add(a.build());

  const bed = new Group();
  bed.position.set(-3.55, 1.05, 0);
  const b = new Acc();
  b.bx(4.6, 0.14, 2.5, c, 2.3, 0, 0);
  for (const z of [-1.19, 1.19]) b.bx(4.6, 0.95, 0.12, c, 2.3, 0.1, z);
  b.bx(0.12, 1.4, 2.5, c, 4.55, 0.1, 0);
  b.bx(0.9, 0.1, 2.5, c, 4.2, 1.5, 0);
  for (const x of [0.9, 1.9, 2.9, 3.9]) for (const z of [-1.26, 1.26]) b.bx(0.1, 0.9, 0.05, P.dark, x, 0.12, z);
  b.ico(1.0, 1, '~#A9875A', [1.9, 0.55, 0], [2.0, 0.55, 1.15], [0, 0.3, 0]);
  bed.add(b.build());
  bed.rotation.z = 0.06;
  root.add(bed);
  root.userData.parts = { bed };
  return root;
}

function shadeOf(c: string): string {
  return c === P.yellow ? '#D79F05' : c;
}

export function roller(): Group {
  const root = new Group();
  const a = new Acc();
  a.rb(2.6, 0.8, 1.6, P.yellow, -0.5, 0.45, 0, 0.1);
  a.rb(1.1, 0.6, 1.5, P.dark, -1.3, 0.85, 0, 0.1);
  a.bx(1.2, 0.4, 1.2, P.yellow, 0.75, 0.45, 0);
  for (const z of [-0.88, 0.88]) {
    a.bx(0.2, 0.2, 0.12, P.dark, 1.7, 0.75, z * 0.97);
    a.bx(0.9, 0.12, 0.08, P.dark, 1.4, 1.3, z * 0.93);
    a.wheel(-1.2, 0.75, z * 0.95, 0.75, 0.5);
    a.rod([0.3, 1.25, z * 0.65], [0.3, 2.45, z * 0.65], 0.04, P.dark);
    a.rod([-0.6, 1.25, z * 0.65], [-0.6, 2.45, z * 0.65], 0.04, P.dark);
  }
  a.bx(1.4, 0.06, 1.55, P.yellow, -0.15, 2.45, 0);
  a.rb(0.45, 0.1, 0.5, P.dark, -0.1, 1.28, 0, 0.03);
  a.rb(0.1, 0.5, 0.5, P.dark, -0.32, 1.35, 0, 0.03);
  a.bx(0.03, 0.55, 0.03, P.dark, 0.2, 1.3, 0.2);
  root.add(a.build());

  const drum = new Group();
  drum.position.set(1.75, 0.75, 0);
  const d = new Acc();
  d.cyl(0.75, 0.75, 1.7, '#E3A800', [0, 0, 0], [Math.PI / 2, 0, 0], 20);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    d.box(0.12, 0.08, 1.7, P.dark, [Math.cos(ang) * 0.76, Math.sin(ang) * 0.76, 0], [0, 0, ang]);
  }
  d.cyl(0.25, 0.25, 1.78, P.steel, [0, 0, 0], [Math.PI / 2, 0, 0], 10);
  drum.add(d.build());
  root.add(drum);
  root.userData.parts = { drum };
  root.userData.animate = (t: number): void => {
    drum.rotation.z = -t * 0.9;
  };
  return root;
}

export function mixerTruck(): Group {
  const root = new Group();
  const a = new Acc();
  a.bx(8, 0.3, 1.1, P.dark, 0, 0.7, 0);
  a.rb(2.0, 1.8, 2.5, P.white, 3.0, 0.95, 0, 0.12);
  a.bx(2.02, 0.35, 2.52, P.orange, 3.0, 1.0, 0);
  a.bx(0.02, 0.65, 2.2, P.windowDark, 4.02, 2.0, 0);
  a.bx(1.0, 0.58, 2.52, P.windowDark, 3.0, 1.95, 0);
  a.bx(0.2, 0.3, 2.4, P.dark, 4.05, 0.85, 0);
  a.bx(0.04, 0.5, 1.4, P.dark, 4.02, 1.1, 0);
  a.bx(1.8, 0.1, 2.5, P.orange, 3.0, 2.72, 0);
  for (const x of [3.0, -1.7, -3.0]) {
    a.bx(1.0, 0.12, 2.4, P.dark, x, 0.7, 0);
    for (const z of [-1.0, 1.0]) a.wheel(x, 0.5, z, 0.5, 0.4);
  }
  a.bx(1.0, 0.7, 1.4, P.dark, 0.5, 1.0, 0);
  a.bx(0.8, 0.5, 1.6, P.dark, -2.6, 1.0, 0);
  a.bx(1.4, 0.06, 0.55, P.orange, -4.0, 0.95, 0, 0).box(1.4, 0.06, 0.55, P.orange, [-4.2, 1.1, 0], [0, 0, 0.5]);
  a.bx(0.25, 0.1, 0.55, P.orange, -3.4, 1.5, 0);
  root.add(a.build());

  const tilt = new Group();
  tilt.position.set(-0.6, 2.15, 0);
  tilt.rotation.z = 0.2;
  const spin = new Group();
  tilt.add(spin);
  const prof: [number, number][] = [[0.5, -2.3], [0.95, -1.4], [1.12, 0], [1.1, 1.4], [0.6, 2.2], [0.1, 2.36]];
  const d = new Acc();
  for (let i = 0; i < prof.length - 1; i++) {
    const pts = [new Vector2(prof[i][0], prof[i][1]), new Vector2(prof[i + 1][0], prof[i + 1][1])];
    d.add(new LatheGeometry(pts, 20), '!' + (i % 2 ? P.orange : P.white), [0, 0, 0], [0, 0, -Math.PI / 2]);
  }
  const rAt = (x: number): number => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i];
      const [r1, y1] = prof[i + 1];
      if (x >= y0 && x <= y1) return r0 + ((r1 - r0) * (x - y0)) / (y1 - y0);
    }
    return 0.5;
  };
  for (let i = 0; i < 14; i++) {
    const x = -1.9 + i * 0.28;
    const ang = i * 0.55;
    const rr = rAt(x) + 0.03;
    d.box(0.34, 0.07, 0.3, P.orange, [x, Math.cos(ang) * rr, Math.sin(ang) * rr], [ang, 0, 0]);
  }
  spin.add(d.build());
  root.add(tilt);
  root.userData.parts = { drum: spin };
  root.userData.animate = (t: number): void => {
    spin.rotation.x = t * 0.9;
  };
  return root;
}

/** Boom geometry (mirrored in steps/structure-kit.ts pumpSpot, which stays three.js-free). */
export const PUMP_PIVOT: [number, number] = [-2.8, 2.05];
export const PUMP_SECTIONS = [6.2, 5.6, 5, 4];
export const PUMP_HOSE = 2.5;
/** Unfold pattern: section i is at angle a + b * K[i] (b = how much the boom arches). */
const PUMP_K = [1, 0.45, 0, -0.3];

/** Section angles that put the boom end at (X, Y) relative to the pivot (Gauss-Newton, clamped). */
function pumpAngles(X: number, Y: number): number[] {
  let a = 0.1;
  let b = 1.0;
  const L = PUMP_SECTIONS;
  for (let it = 0; it < 40; it++) {
    let x = 0;
    let y = 0;
    let xa = 0;
    let xb = 0;
    let ya = 0;
    let yb = 0;
    for (let i = 0; i < L.length; i++) {
      const A = a + b * PUMP_K[i];
      const c = Math.cos(A) * L[i];
      const s = Math.sin(A) * L[i];
      x += c;
      y += s;
      xa -= s;
      xb -= s * PUMP_K[i];
      ya += c;
      yb += c * PUMP_K[i];
    }
    const ex = X - x;
    const ey = Y - y;
    if (ex * ex + ey * ey < 1e-6) break;
    const det = xa * yb - xb * ya;
    if (Math.abs(det) < 1e-9) break;
    const da = (ex * yb - xb * ey) / det;
    const db = (xa * ey - ex * ya) / det;
    const k = Math.min(1, 0.35 / Math.max(Math.abs(da), Math.abs(db), 1e-9));
    a = Math.min(1.3, Math.max(-1.3, a + da * k));
    b = Math.min(2.0, Math.max(0.12, b + db * k));
  }
  return PUMP_K.map((k) => a + b * k);
}

export function pumpTruck(o: Opts = {}): Group {
  const root = new Group();
  const a = new Acc();
  a.bx(10, 0.3, 1.2, P.dark, 0, 0.75, 0);
  a.rb(2.0, 1.85, 2.5, P.yellow, 3.9, 1.0, 0, 0.12);
  a.bx(0.02, 0.65, 2.2, P.windowDark, 4.92, 2.0, 0);
  a.bx(1.0, 0.58, 2.52, P.windowDark, 3.9, 1.95, 0);
  a.bx(0.2, 0.3, 2.4, P.dark, 4.95, 0.85, 0);
  a.bx(1.9, 0.1, 2.5, P.yellow, 3.9, 2.85, 0);
  for (const x of [3.9, -2.7, -4.0]) for (const z of [-1.05, 1.05]) a.wheel(x, 0.55, z, 0.55, 0.4);
  a.rb(1.4, 0.9, 2.2, P.yellow, -4.0, 1.05, 0, 0.08);
  a.bx(1.2, 0.5, 1.9, P.dark, -4.1, 1.95, 0);
  a.cyl(0.8, 0.8, 0.6, P.dark, [-2.8, 1.35, 0], undefined, 16);
  a.rb(2.4, 0.5, 1.8, P.yellow, 0.2, 1.05, 0, 0.06);
  for (const x of [1.8, -3.4]) {
    for (const z of [-1, 1]) {
      a.bx(0.35, 0.3, 2.6, P.yellow, x, 0.85, 0).cyl(0.14, 0.14, 0.9, P.dark, [x, 0.4, z * 2.55], undefined, 8);
      a.bx(0.5, 0.06, 0.5, P.dark, x, 0, z * 2.55);
    }
  }
  root.add(a.build());

  // Pose: hose end at pose[0..2] (truck space) → slew + unfold; default = the folded-out show pose.
  const [px, pz] = PUMP_PIVOT;
  let slew = 0;
  let A = [1.1, 0.55, 0.1, -0.2];
  const pose = o.pose;
  if (pose && pose.length >= 3) {
    const dx = pose[0] - px;
    const dz = pose[2];
    slew = Math.atan2(-dz, dx);
    A = pumpAngles(Math.hypot(dx, dz), pose[1] + PUMP_HOSE - pz);
  }
  const boom = new Group();
  boom.position.set(px, pz, 0);
  boom.rotation.y = slew;
  const b = new Acc();
  // Turret under the boom (slews with it).
  b.cyl(0.55, 0.65, 0.5, P.yellow, [0, -0.2, 0], undefined, 14);
  let x = 0;
  let y = 0;
  PUMP_SECTIONS.forEach((len, i) => {
    const w = 0.5 - i * 0.05;
    b.box(len, w, w * 0.9, i % 2 ? '#E3A800' : P.yellow, [x + (Math.cos(A[i]) * len) / 2, y + (Math.sin(A[i]) * len) / 2, 0], [0, 0, A[i]]);
    b.cyl(0.17, 0.17, 0.62, P.dark, [x, y, 0], [Math.PI / 2, 0, 0], 10);
    b.rod([x + Math.cos(A[i]) * len * 0.15, y + Math.sin(A[i]) * len * 0.15 + 0.3, 0.3], [x + Math.cos(A[i]) * len * 0.65, y + Math.sin(A[i]) * len * 0.65 + 0.3, 0.3], 0.045, P.steel);
    x += Math.cos(A[i]) * len;
    y += Math.sin(A[i]) * len;
  });
  b.cyl(0.12, 0.12, 0.5, P.dark, [x, y, 0], [Math.PI / 2, 0, 0], 8);
  b.cyl(0.09, 0.09, PUMP_HOSE, '#1E2125', [x, y - PUMP_HOSE / 2, 0], undefined, 8);
  const stream = pose && pose.length >= 4 ? pose[3] : 0;
  if (stream > 0.05) b.cyl(0.07, 0.11, stream, '#8E9196', [x, y - PUMP_HOSE - stream / 2, 0], undefined, 10);
  boom.add(b.build());
  const tip = new Object3D();
  tip.position.set(x, y - PUMP_HOSE, 0);
  boom.add(tip);
  root.add(boom);
  // No idle animation: a pouring boom holds still over the pour.
  root.userData.parts = { boom, tip };
  return root;
}

export function drillRig(): Group {
  const root = new Group();
  const a = new Acc();
  undercarriage(a, 3.8, 2.1);
  a.cyl(0.9, 0.9, 0.12, P.dark, [-0.3, 0.95, 0], undefined, 16);
  a.rb(2.4, 0.9, 2.2, P.yellow, -0.4, 1.0, 0, 0.1);
  a.rb(1.0, 1.6, 1.0, P.yellow, -0.9, 1.9, 0.5, 0.08);
  a.bx(0.02, 0.8, 0.9, P.windowDark, -0.39, 2.4, 0.5);
  a.bx(0.9, 0.7, 0.02, P.windowDark, -0.9, 2.4, 1.01);
  a.bx(1.0, 0.1, 1.1, P.dark, -0.9, 3.5, 0.5);
  a.rb(0.8, 0.8, 2.0, P.dark, -1.8, 1.0, 0, 0.1);
  a.rb(0.5, 9.2, 0.7, P.yellow, 2.1, 0.8, 0, 0.06);
  for (const z of [-0.45, 0.45]) a.bx(0.12, 9.2, 0.12, P.dark, 2.4, 0.8, z);
  a.rb(0.8, 0.6, 0.9, P.dark, 2.3, 9.4, 0, 0.06);
  a.rod([0.4, 1.6, 0], [2.1, 8.3, 0], 0.09, P.dark);
  a.bx(1.0, 0.25, 0.8, P.dark, 2.3, 0.7, 0);
  root.add(a.build());
  const auger = new Group();
  auger.position.set(2.3, 9.4, 0);
  const g = new Acc();
  g.cyl(0.2, 0.2, 9.0, '#6B7078', [0, -4.5, 0], undefined, 10);
  for (let i = 0; i < 26; i++) {
    const ang = i * 0.62;
    g.box(0.38, 0.09, 0.07, P.yellow, [Math.cos(ang) * 0.38, -0.45 - i * 0.33, Math.sin(ang) * 0.38], [0, -ang, 0.1]);
  }
  g.cone(0.3, 0.5, P.dark, [0, -9.25, 0], [Math.PI, 0, 0], 8);
  auger.add(g.build());
  root.add(auger);
  root.userData.parts = { auger };
  root.userData.animate = (t: number): void => {
    auger.rotation.y = t * 2.6;
  };
  return root;
}
