/**
 * The Director owns the 3D scene graph of the build and plays the timeline:
 * which parts are visible at a step, entry/exit animations, the magenta highlight of
 * the current step, ghost preview of future parts, automatic x-ray, ground x-ray and
 * the plan intro. Everything per-frame lives here (no React state).
 */
import * as THREE from 'three';
import { bbox2, signedDistance } from '../../house/geometry';
import type { HouseModel } from '../../house/types';
import { getContext } from '../../steps/context';
import { ease } from '../anim';
import type { CameraHint, Vec2 } from '../types';
import { visibleAt, type Timeline, type TimelinePart } from '../timeline';
import { GHOST_OPACITY, MaterialLibrary, XRAY_OPACITY } from './materials';
import { GlowLayer, type GlowHalo, type GlowPool } from './glow';
import { loadPlanTexture } from './geometry';
import { buildPart, disposePart, materialKeyAt, type PartRT } from './part';

const APPEAR = 0.35;
const VANISH = 0.3;
const HIGHLIGHT_HOLD = 1.5;
/**
 * "New this step" emphasis (toolbar "הדגשה"): the current step's parts keep a resting magenta
 * tint (fraction of the full highlight) after their animation, with two soft breaths in between,
 * and finished parts are muted toward warm gray. No postprocessing: shared material variants.
 */
const HIGHLIGHT_REST = 0.72;
const PULSE_TIME = 2.6;
const PULSE_PERIOD = 1.3;
const MUTE = 0.62;
/** The terrain mutes less (the site stays warm, the house parts go paper-gray). */
const GROUND_MUTE = 0.55;
/** Interior phases (systems, finishes): parts above the cut are lifted off (peeled), not ghosted. */
const PEEL_PHASES = new Set([9, 11]);
const PEEL_LIFT = 2.2;
/** Steps closer together than this (s) are a fast scrub / key repeat: no half-built entries. */
const QUICK_STEP = 0.3;
const GROUND_XRAY = 0.3;
/**
 * Parts cast into concrete (or pure clutter) that VANISH instead of turning translucent
 * when the x-ray fades them: rebar, slab conduits and boxes, sleeves, void formers,
 * spacers, scaffolding, the roof build-up layers. A ghosted slab full of steel reads as
 * noise, not as a slab.
 */
const XRAY_HIDE = new Set([
  'rebar',
  'mep-ceiling',
  'ceiling-box',
  'sleeves',
  'void-formers',
  'spacers',
  'scaffolding',
  // Roof build-up: stacked translucent layers turn into a white haze; the slab alone shows the roof.
  'screed',
  'insulation',
  'roof-membrane',
  'roof-coat',
  'roof-drain',
]);
/**
 * Light-frame wall cores (steel / timber: studs, OSB, wrap, cement board, wool). Once the walls are
 * closed (finishes and later) they vanish instead of ghosting, like the steel in a concrete wall:
 * five stacked translucent layers read as an almost opaque wall that hides the rooms.
 */
const XRAY_HIDE_CLOSED = new Set(['frame', 'osb', 'house-wrap', 'cement-board', 'wall-insulation']);
const CLOSED_FROM_PHASE = 11;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Focus {
  box: THREE.Box3;
  hint?: CameraHint;
}

export class Director {
  readonly root = new THREE.Group();
  readonly lib: MaterialLibrary;
  readonly timeline: Timeline;
  readonly house: HouseModel;
  /** Model-space boxes used for 'house' / 'site' framing. */
  readonly houseBox: THREE.Box3;
  readonly siteBox: THREE.Box3;
  /** Camera azimuth (rad) looking at the house from the street. */
  readonly frontAzimuth: number;

  step = -1;
  private rts: Array<PartRT | undefined>;
  private dirty = new Set<PartRT>();
  private clock = 0;
  private time = 0;
  private span = 0;
  private hl = 0;
  /** Emphasis on (toolbar): resting highlight + muted finished parts. */
  private focusOn = true;
  /** Current step: finished parts use their muted variants / the step has emphasized parts. */
  private muteOn = false;
  private hasNew = false;
  private mute = 0;
  /** Parts lifted off by the interior peel (eased back when it ends). */
  private lifted = new Set<PartRT>();
  /** prefers-reduced-motion: no pulse, no peel lift (fades only). */
  reducedMotion = false;
  private ghostFuture = false;
  private xrayOn = true;
  private xrayTimer = 0;
  private xrayCam = new THREE.Matrix4();
  private xrayForce = true;
  private fp: Vec2[];
  private planCancel?: () => void;
  private planReady = false;
  private buildCursor = 0;
  /** Dusk halos / light pools (finale). */
  readonly glow = new GlowLayer();
  private duskLevel = 0;
  /** Intro (plan sheet → terrain). null when not running. */
  intro: { t: number } | null = null;
  /** Debug: pin the intro clock (headless screenshots). */
  debugIntroT?: number;
  /** Debug: speed up animations (headless screenshots run at a few fps). */
  timeScale = 1;

  constructor(house: HouseModel, timeline: Timeline, lib = new MaterialLibrary()) {
    this.house = house;
    this.timeline = timeline;
    this.lib = lib;
    this.rts = new Array(timeline.parts.length);
    this.root.name = 'build';
    this.root.add(this.glow.group);
    const ctx = getContext(house);
    this.fp = ctx.footprint.house;
    const hb = bbox2(ctx.footprint.house);
    this.houseBox = new THREE.Box3(
      new THREE.Vector3(hb.min[0], ctx.lower.floorY - 0.6, hb.min[1]),
      new THREE.Vector3(hb.max[0], ctx.roof.floorY + 0.6, hb.max[1]),
    );
    const lb = ctx.lot.bbox;
    const hs = ctx.terrain.natural.heights;
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of hs) {
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    this.siteBox = new THREE.Box3(new THREE.Vector3(lb.min[0], lo, lb.min[1]), new THREE.Vector3(lb.max[0], hi + 1.5, lb.max[1]));
    const inv = ctx.lot.street.inward;
    // Camera on the street side: offset direction = -inward. Azimuth measured from +Z toward +X.
    this.frontAzimuth = Math.atan2(-inv[0], -inv[1]);
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  private ensure(i: number): PartRT {
    let rt = this.rts[i];
    if (!rt) {
      const tp = this.timeline.parts[i];
      rt = buildPart(tp, this.lib, this.house);
      rt.root.visible = false;
      this.rts[i] = rt;
      this.root.add(rt.root);
      if (rt.plan) {
        const pb = rt.plan;
        this.planCancel = loadPlanTexture(this.house, pb.viewport, (tex) => {
          pb.material.uniforms.map.value = tex;
          this.planReady = true;
          this.onChange?.();
        });
      }
    }
    return rt;
  }

  /** Builds not-yet-built parts in timeline order within a time budget. Returns true if more remain. */
  prebuild(budgetMs = 6): boolean {
    const t0 = performance.now();
    while (this.buildCursor < this.rts.length) {
      if (!this.rts[this.buildCursor]) this.ensure(this.buildCursor);
      this.buildCursor += 1;
      if (performance.now() - t0 > budgetMs) break;
    }
    return this.buildCursor < this.rts.length;
  }

  /** Called when something async changed (texture loaded) so the host can invalidate. */
  onChange?: () => void;

  // -------------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------------

  private ghostable(tp: TimelinePart): boolean {
    const p = tp.part;
    if (p.shape.kind === 'plan' || p.tags?.includes('ground')) return false;
    return p.ghost ?? tp.removedAt === Infinity;
  }

  private isVisibleMode(rt: PartRT | undefined) {
    return !!rt && (rt.mode === 'enter' || rt.mode === 'shown' || rt.mode === 'appear' || rt.mode === 'leave');
  }

  setStep(s: number, opts: { replay?: boolean } = {}) {
    const n = this.timeline.steps.length;
    s = Math.max(0, Math.min(n - 1, s));
    const prev = this.step;
    const oneForward = s === prev + 1;
    const forward = s > prev || (s === prev && !!opts.replay);
    // Fast scrubbing / key repeat: the new parts fade in fully built instead of starting their
    // entry animation (no half-built flicker while the steps fly by).
    const quick = prev >= 0 && s !== prev && !opts.replay && this.clock < QUICK_STEP && !this.intro;
    this.step = s;
    const st = this.timeline.steps[s];
    this.hasNew = (this.timeline.added[s] ?? []).some((i) => {
      const p = this.timeline.parts[i].part;
      return p.highlight !== false && !p.tags?.includes('ground') && p.shape.kind !== 'plan';
    });
    this.muteOn = this.focusOn && st?.view?.lighting !== 'dusk';
    this.clock = 0;
    this.span = this.timeline.span[s] ?? 0;
    this.xrayForce = true;
    const parts = this.timeline.parts;
    for (let i = 0; i < parts.length; i++) {
      const tp = parts[i];
      let rt = this.rts[i];
      const wasVis = this.isVisibleMode(rt) && rt?.mode !== 'leave';
      const nowVis = visibleAt(tp, s);
      if (tp.addedAt === s) {
        rt = this.ensure(i);
        if (forward && !quick) this.begin(rt, 'enter');
        else this.begin(rt, wasVis ? 'shown' : 'appear');
      } else if (tp.removedAt === s && wasVis && oneForward && rt) {
        this.begin(rt, 'leave');
      } else if (nowVis) {
        rt = this.ensure(i);
        this.begin(rt, wasVis ? 'shown' : 'appear');
      } else if (wasVis && rt) {
        this.begin(rt, 'vanish');
      } else if (this.ghostFuture && tp.addedAt > s && this.ghostable(tp)) {
        this.begin(this.ensure(i), 'ghost');
      } else if (rt && rt.mode !== 'hidden') {
        this.begin(rt, 'hidden');
      }
      if (rt) {
        rt.xrayTarget = 1;
        if (rt.xrayValue !== 1) this.dirty.add(rt);
        // Fresh concrete is darker during its pour step.
        if (rt.matKey && rt.mode !== 'hidden' && rt.mode !== 'ghost') {
          const k = materialKeyAt(rt.part, s - tp.addedAt);
          if (k !== rt.matKey) this.setMaterialKey(rt, k);
        }
      }
    }
    this.glow.step = -1;
    if (this.duskLevel > 0.001) this.collectGlow();
    this.onChange?.();
  }

  /** 0 = day, 1 = dusk: lamps and lit glass glow, halos and light pools fade in. */
  setDusk(k: number) {
    this.duskLevel = k;
    this.lib.setDusk(k);
    if (k > 0.001 && this.glow.step !== this.step) this.collectGlow();
    this.glow.setLevel(k);
  }

  /** Halos at every lamp / lit pane visible at the current step (settled poses). */
  private collectGlow() {
    const s = this.step;
    const halos: GlowHalo[] = [];
    const pools: GlowPool[] = [];
    const warm = new THREE.Color('#FFB868');
    const lamp = new THREE.Color('#FFC27A');
    const m = new THREE.Matrix4();
    const b = new THREE.Box3();
    const size = new THREE.Vector3();
    this.timeline.parts.forEach((tp, i) => {
      const p = tp.part;
      const win = p.material === 'glassLit';
      if (!win && !(p.material === 'light' && p.glow)) return;
      if (!visibleAt(tp, s)) return;
      const rt = this.ensure(i);
      rt.root.updateMatrixWorld(true);
      const boxes: THREE.Box3[] = [];
      if (rt.inst) {
        const g = rt.inst.mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        for (let k = 0; k < rt.inst.count; k++) {
          m.fromArray(rt.inst.base, k * 16).premultiply(rt.root.matrixWorld);
          boxes.push(b.copy(g.boundingBox as THREE.Box3).applyMatrix4(m).clone());
        }
      } else boxes.push(rt.box.clone());
      const gl = p.glow ?? {};
      const kk = gl.k ?? 1;
      for (const bx of boxes) {
        bx.getSize(size);
        const c = bx.getCenter(new THREE.Vector3());
        if (win) {
          const w = Math.max(size.x, size.z);
          // Tiny glass bits (door lites) get a small glow; panes a wide one.
          if (w < 0.12 && size.y < 0.12) continue;
          halos.push({ at: c, w: w * 1.25 + 1.1, h: size.y * 1.2 + 1.0, color: warm, k: 0.8 * kk });
          // Door-height glazing spills a pool of light onto the terrace / balcony in front.
          if (size.y > 1.7 && w > 0.7) pools.push({ at: new THREE.Vector3(c.x, bx.min.y + 0.025, c.z), radius: Math.max(1.3, w * 0.62), color: warm, k: 0.5 * kk });
          continue;
        }
        const len = Math.max(size.x, size.z);
        const hs = gl.halo ?? 0.8;
        if (len > 1.2) {
          // Strips: a row of halos along the long axis.
          const n = Math.max(2, Math.round(len / 0.8));
          const alongX = size.x >= size.z;
          for (let j = 0; j < n; j++) {
            const t = (j + 0.5) / n - 0.5;
            const at = c.clone();
            if (alongX) at.x += t * size.x;
            else at.z += t * size.z;
            halos.push({ at, w: hs, h: hs, color: lamp, k: 0.75 * kk });
          }
        } else halos.push({ at: c, w: hs, h: hs, color: lamp, k: kk });
        if (gl.pool) pools.push({ at: new THREE.Vector3(c.x, c.y - (gl.drop ?? 0) + 0.03, c.z), radius: gl.pool, color: lamp, k: 0.85 * kk });
      }
    });
    this.glow.setItems(halos, pools);
    this.glow.step = s;
  }

  private setMaterialKey(rt: PartRT, key: PartRT['matKey']) {
    if (!key) return;
    rt.matKey = key;
    const vc = rt.part.shape.kind === 'terrain';
    const base = this.lib.get(key, rt.part.color, { vertexColors: vc, offset: rt.edges });
    for (const m of rt.meshes) {
      m.userData.base = base;
      if (m.userData.dyn) {
        (m.userData.dyn as THREE.Material).dispose();
        m.userData.dyn = undefined;
      }
    }
    rt.look.key = '';
    this.dirty.add(rt);
  }

  private begin(rt: PartRT, mode: PartRT['mode']) {
    rt.mode = mode;
    rt.t0 = this.clock;
    if (mode === 'shown' || mode === 'ghost') this.settle(rt);
    if (mode === 'hidden') {
      rt.root.visible = false;
      this.settle(rt);
      rt.look.key = '';
    }
    if (mode === 'enter' || mode === 'appear') {
      this.settle(rt);
      if (mode === 'enter') this.applyEnter(rt, 0);
    }
    rt.look.key = '';
    this.dirty.add(rt);
  }

  /** Puts a part in its final, resting pose. */
  private settle(rt: PartRT) {
    rt.pivot.position.set(0, 0, 0);
    rt.pivot.scale.set(1, 1, 1);
    if (rt.inst && !rt.inst.settled) {
      rt.inst.mesh.instanceMatrix.array.set(rt.inst.base);
      rt.inst.mesh.instanceMatrix.needsUpdate = true;
      rt.inst.settled = true;
    }
    if (rt.morph?.morphTargetInfluences) rt.morph.morphTargetInfluences[0] = 1;
    if (rt.plan) {
      rt.plan.material.uniforms.uMorph.value = 1;
      rt.plan.material.uniforms.uInk.value = 1;
    }
  }

  setGhost(on: boolean) {
    if (on === this.ghostFuture) return;
    this.ghostFuture = on;
    const s = this.step;
    this.timeline.parts.forEach((tp, i) => {
      if (tp.addedAt <= s) return;
      const rt = this.rts[i];
      if (on && this.ghostable(tp)) this.begin(this.ensure(i), 'ghost');
      else if (!on && rt && rt.mode === 'ghost') this.begin(rt, 'hidden');
    });
    this.onChange?.();
  }

  /** Toolbar "הדגשה": resting highlight of the current step's parts + muted finished parts. */
  setFocus(on: boolean) {
    if (on === this.focusOn) return;
    this.focusOn = on;
    this.muteOn = on && this.timeline.steps[this.step]?.view?.lighting !== 'dusk';
    for (const rt of this.rts) {
      if (!rt || rt.mode === 'hidden') continue;
      rt.look.key = '';
      this.dirty.add(rt);
    }
    this.onChange?.();
  }

  setXray(on: boolean) {
    this.xrayOn = on;
    this.xrayForce = true;
    this.onChange?.();
  }

  /** Plan intro: paper sheet top-down → drapes onto the terrain while the camera glides. */
  startIntro() {
    if (this.step !== 0) this.setStep(0);
    this.intro = { t: 0 };
  }

  /** 'hold' (top-down), 'glide' (camera moving), or 'done'. */
  introPhase(): 'hold' | 'glide' | 'done' {
    if (!this.intro) return 'done';
    return this.intro.t < 0.55 ? 'hold' : 'glide';
  }

  // -------------------------------------------------------------------------
  // Per frame
  // -------------------------------------------------------------------------

  /** Advances animations; returns true while more frames are needed. */
  update(dt: number, camera: THREE.Camera): boolean {
    dt = Math.min(dt, 0.1) * this.timeScale;
    this.time += dt;
    let busy = false;
    if (this.intro) {
      // Wait (briefly) for the sheet texture before starting the reveal.
      if (this.debugIntroT !== undefined) this.intro.t = this.debugIntroT;
      else if (this.planReady || this.intro.t > 0 || this.time > 2.5) this.intro.t += dt;
      busy = true;
      if (this.intro.t > 2.9) {
        this.intro = null;
        for (const rt of this.rts) if (rt) rt.look.key = '';
        this.timeline.added[this.step]?.forEach((i) => this.rts[i] && this.dirty.add(this.rts[i] as PartRT));
      }
    }
    const introHold = this.intro && this.intro.t < 1.5;
    if (!introHold) this.clock += dt;

    // Highlight level for the current step.
    const hl = this.highlightLevel();
    if (Math.abs(hl - this.hl) > 1e-3 || (hl === 0 && this.hl !== 0)) {
      const wasOn = this.hl > 0.004;
      this.hl = hl;
      this.lib.setHighlight(hl);
      const on = hl > 0.004;
      if (wasOn !== on) this.timeline.added[this.step]?.forEach((i) => this.rts[i] && this.dirty.add(this.rts[i] as PartRT));
      busy = true;
    }
    // Finished parts ease into / out of their muted look.
    const mt = this.muteOn && this.hasNew && !this.intro ? MUTE : 0;
    if (this.mute !== mt) {
      const d = mt - this.mute;
      this.mute = Math.abs(d) < 0.004 ? mt : this.mute + d * Math.min(1, dt * 5);
      this.lib.setMute(this.mute);
      busy = true;
    }

    // X-ray at ~8 Hz, or immediately after a step change / camera move.
    this.xrayTimer += dt;
    if (this.xrayForce || this.xrayTimer > 0.12) {
      const moved = !this.xrayCam.equals(camera.matrixWorld);
      if (this.xrayForce || moved) {
        this.xrayCam.copy(camera.matrixWorld);
        this.computeXray(camera);
      }
      this.xrayForce = false;
      this.xrayTimer = 0;
    }

    for (const rt of Array.from(this.dirty)) {
      const keep = this.tick(rt, dt);
      if (!keep) this.dirty.delete(rt);
    }

    // Idle loops of working machines.
    const s = this.step;
    for (const i of this.timeline.added[s] ?? []) {
      const rt = this.rts[i];
      if (rt?.animate && rt.root.visible) {
        rt.animate(this.time);
        busy = true;
      }
    }
    for (const rt of this.rts) {
      if (rt?.animate && rt.part.idle && rt.tp.addedAt < s && rt.root.visible) {
        rt.animate(this.time);
        busy = true;
      }
    }
    return busy || this.dirty.size > 0;
  }

  /** Emphasis of the current step's parts: full while they animate, two soft breaths, then a resting tint. */
  private highlightLevel(): number {
    if (!this.focusOn) return this.clock < this.span ? 1 : 1 - smooth(this.span, this.span + HIGHLIGHT_HOLD, this.clock);
    if (this.clock < this.span) return 1;
    const t = this.clock - this.span;
    if (this.reducedMotion) return HIGHLIGHT_REST + (1 - HIGHLIGHT_REST) * (1 - smooth(0, 0.6, t));
    const env = 1 - smooth(0, PULSE_TIME, t);
    return HIGHLIGHT_REST + (1 - HIGHLIGHT_REST) * env * (0.5 + 0.5 * Math.cos((t * 2 * Math.PI) / PULSE_PERIOD));
  }

  /** Returns true while the part still needs per-frame updates. */
  private tick(rt: PartRT, dt: number): boolean {
    // X-ray easing.
    let xrayMoving = false;
    if (rt.xrayValue !== rt.xrayTarget) {
      const d = rt.xrayTarget - rt.xrayValue;
      rt.xrayValue = Math.abs(d) < 0.01 ? rt.xrayTarget : rt.xrayValue + d * Math.min(1, dt * 7);
      xrayMoving = rt.xrayValue !== rt.xrayTarget;
    }
    // Interior peel: lifted parts rise as they fade (and drop back when the peel ends).
    if (this.lifted.has(rt) && (rt.mode === 'shown' || rt.mode === 'appear')) {
      rt.pivot.position.y = this.reducedMotion ? 0 : PEEL_LIFT * (1 - rt.xrayValue);
      if (rt.xrayValue === 1 && rt.xrayTarget === 1) {
        rt.pivot.position.y = 0;
        this.lifted.delete(rt);
      }
    }
    let opacity = 1;
    let active = false;
    const isCurrent = rt.tp.addedAt === this.step;
    switch (rt.mode) {
      case 'hidden':
        rt.root.visible = false;
        return false;
      case 'ghost':
        this.applyLook(rt, GHOST_OPACITY, false);
        return xrayMoving;
      case 'enter': {
        const r = this.applyEnter(rt, this.clock);
        opacity = r.opacity;
        if (r.done) {
          rt.mode = 'shown';
          this.settle(rt);
        } else active = true;
        break;
      }
      case 'leave': {
        const r = this.applyExit(rt, this.clock - rt.t0);
        opacity = r.opacity;
        if (r.done) {
          rt.mode = 'hidden';
          this.settle(rt);
          rt.root.visible = false;
          return false;
        }
        active = true;
        break;
      }
      case 'appear': {
        const q = (this.clock - rt.t0) / APPEAR;
        opacity = Math.min(1, q);
        if (q >= 1) rt.mode = 'shown';
        else active = true;
        break;
      }
      case 'vanish': {
        const q = (this.clock - rt.t0) / VANISH;
        opacity = Math.max(0, 1 - q);
        if (q >= 1) {
          const tp = rt.tp;
          if (this.ghostFuture && tp.addedAt > this.step && this.ghostable(tp)) rt.mode = 'ghost';
          else {
            rt.mode = 'hidden';
            rt.root.visible = false;
            return false;
          }
        } else active = true;
        break;
      }
      default:
        break;
    }
    // Intro: terrain fades in under the paper.
    if (this.intro && this.step === 0) {
      const t = this.intro.t;
      if (rt.plan) {
        const u = rt.plan.material.uniforms;
        u.uMorph.value = ease('inOut', (t - 0.9) / 1.7);
        u.uInk.value = smooth(1.2, 2.6, t);
        u.uOpacity.value = 1;
        rt.root.visible = true;
        return true;
      } else if (rt.isGround) opacity *= smooth(0.6, 2.0, t);
      else opacity *= smooth(1.6, 2.2, t);
      active = true;
    }
    const hl = isCurrent && this.hl > 0.004 && rt.part.highlight !== false && !rt.isGround && rt.mode !== 'leave';
    const muted = !isCurrent && this.muteOn && !this.intro;
    let xr = rt.xrayValue;
    if (rt.mode === 'enter' || isCurrent) xr = 1;
    this.applyLook(rt, opacity * xr, hl, muted);
    return active || xrayMoving;
  }

  // -------------------------------------------------------------------------
  // Entry / exit animation
  // -------------------------------------------------------------------------

  private applyEnter(rt: PartRT, clock: number): { opacity: number; done: boolean } {
    const a = rt.anim;
    if (a.motion === 'none') return { opacity: 1, done: true };
    if (rt.inst && a.motion !== 'fade' && a.motion !== 'morph') return this.applyInstanced(rt, clock);
    const p = Math.min(1, Math.max(0, (clock - a.delay) / Math.max(1e-3, a.duration)));
    const e = ease(a.ease, p);
    const lb = rt.localBox;
    const minY = isFinite(lb.min.y) ? lb.min.y : 0;
    const cx = isFinite(lb.min.x) ? (lb.min.x + lb.max.x) / 2 : 0;
    const cz = isFinite(lb.min.z) ? (lb.min.z + lb.max.z) / 2 : 0;
    const pv = rt.pivot;
    let opacity = 1;
    switch (a.motion) {
      case 'drop':
      case 'slide':
        pv.position.set(a.from[0] * (1 - e), a.from[1] * (1 - e), a.from[2] * (1 - e));
        opacity = p <= 0 ? 0 : Math.min(1, p * 6);
        break;
      case 'rise':
      case 'pour': {
        const s = Math.max(1e-4, e);
        pv.scale.set(1, s, 1);
        pv.position.set(0, minY * (1 - s), 0);
        opacity = p <= 0 ? 0 : 1;
        break;
      }
      case 'grow': {
        const s = Math.max(1e-4, e);
        pv.scale.set(s, s, s);
        pv.position.set(cx * (1 - s), minY * (1 - s), cz * (1 - s));
        opacity = p <= 0 ? 0 : 1;
        break;
      }
      case 'fade':
        opacity = e;
        if (rt.plan) {
          rt.plan.material.uniforms.uOpacity.value = e;
          opacity = 1;
        }
        break;
      case 'morph':
        if (rt.morph?.morphTargetInfluences) rt.morph.morphTargetInfluences[0] = e;
        break;
    }
    return { opacity, done: p >= 1 };
  }

  private _m = new THREE.Matrix4();
  private _k = new THREE.Matrix4();

  private applyInstanced(rt: PartRT, clock: number): { opacity: number; done: boolean } {
    const inst = rt.inst as NonNullable<PartRT['inst']>;
    const a = rt.anim;
    const arr = inst.mesh.instanceMatrix.array as Float32Array;
    const m = this._m;
    const k = this._k;
    let done = true;
    for (let i = 0; i < inst.count; i++) {
      const p = Math.min(1, Math.max(0, (clock - a.delay - inst.slots[i] * a.stagger) / Math.max(1e-3, a.duration)));
      const o = i * 16;
      if (p >= 1) {
        for (let j = 0; j < 16; j++) arr[o + j] = inst.base[o + j];
        continue;
      }
      done = false;
      if (p <= 0) {
        for (let j = 0; j < 16; j++) arr[o + j] = 0;
        continue;
      }
      const e = ease(a.ease, p);
      m.fromArray(inst.base, o);
      switch (a.motion) {
        case 'drop':
        case 'slide':
          m.elements[12] += a.from[0] * (1 - e);
          m.elements[13] += a.from[1] * (1 - e);
          m.elements[14] += a.from[2] * (1 - e);
          break;
        case 'grow': {
          const s = Math.max(1e-4, e);
          k.makeScale(s, s, s);
          k.elements[12] = inst.cx * (1 - s);
          k.elements[13] = inst.minY * (1 - s);
          k.elements[14] = inst.cz * (1 - s);
          m.multiply(k);
          break;
        }
        default: {
          // rise / pour: grow along the instance's local +Y from its bottom.
          const s = Math.max(1e-4, e);
          k.makeScale(1, s, 1);
          k.elements[13] = inst.minY * (1 - s);
          m.multiply(k);
        }
      }
      m.toArray(arr, o);
    }
    inst.mesh.instanceMatrix.needsUpdate = true;
    inst.settled = done;
    return { opacity: 1, done };
  }

  private applyExit(rt: PartRT, t: number): { opacity: number; done: boolean } {
    const x = rt.exit;
    if (x.type === 'none') return { opacity: t >= x.delay ? 0 : 1, done: t >= x.delay };
    const q = Math.min(1, Math.max(0, (t - x.delay) / Math.max(1e-3, x.duration)));
    const pv = rt.pivot;
    const lb = rt.localBox;
    switch (x.type) {
      case 'lift':
      case 'sink':
      case 'slide': {
        const e = x.type === 'slide' ? q * q : ease('inOut', q);
        pv.position.set(x.to[0] * e, x.to[1] * e, x.to[2] * e);
        return { opacity: 1 - smooth(0.45, 1, q), done: q >= 1 };
      }
      case 'shrink': {
        const s = Math.max(1e-4, 1 - ease('inOut', q));
        const minY = isFinite(lb.min.y) ? lb.min.y : 0;
        pv.scale.set(s, s, s);
        pv.position.set(((lb.min.x + lb.max.x) / 2) * (1 - s), minY * (1 - s), ((lb.min.z + lb.max.z) / 2) * (1 - s));
        return { opacity: 1, done: q >= 1 };
      }
      default:
        return { opacity: 1 - q, done: q >= 1 };
    }
  }

  // -------------------------------------------------------------------------
  // Looks (materials)
  // -------------------------------------------------------------------------

  private applyLook(rt: PartRT, opacity: number, hl: boolean, muted = false) {
    const o = Math.max(0, Math.min(1, opacity * rt.baseOpacity));
    const visible = o > 0.003;
    rt.root.visible = visible;
    if (!visible) return;
    if (rt.plan) {
      // The plan shader handles its own opacity; fade with the part.
      if (rt.mode !== 'enter' || rt.anim.motion !== 'fade') rt.plan.material.uniforms.uOpacity.value = o;
      return;
    }
    const key = o >= 0.995 ? (hl ? 'H' : muted ? 'M' : 'S') : Math.abs(o - GHOST_OPACITY) < 0.004 ? 'G' : Math.abs(o - XRAY_OPACITY) < 0.004 ? 'X' : 'D';
    if (key === rt.look.key && key !== 'D') return;
    rt.look.key = key;
    const lib = this.lib;
    for (const m of rt.meshes) {
      const base = m.userData.base as THREE.Material | undefined;
      if (!base) continue;
      let mat: THREE.Material;
      if (key === 'S') mat = base;
      else if (key === 'H') mat = lib.highlightOf(base);
      else if (key === 'M') mat = lib.mutedOf(base, rt.isGround ? GROUND_MUTE : 1);
      else if (key === 'G') mat = lib.ghostOf(base);
      else if (key === 'X') mat = lib.xrayOf(base);
      else {
        let dyn = m.userData.dyn as THREE.MeshStandardMaterial | undefined;
        if (!dyn) {
          dyn = base.clone() as THREE.MeshStandardMaterial;
          dyn.transparent = true;
          m.userData.dyn = dyn;
        }
        dyn.opacity = o * base.opacity;
        dyn.depthWrite = o > 0.75;
        if (dyn.emissive) {
          dyn.emissive.copy(hl ? lib.accent : (base as THREE.MeshStandardMaterial).emissive ?? lib.ink);
          dyn.emissiveIntensity = hl ? this.hl * 0.26 : (base as THREE.MeshStandardMaterial).emissiveIntensity ?? 0;
        }
        mat = dyn;
      }
      m.material = mat;
      m.castShadow = o > 0.6 && (rt.part.castShadow ?? !rt.isGround);
    }
    for (const l of rt.lines) {
      const kind = l.userData.kind as string;
      if (kind === 'line') {
        const mat = l.material as THREE.LineBasicMaterial;
        mat.opacity = 0.95 * o;
        continue;
      }
      const inst = kind === 'iedge';
      if (key === 'S') l.material = inst ? lib.instEdge : lib.edge;
      else if (key === 'H') l.material = inst ? lib.instEdgeHighlight : lib.edgeHighlight;
      else if (key === 'M') l.material = inst ? lib.instEdgeMuted : lib.edgeMuted;
      else if (key === 'G') l.material = inst ? lib.instEdgeGhost : lib.edgeGhost;
      else if (key === 'X') l.material = inst ? lib.instEdgeXray : lib.edgeXray;
      else {
        let dyn = l.userData.dyn as THREE.Material | undefined;
        if (!dyn) {
          dyn = (inst ? lib.instEdge : lib.edge).clone();
          l.userData.dyn = dyn;
        }
        if (inst) (dyn as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.42 * o;
        else (dyn as THREE.LineBasicMaterial).opacity = 0.42 * o;
        l.material = dyn;
      }
    }
  }

  // -------------------------------------------------------------------------
  // X-ray
  // -------------------------------------------------------------------------

  private xrayEnabledForStep(): boolean {
    const st = this.timeline.steps[this.step];
    if (!this.xrayOn || !st) return false;
    if (st.view?.xray !== undefined) return st.view.xray;
    // Auto: on when this step's parts sit inside the house footprint.
    const box = new THREE.Box3();
    for (const i of this.timeline.added[this.step] ?? []) {
      const rt = this.rts[i];
      if (rt && !rt.isGround) box.union(rt.box);
    }
    if (box.isEmpty()) return false;
    const c = box.getCenter(new THREE.Vector3());
    return signedDistance([c.x, c.z], this.fp) < 0.3;
  }

  private computeXray(camera: THREE.Camera) {
    const st = this.timeline.steps[this.step];
    if (!st) return;
    const occl = this.xrayEnabledForStep();
    // Interior phases peel what is above the work off (lifted, gone) instead of ghosting it.
    const peel = this.xrayOn && occl && PEEL_PHASES.has(st.phase) && st.view?.xray !== false;
    const above = this.xrayOn ? st.view?.ghostAbove ?? (peel ? this.peelCut() : undefined) : undefined;
    const groundX = !!st.view?.groundXray;
    const ghostTags = this.xrayOn ? st.view?.ghostTags : undefined;
    const samples = occl || above !== undefined ? this.xraySamples() : [];
    const cam = this._cam.setFromMatrixPosition(camera.matrixWorld);
    const need = Math.max(1, Math.ceil(samples.length * 0.08));
    for (const rt of this.rts) {
      if (!rt || rt.mode === 'hidden' || rt.mode === 'ghost') continue;
      let target = 1;
      if (rt.tp.addedAt === this.step) target = 1;
      else if (rt.isGround) target = groundX ? GROUND_XRAY : 1;
      else if (rt.part.xray !== false) {
        let fade = false;
        const tags = rt.part.tags;
        const hide =
          rt.part.material === 'rebar' ||
          !!tags?.some((t) => XRAY_HIDE.has(t) || (st.phase >= CLOSED_FROM_PHASE && XRAY_HIDE_CLOSED.has(t)));
        // ghostAbove: only what is above Y AND actually in front of the work fades, so the far
        // walls keep the house readable instead of dissolving it. Embedded steel / roof layers
        // above Y always go (their slab is faded or they are clutter).
        if (above !== undefined && rt.box.min.y >= above - 0.02) fade = hide || !samples.length || this.occludes(rt, cam, samples, need);
        else if (ghostTags && tags?.some((t) => ghostTags.includes(t))) target = GHOST_OPACITY;
        // Site clutter (toilet, pole, machines) and steel fade as soon as they hide any of the work.
        else if (occl && samples.length) fade = this.occludes(rt, cam, samples, hide || tags?.some((t) => t === 'site-temp' || t === 'machine') ? 1 : need);
        if (fade) target = hide ? 0 : XRAY_OPACITY;
        if (fade && !hide && peel && above !== undefined && rt.box.min.y >= above - 0.02) {
          target = 0;
          this.lifted.add(rt);
        }
      }
      if (rt.xrayTarget !== target) {
        rt.xrayTarget = target;
        this.dirty.add(rt);
      }
    }
  }

  private _cam = new THREE.Vector3();

  /** Default peel height for interior steps that set no ghostAbove: just above the new work. */
  private peelCut(): number | undefined {
    let top = -Infinity;
    for (const i of this.timeline.added[this.step] ?? []) {
      const rt = this.rts[i];
      if (rt && !rt.isGround && rt.part.highlight !== false) top = Math.max(top, rt.box.max.y);
    }
    return isFinite(top) ? top + 0.15 : undefined;
  }

  /**
   * Where the step's callout pin points: a point ON the new parts (the sample nearest the
   * middle of their bounds). null when the step adds nothing to point at.
   */
  calloutAnchor(s = this.step): THREE.Vector3 | null {
    if (s !== this.step) return null;
    const box = new THREE.Box3();
    for (const i of this.timeline.added[s] ?? []) {
      const rt = this.rts[i];
      if (rt && !rt.isGround && rt.part.highlight !== false && !rt.plan) box.union(rt.box);
    }
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3());
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const p of this.xraySamples()) {
      const d = p.distanceToSquared(c);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return (best ?? c).clone();
  }

  /** Points on the current step's parts that the x-ray keeps visible (cached per step). */
  private xraySamples(): THREE.Vector3[] {
    if (this.sampleStep === this.step && this.sampleCache) return this.sampleCache;
    const samples: THREE.Vector3[] = [];
    const tmp = new THREE.Matrix4();
    for (const i of this.timeline.added[this.step] ?? []) {
      const rt = this.rts[i];
      if (!rt || rt.isGround) continue;
      if (rt.inst) {
        const n = rt.inst.count;
        const stepI = Math.max(1, Math.floor(n / 24));
        for (let k = 0; k < n; k += stepI) {
          tmp.fromArray(rt.inst.base, k * 16).premultiply(rt.root.matrixWorld);
          samples.push(new THREE.Vector3().setFromMatrixPosition(tmp));
        }
      } else {
        const b = rt.box;
        const c = b.getCenter(new THREE.Vector3());
        samples.push(c);
        const sx = (b.max.x - b.min.x) * 0.35;
        const sz = (b.max.z - b.min.z) * 0.35;
        for (const [dx, dz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ])
          samples.push(new THREE.Vector3(c.x + dx * sx, b.max.y - 0.02, c.z + dz * sz));
      }
    }
    this.sampleStep = this.step;
    this.sampleCache = samples;
    return samples;
  }

  private sampleStep = -1;
  private sampleCache: THREE.Vector3[] | null = null;

  private occludes(rt: PartRT, cam: THREE.Vector3, samples: THREE.Vector3[], need: number): boolean {
    const boxes = this.instanceBoxes(rt);
    let hits = 0;
    for (const s of samples) {
      let hit = false;
      if (boxes) {
        for (let i = 0; i < boxes.length && !hit; i += 6) hit = segHitsBox(cam, s, boxes, i);
      } else hit = segHitsBox(cam, s, boxArray(rt.box), 0);
      if (hit && ++hits >= need) return true;
    }
    return false;
  }

  private instBoxCache = new WeakMap<PartRT, Float32Array>();
  private instanceBoxes(rt: PartRT): Float32Array | null {
    if (!rt.inst || rt.inst.count > 3000) return null;
    let a = this.instBoxCache.get(rt);
    if (!a) {
      const n = rt.inst.count;
      a = new Float32Array(n * 6);
      const g = rt.inst.mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const gb = g.boundingBox as THREE.Box3;
      const m = new THREE.Matrix4();
      const b = new THREE.Box3();
      for (let i = 0; i < n; i++) {
        m.fromArray(rt.inst.base, i * 16).premultiply(rt.root.matrixWorld);
        b.copy(gb).applyMatrix4(m);
        a.set([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], i * 6);
      }
      this.instBoxCache.set(rt, a);
    }
    return a;
  }

  // -------------------------------------------------------------------------
  // Camera focus
  // -------------------------------------------------------------------------

  focus(s = this.step): Focus {
    const st = this.timeline.steps[s];
    const hint = st?.camera;
    if (hint?.bounds) return { box: new THREE.Box3(new THREE.Vector3(...hint.bounds.min), new THREE.Vector3(...hint.bounds.max)), hint };
    if (hint?.fit === 'house') return { box: this.houseBox.clone(), hint };
    if (hint?.fit === 'site' || hint?.fit === 'plan') return { box: this.siteBox.clone(), hint };
    const box = new THREE.Box3();
    for (const i of this.timeline.added[s] ?? []) {
      const rt = this.rts[i];
      if (rt && !rt.isGround) box.union(rt.box);
    }
    if (box.isEmpty()) for (const i of this.timeline.removed[s] ?? []) if (this.rts[i]) box.union((this.rts[i] as PartRT).box);
    if (box.isEmpty()) box.copy(this.houseBox);
    return { box, hint };
  }

  /** Plan sheet frame (model space, at its flat height) for the intro's top-down view. */
  planBox(): THREE.Box3 | null {
    for (const rt of this.rts) {
      if (rt?.plan) {
        const b = rt.plan.bounds;
        return new THREE.Box3(new THREE.Vector3(b.min[0], rt.plan.flatY, b.min[1]), new THREE.Vector3(b.max[0], rt.plan.flatY, b.max[1]));
      }
    }
    return null;
  }

  /** The step's parts and the step clock, for UI (e.g. autoplay timing). */
  get stepClock() {
    return this.clock;
  }

  dispose() {
    this.planCancel?.();
    this.glow.dispose();
    for (const rt of this.rts) if (rt) disposePart(rt);
    this.lib.dispose();
  }
}

function boxArray(b: THREE.Box3): Float32Array {
  return new Float32Array([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
}

/** Does the segment camera→sample pass through box i (and not just contain the sample)? */
function segHitsBox(c: THREE.Vector3, s: THREE.Vector3, b: Float32Array, i: number): boolean {
  const minx = b[i];
  const miny = b[i + 1];
  const minz = b[i + 2];
  const maxx = b[i + 3];
  const maxy = b[i + 4];
  const maxz = b[i + 5];
  const eps = 0.02;
  if (s.x > minx - eps && s.x < maxx + eps && s.y > miny - eps && s.y < maxy + eps && s.z > minz - eps && s.z < maxz + eps) return false;
  if (c.x > minx && c.x < maxx && c.y > miny && c.y < maxy && c.z > minz && c.z < maxz) return false;
  let t0 = 0;
  let t1 = 0.97;
  const d = [s.x - c.x, s.y - c.y, s.z - c.z];
  const o = [c.x, c.y, c.z];
  const mn = [minx, miny, minz];
  const mx = [maxx, maxy, maxz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < mn[k] || o[k] > mx[k]) return false;
      continue;
    }
    let ta = (mn[k] - o[k]) / d[k];
    let tb = (mx[k] - o[k]) / d[k];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
