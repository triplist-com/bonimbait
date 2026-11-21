// Mobile (all-terrain) crane for the precast method: truck carrier, four outriggers on pads, a turret,
// a three-section telescopic boom and a hook block on a cable. Front faces +X, origin bottom-center.
// `pose` = [x, y, z] of the hook block's underside in truck space: the boom slews and luffs so that its
// tip sits right above that point and the cable hangs straight down (default: boom raised, hook high).
import { Group } from 'three';
import { Acc, P, type Opts } from './kit';

/** Turret pivot in truck space (mirrored in steps/methods/precast/kit.ts, which stays three.js-free). */
export const CRANE_PIVOT: [number, number] = [-1.2, 2.45];
/** Boom length limits (m). */
export const CRANE_BOOM: [number, number] = [9, 34];
const RED = '#C8372D';
const BLOCK_H = 0.55;

/** Boom angle, length and cable length that put the hook underside at (R, Y) (R = horizontal distance from the pivot). */
export function craneBoomFor(R: number, Y: number): { angle: number; length: number; cable: number } {
  const [, py] = CRANE_PIVOT;
  const tipY = Y + BLOCK_H + 2.2;
  let L = Math.hypot(R, tipY - py);
  L = Math.min(CRANE_BOOM[1], Math.max(CRANE_BOOM[0], L));
  const angle = Math.acos(Math.min(1, R / L));
  const ty = py + L * Math.sin(angle);
  return { angle, length: L, cable: Math.max(0.6, ty - Y - BLOCK_H) };
}

export function crane(o: Opts = {}): Group {
  const root = new Group();
  const a = new Acc();
  // Carrier chassis, cab, axles.
  a.bx(11.2, 0.4, 1.3, P.dark, 0, 0.7, 0);
  a.rb(11.0, 0.8, 2.5, '#E9E6DF', 0, 1.1, 0, 0.1);
  a.bx(11.02, 0.12, 2.52, RED, 0, 1.15, 0);
  a.rb(2.3, 1.9, 2.5, '#E9E6DF', 4.2, 1.0, 0, 0.14);
  a.bx(2.32, 0.28, 2.52, RED, 4.2, 1.1, 0);
  a.bx(0.02, 0.7, 2.2, P.windowDark, 5.33, 2.0, 0);
  a.bx(1.2, 0.6, 2.52, P.windowDark, 4.2, 1.95, 0);
  a.bx(0.2, 0.3, 2.4, P.dark, 5.4, 0.85, 0);
  for (const x of [4.4, 2.3, -0.6, -2.8, -4.7]) for (const z of [-1.1, 1.1]) a.wheel(x, 0.6, z, 0.6, 0.42);
  // Counterweight + turret.
  a.bx(1.6, 0.9, 2.3, '#7C8086', -3.6, 1.9, 0);
  a.cyl(1.0, 1.1, 0.5, P.dark, [-1.2, 2.0, 0], undefined, 18);
  a.rb(2.8, 0.9, 2.2, RED, -1.9, 2.0, 0, 0.1);
  a.rb(1.2, 0.8, 1.0, P.windowDark, -0.4, 2.45, 0.7, 0.05);
  // Outriggers: horizontal beams out to both sides, jack cylinders and pads on the ground.
  for (const x of [2.6, -4.4]) {
    a.bx(0.4, 0.34, 7.0, P.yellow, x, 0.85, 0);
    for (const z of [-1, 1]) {
      a.cyl(0.13, 0.13, 0.85, P.steel, [x, 0.45, z * 3.3], undefined, 8);
      a.bx(0.95, 0.07, 0.95, P.dark, x, 0, z * 3.3);
      a.bx(0.8, 0.04, 0.8, P.wood, x, 0.07, z * 3.3);
    }
  }
  root.add(a.build());

  // Pose.
  const [px, py] = CRANE_PIVOT;
  const pose = o.pose;
  let slew = 0;
  let R = 14;
  let hy = 7;
  let hx = px + R;
  let hz = 0;
  if (pose && pose.length >= 3) {
    hx = pose[0];
    hy = pose[1];
    hz = pose[2];
    R = Math.hypot(hx - px, hz);
    slew = Math.atan2(-hz, hx - px);
  }
  const { angle, length, cable } = craneBoomFor(Math.max(1.5, R), hy);
  const boom = new Group();
  boom.position.set(px, py, 0);
  boom.rotation.y = slew;
  const b = new Acc();
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  // Three nested sections (each a little slimmer and longer out), a base pin and the luffing cylinder.
  const cuts = [0, 0.4, 0.72, 1];
  const cols = [RED, '#E9E6DF', '#E9E6DF'];
  for (let i = 0; i < 3; i++) {
    const s0 = cuts[i] * length - (i ? 0.5 : 0);
    const s1 = cuts[i + 1] * length;
    const w = 0.62 - i * 0.12;
    const mid = (s0 + s1) / 2;
    b.box(s1 - s0, w, w, cols[i], [ux * mid, uy * mid, 0], [0, 0, angle]);
  }
  b.cyl(0.2, 0.2, 0.9, P.dark, [0, 0, 0], [Math.PI / 2, 0, 0], 10);
  b.rod([-0.4, -0.55, 0], [ux * length * 0.28, uy * length * 0.28 - 0.35, 0], 0.11, P.steel);
  const tx = ux * length;
  const ty = uy * length;
  b.cyl(0.22, 0.22, 0.5, P.dark, [tx, ty, 0], [Math.PI / 2, 0, 0], 10);
  // Cable (two falls) and hook block.
  const hookTop = ty - cable;
  b.rod([tx, ty, 0.1], [tx, hookTop, 0.1], 0.025, '#1E2125', 5);
  b.rod([tx, ty, -0.1], [tx, hookTop, -0.1], 0.025, '#1E2125', 5);
  b.bx(0.34, BLOCK_H * 0.7, 0.46, P.yellow, tx, hookTop - BLOCK_H * 0.7, 0);
  b.rod([tx, hookTop - BLOCK_H * 0.7, 0], [tx, hookTop - BLOCK_H, 0], 0.05, P.dark, 6);
  boom.add(b.build());
  root.add(boom);
  root.userData.parts = { boom };
  return root;
}
