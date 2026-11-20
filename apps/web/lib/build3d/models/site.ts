import { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from 'three';
import { Acc, P, rng, type Opts } from './kit';

interface PersonStyle {
  vest: string;
  helmet: string;
  skin: string;
  pants: string;
  shirt: string;
}

function buildPerson(st: PersonStyle, armsForward = false): { root: Group; head: Group; torso: Group } {
  const root = new Group();
  const a = new Acc();
  for (const z of [-0.1, 0.1]) {
    a.rb(0.15, 0.82, 0.15, st.pants, 0, 0.07, z, 0.06);
    a.bx(0.28, 0.08, 0.14, '#3A3D42', 0.05, 0, z);
  }
  a.rb(0.26, 0.6, 0.44, st.vest, 0, 0.83, 0, 0.08);
  a.bx(0.275, 0.05, 0.445, '#EDEDED', 0, 1.02, 0);
  a.bx(0.275, 0.05, 0.445, '#EDEDED', 0, 1.18, 0);
  a.bx(0.24, 0.12, 0.2, st.shirt, 0, 1.4, 0);
  for (const z of [-1, 1]) {
    const lean = armsForward ? 0.9 : 0.12;
    a.rod([0, 1.36, z * 0.26], [armsForward ? 0.3 : 0.03, armsForward ? 1.08 : 0.82, z * (0.3 - (armsForward ? 0.06 : 0))], 0.062, st.shirt, 7);
    a.sphere(0.06, st.skin, [armsForward ? 0.3 : 0.03, armsForward ? 1.07 : 0.79, z * (armsForward ? 0.24 : 0.31 + lean * 0)], 1, undefined, 8);
  }
  root.add(a.build());
  const torso = new Group();
  const head = new Group();
  head.position.set(0, 1.6, 0);
  const h = new Acc();
  h.sphere(0.115, st.skin, [0, 0, 0], [0.95, 1.05, 0.95], undefined, 12);
  h.sphere(0.012, '#2B2B2B', [0.105, 0.01, 0.04], 1, undefined, 5).sphere(0.012, '#2B2B2B', [0.105, 0.01, -0.04], 1, undefined, 5);
  h.add(new SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), st.helmet, [0, 0.025, 0]);
  h.cyl(0.158, 0.158, 0.014, st.helmet, [0.02, 0.03, 0], undefined, 16, [1.12, 1, 1]);
  h.bx(0.025, 0.02, 0.1, st.helmet, 0, 0.15, 0);
  head.add(h.build());
  root.add(head);
  return { root, head, torso };
}

const VESTS = ['#F08A24', '#F08A24', '#C8DC3A'];
const SKINS = ['#E0AC8A', '#C98E68', '#8D5A3C', '#F0C8A8'];

export function worker(o: Opts): Group {
  const r = rng(o.seed ?? 1);
  const { root } = buildPerson({
    vest: o.color ?? VESTS[Math.floor(r() * VESTS.length)],
    helmet: P.yellow,
    skin: SKINS[Math.floor(r() * SKINS.length)],
    pants: '#34455E',
    shirt: '#7C8793',
  }, r() > 0.5);
  const ph = r() * 6;
  root.userData.animate = (t: number): void => {
    root.position.y = Math.abs(Math.sin(t * 2 + ph)) * 0.012;
    root.rotation.y = Math.sin(t * 0.7 + ph) * 0.06;
  };
  return root;
}

export function surveyor(o: Opts): Group {
  const root = new Group();
  const { root: p, head } = buildPerson({
    vest: o.color ?? '#C8DC3A',
    helmet: P.white,
    skin: '#E0AC8A',
    pants: '#5A5F66',
    shirt: '#F4F2EE',
  }, true);
  p.position.x = -0.35;
  root.add(p);
  const a = new Acc();
  const top = new Vector3(0.45, 1.3, 0);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.4;
    a.rod([top.x, top.y, top.z], [top.x + Math.cos(ang) * 0.55, 0, Math.sin(ang) * 0.55], 0.018, P.wood);
  }
  a.cyl(0.12, 0.12, 0.05, P.dark, [top.x, top.y + 0.02, 0], undefined, 10);
  a.rb(0.16, 0.26, 0.14, P.yellow, top.x, top.y + 0.05, 0, 0.03);
  a.cyl(0.03, 0.03, 0.2, P.dark, [top.x - 0.12, top.y + 0.26, 0], [0, 0, Math.PI / 2], 8);
  a.sphere(0.04, P.dark, [top.x + 0.04, top.y + 0.4, 0], undefined, undefined, 8);
  root.add(a.build());
  root.userData.parts = { head };
  root.userData.animate = (t: number): void => {
    head.rotation.y = 0.8 * Math.sin(t * 0.5);
  };
  return root;
}

let signMat: MeshStandardMaterial | null = null;
function signMaterial(): MeshStandardMaterial {
  if (signMat) return signMat;
  const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    const c = cv.getContext('2d');
    if (c) {
      c.fillStyle = '#F7F5F0';
      c.fillRect(0, 0, 512, 256);
      c.fillStyle = '#E61559';
      c.fillRect(0, 0, 512, 18);
      c.fillStyle = '#231F20';
      c.direction = 'rtl';
      c.textAlign = 'center';
      c.font = '700 76px Heebo, Arial, sans-serif';
      c.fillText('היתר בנייה', 256, 105);
      c.fillStyle = '#9AA0A6';
      for (let i = 0; i < 4; i++) c.fillRect(70 + (i % 2) * 40, 140 + i * 24, 370 - (i % 2) * 80, 10);
    }
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    m.map = tex;
  }
  signMat = m;
  return m;
}

export function permitSign(): Group {
  const a = new Acc();
  for (const z of [-0.7, 0.7]) a.cyl(0.04, 0.04, 2.4, P.steel, [0, 1.2, z], undefined, 8);
  a.bx(0.05, 1.0, 1.7, P.white, 0, 1.25, 0);
  a.bx(0.056, 0.14, 1.7, P.magenta, 0, 2.11, 0);
  const g = a.build();
  for (const dir of [1, -1]) {
    const m = new Mesh(new PlaneGeometry(1.6, 0.8), signMaterial());
    m.position.set(dir * 0.029, 1.62 - 0.4 + 0.05, 0);
    m.rotation.y = dir * (Math.PI / 2);
    m.position.y = 1.58;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export function powerPole(): Group {
  const a = new Acc();
  a.cyl(0.1, 0.15, 7, P.wood, [0, 3.5, 0], undefined, 8);
  a.bx(0.1, 0.12, 1.7, '#8A6240', -0.05, 6.55, 0);
  for (const z of [-0.7, 0, 0.7]) a.cyl(0.035, 0.05, 0.18, '#C4C6C8', [0, 6.75, z], undefined, 8);
  a.rod([0.05, 6.2, 0.0], [0.05, 6.55, -0.8], 0.025, '#8A6240').rod([0.05, 6.2, 0.0], [0.05, 6.55, 0.8], 0.025, '#8A6240');
  a.rb(0.2, 0.45, 0.32, P.steel, 0.2, 1.4, 0, 0.02);
  a.cyl(0.07, 0.07, 0.02, '#CFE3EE', [0.31, 1.75, 0], [0, 0, Math.PI / 2], 10);
  a.rod([0.15, 1.4, 0], [0.12, 0.2, 0.1], 0.02, P.dark);
  a.rod([0.15, 3.0, 0], [0.1, 6.2, 0], 0.015, P.dark);
  a.bx(0.4, 0.05, 0.4, '#8A8F98', 0, 0, 0);
  for (const z of [-0.7, 0, 0.7]) a.rod([0, 6.8, z], [-0.6, 6.1, z * 1.5], 0.012, '#1E2125');
  return a.build();
}

export function siteContainer(o: Opts): Group {
  const a = new Acc();
  const c = o.color ?? '#ECE8E1';
  a.bx(6.0, 0.15, 2.4, '#6B7078', 0, 0, 0);
  a.bx(5.96, 2.35, 2.4, c, 0, 0.15, 0);
  for (let i = 0; i < 18; i++) for (const z of [-1.205, 1.205]) a.bx(0.07, 2.2, 0.04, '#D9D4CC', -2.8 + i * 0.33, 0.2, z);
  a.bx(0.04, 2.1, 1.0, '#2F6DB5', 2.99, 0.25, -0.55);
  a.bx(0.05, 2.1, 0.03, '#1F4F86', 3.0, 0.25, 0.0);
  a.bx(0.04, 0.06, 1.0, '#1F4F86', 3.0, 1.2, -0.55);
  a.bx(0.06, 0.2, 0.04, P.steel, 3.02, 1.2, -0.1);
  a.bx(0.03, 0.8, 0.8, '#CFE3EE', 3.0, 1.0, 0.8);
  a.bx(0.05, 0.9, 0.06, '#2F6DB5', 3.0, 0.95, 0.38);
  a.bx(0.05, 0.9, 0.06, '#2F6DB5', 3.0, 0.95, 1.2);
  a.bx(0.8, 0.8, 0.03, '#CFE3EE', 0.5, 1.0, 1.215);
  a.bx(0.9, 0.9, 0.05, '#2F6DB5', 0.5, 0.95, 1.205);
  a.bx(0.8, 0.8, 0.03, '#CFE3EE', 0.5, 1.0, 1.222);
  a.bx(6.1, 0.1, 2.5, '#D9D4CC', 0, 2.5, 0);
  a.bx(1.2, 0.12, 0.5, '#8A6240', 3.7, 0.1, -0.55).bx(0.5, 0.35, 0.5, '#8A6240', 3.4, 0.0, -0.55);
  return a.build();
}

export function siteToilet(): Group {
  const a = new Acc();
  a.rb(1.2, 2.2, 1.2, '#2F8FD1', 0, 0.1, 0, 0.05);
  a.rb(1.3, 0.12, 1.3, P.white, 0, 2.3, 0, 0.04);
  a.rb(1.2, 0.1, 1.2, '#1F6FA8', 0, 0, 0, 0.03);
  a.bx(0.04, 1.8, 0.8, '#F4F2EE', 0.61, 0.25, 0);
  a.bx(0.06, 0.14, 0.14, '#E61559', 0.63, 1.1, 0.28);
  a.bx(0.05, 0.3, 0.3, '#C8321F', 0.62, 1.6, 0);
  a.bx(0.2, 0.05, 0.5, '#1F6FA8', 0.5, 2.0, 0);
  return a.build();
}

export function scaffoldBay(): Group {
  const a = new Acc();
  const S = P.steel;
  const hw = 0.5;
  const hl = 1.25;
  const H = 4.0;
  for (const x of [-hw, hw]) for (const z of [-hl, hl]) {
    a.cyl(0.027, 0.027, H + 1.0, S, [x, (H + 1.0) / 2, z], undefined, 8);
    a.bx(0.14, 0.02, 0.14, P.dark, x, 0, z);
  }
  for (const y of [0.25, 2.0, 4.0]) {
    for (const x of [-hw, hw]) a.cyl(0.025, 0.025, hl * 2, S, [x, y, 0], [Math.PI / 2, 0, 0], 6);
    for (const z of [-hl, hl]) a.cyl(0.025, 0.025, hw * 2, S, [0, y, z], [0, 0, Math.PI / 2], 6);
  }
  for (const y of [2.0, 4.0]) {
    for (let i = 0; i < 4; i++) a.bx(0.24, 0.04, hl * 2 - 0.04, i % 2 ? '#C9A27A' : '#B98A55', -0.38 + i * 0.253, y + 0.02, 0);
  }
  for (const y of [3.0, 3.5]) {
    a.cyl(0.02, 0.02, hl * 2, S, [hw, y, 0], [Math.PI / 2, 0, 0], 6);
    a.cyl(0.02, 0.02, hl * 2, S, [-hw, y, 0], [Math.PI / 2, 0, 0], 6);
  }
  a.bx(0.02, 0.15, hl * 2, '#C9A27A', hw, 2.05, 0);
  a.rod([hw, 0.25, -hl], [hw, 2.0, hl], 0.018, '#8A8F98');
  a.rod([hw, 2.0, -hl], [hw, 4.0, hl], 0.018, '#8A8F98');
  a.rod([-hw, 0.25, hl], [-hw, 2.0, -hl], 0.018, '#8A8F98');
  return a.build();
}

export function solarHeater(): Group {
  const a = new Acc();
  const tilt = -0.5;
  const cx = 0;
  const cy = 0.7;
  a.box(1.9, 0.09, 1.2, P.steel, [cx, cy, 0], [0, 0, tilt]);
  a.box(1.78, 0.02, 1.08, '#1F3A5F', [cx, cy + 0.052, 0], [0, 0, tilt]);
  for (let i = 1; i < 6; i++) a.box(0.012, 0.025, 1.08, P.steel, [cx + (i - 3) * 0.29 * Math.cos(tilt), cy + 0.056 + (i - 3) * 0.29 * Math.sin(tilt), 0], [0, 0, tilt]);
  a.cyl(0.27, 0.27, 1.2, P.white, [-0.88, 1.45, 0], [Math.PI / 2, 0, 0], 16);
  a.cyl(0.28, 0.28, 0.02, '#D9D4CC', [-0.88, 1.45, 0.61], [Math.PI / 2, 0, 0], 16);
  a.cyl(0.28, 0.28, 0.02, '#D9D4CC', [-0.88, 1.45, -0.61], [Math.PI / 2, 0, 0], 16);
  for (const z of [-0.45, 0.45]) {
    a.rod([-0.8, 0, z], [-0.8, 1.2, z], 0.025, P.dark);
    a.rod([0.8, 0, z], [0.8, 0.28, z], 0.025, P.dark);
    a.rod([-0.8, 0.3, z], [0.8, 0.28, z], 0.02, P.dark);
    a.rod([-0.85, 1.25, z], [-0.85, 1.35, z], 0.04, P.dark);
  }
  a.rod([-0.88, 1.7, 0], [-0.88, 1.95, 0], 0.02, P.steel);
  return a.build();
}

export function acUnit(): Group {
  const a = new Acc();
  a.bx(0.3, 0.08, 0.1, P.dark, 0, 0, -0.3).bx(0.3, 0.08, 0.1, P.dark, 0, 0, 0.3);
  a.rb(0.33, 0.66, 0.86, '#E9E9E6', 0, 0.08, 0, 0.03);
  a.cyl(0.26, 0.26, 0.012, P.dark, [0.167, 0.42, 0], [0, 0, Math.PI / 2], 20);
  for (const rr of [0.1, 0.17, 0.24]) a.add(new TorusGeometry(rr, 0.008, 4, 20), P.steel, [0.175, 0.42, 0], [0, Math.PI / 2, 0]);
  for (let i = 0; i < 3; i++) a.box(0.01, 0.5, 0.025, P.steel, [0.17, 0.42, 0], [i * 1.047, 0, 0]);
  for (let i = 0; i < 6; i++) a.bx(0.01, 0.012, 0.14, '#C4C6C8', 0.167, 0.16 + i * 0.09, 0.36);
  return a.build();
}
export function prop(): Group {
  const a = new Acc();
  a.bx(0.16, 0.012, 0.16, P.dark, 0, 0, 0);
  a.cyl(0.055, 0.055, 1.6, '#3F7BD9', [0, 0.8, 0], undefined, 10);
  a.cyl(0.042, 0.042, 1.5, P.steel, [0, 2.25, 0], undefined, 10);
  a.cyl(0.1, 0.1, 0.14, P.orange, [0, 1.55, 0], undefined, 10);
  a.bx(0.2, 0.012, 0.14, P.dark, 0, 2.99, 0);
  for (const z of [-0.07, 0.07]) a.bx(0.2, 0.06, 0.012, P.dark, 0, 2.95, z);
  return a.build();
}

export function wheelbarrow(): Group {
  const a = new Acc();
  a.rb(0.7, 0.05, 0.55, P.yellow, 0.1, 0.38, 0, 0.02);
  for (const z of [-0.29, 0.29]) a.rb(0.7, 0.2, 0.04, P.yellow, 0.1, 0.4, z, 0.015, 0, z > 0 ? 0 : 0);
  a.rb(0.04, 0.2, 0.6, P.yellow, 0.46, 0.4, 0, 0.015);
  a.rb(0.04, 0.2, 0.6, P.yellow, -0.26, 0.4, 0, 0.015);
  a.bx(0.4, 0.04, 0.04, P.dark, 0.1, 0.34, 0).bx(0.04, 0.04, 0.5, P.dark, 0.1, 0.34, 0);
  a.wheel(0.62, 0.2, 0, 0.2, 0.08);
  for (const z of [-0.26, 0.26]) {
    a.rod([-0.7, 0.55, z], [0.55, 0.36, z * 0.55], 0.022, '#8A6240');
    a.rod([-0.3, 0.46, z], [-0.3, 0, z], 0.02, P.dark);
    a.rod([0.62, 0.2, z * 0.4], [0.62, 0.2, z * 0.6], 0.02, P.dark);
  }
  return a.build();
}

export function blockPallet(): Group {
  const a = new Acc();
  for (const x of [-0.5, 0, 0.5]) a.bx(0.1, 0.1, 1.0, P.wood, x, 0.0, 0);
  for (let i = 0; i < 5; i++) a.bx(1.2, 0.025, 0.17, '#C9A27A', 0, 0.1, -0.4 + i * 0.2);
  for (let layer = 0; layer < 6; layer++) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
      const off = layer % 2 ? 0.2 : 0;
      a.bx(0.39, 0.19, 0.19, P.block, -0.4 + i * 0.4 + (layer % 2 ? 0.0 : 0), 0.125 + layer * 0.2, -0.4 + j * 0.2 + off * 0 + (layer % 2 ? 0 : 0));
    }
  }
  a.bx(1.22, 0.02, 0.03, P.dark, 0, 0.7, 0.0).bx(1.22, 0.02, 0.03, P.dark, 0, 0.9, 0.0);
  return a.build();
}

export function rebarBundle(): Group {
  const a = new Acc();
  const rows = [3, 4, 5, 4, 3];
  const r = 0.022;
  rows.forEach((n, ri) => {
    for (let i = 0; i < n; i++) a.cyl(r, r, 6, P.rust, [0, 0.16 + (ri - 2) * r * 1.8 + 0.05 + 0.04, (i - (n - 1) / 2) * r * 2.05], [0, 0, Math.PI / 2], 6);
  });
  for (const x of [-2, 0, 2]) a.box(0.015, 0.2, 0.2, '#F2B705', [x, 0.2, 0]);
  for (const x of [-2.2, 2.2]) a.bx(0.12, 0.1, 0.4, P.wood, x, 0, 0);
  return a.build();
}
