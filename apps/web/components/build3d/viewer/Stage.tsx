'use client';

/**
 * The 3D stage: canvas, light rig, soft floor shadow, camera controls and the
 * imperative Director that plays the timeline. Per-frame work lives in useFrame
 * (no React state updates while animating).
 */
import { CameraControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Director, type Focus } from '@/lib/build3d/engine/runtime/director';
import { getTimeline, type Timeline } from '@/lib/build3d/engine/timeline';
import { house as sampleHouse } from '@/lib/build3d/house';
import { getContext } from '@/lib/build3d/steps/context';
import type { HouseModel } from '@/lib/build3d/house/types';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface StageProps {
  house: HouseModel;
  timeline: Timeline;
  step: number;
  ghost: boolean;
  xray: boolean;
  autoRotate: boolean;
  /** Increment to re-frame the camera on the current step (reset). */
  resetTick: number;
  intro: boolean;
  insets: Insets;
  mobile: boolean;
  lighting?: 'day' | 'dusk';
  onIntroDone?: () => void;
  /** "New this step" emphasis: resting tint on the step's parts, finished parts muted, callout pin. Default on. */
  emphasis?: boolean;
  /** prefers-reduced-motion: instant camera cuts, no step orbit, no pulse / peel lift. */
  reducedMotion?: boolean;
  /** Callout pin on the step's new parts (number + short label). */
  callout?: { n: number; label: string } | null;
}

type SceneProps = StageProps & { calloutEl: React.RefObject<HTMLDivElement> };

const DEG = Math.PI / 180;
const FOV = 32;
/** Step-requested slow orbit (rad/s). */
const ORBIT_SPEED = 0.1;
/** Dusk sun: degrees to the camera's left of its azimuth, and elevation (long shadows). */
const DUSK_SUN_AZ = 58;
const DUSK_SUN_EL = 13;
const DAY_SUN = new THREE.Color('#FFF7EE');
const DAY_SKY = new THREE.Color('#EEF3FA');
const DAY_GROUND = new THREE.Color('#CFC7B8');
const DUSK_SUN = new THREE.Color('#FFD1A0');
const DUSK_SKY = new THREE.Color('#93ABDD');
const DUSK_GROUND = new THREE.Color('#5E4A3B');

// The viewer chunk is prefetched while the landing's analysis animation plays: build the
// (memoized) step timeline in idle time then, so the viewer opens without a build pause.
if (typeof window !== 'undefined') {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const warm = () => void getTimeline(sampleHouse);
  if (w.requestIdleCallback) w.requestIdleCallback(warm, { timeout: 3000 });
  else window.setTimeout(warm, 400);
}

export default function Stage(props: StageProps) {
  const calloutEl = useRef<HTMLDivElement>(null);
  return (
    <>
    <Canvas
      className="!absolute inset-0"
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={[1, props.mobile ? 2 : 2]}
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ fov: FOV, near: 0.3, far: 600, position: [40, 40, 60] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.0;
        gl.setClearColor(0x000000, 0);
      }}
    >
      <Scene {...props} calloutEl={calloutEl} />
    </Canvas>
    <StepCallout ref={calloutEl} callout={props.callout} reducedMotion={props.reducedMotion} />
    </>
  );
}

/**
 * Numbered pin over the step's new parts (positioned every rendered frame by the Scene, no
 * React state per frame). Hidden while the camera moves and outside the unobstructed area.
 */
const StepCallout = forwardRef<HTMLDivElement, { callout?: StageProps['callout']; reducedMotion?: boolean }>(function StepCallout(
  { callout, reducedMotion },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-b3d-callout
      className="pointer-events-none absolute left-0 top-0 z-[1] opacity-0 transition-opacity duration-300 will-change-transform"
      style={{ transform: 'translate3d(-999px,-999px,0)' }}
    >
      {callout && (
        <div key={callout.n} className="flex -translate-x-1/2 -translate-y-full flex-col items-center">
          <div className="flex max-w-[220px] items-center gap-1.5 rounded-full bg-white/95 py-1 pe-3 ps-1 shadow-[0_6px_18px_-6px_rgba(35,31,32,0.45)] ring-1 ring-primary/25">
            <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary px-1 text-[12px] font-black tabular-nums text-white">{callout.n}</span>
            <span className="truncate text-[12.5px] font-bold leading-none text-ink">{callout.label}</span>
          </div>
          <span className="h-5 w-[2px] bg-primary/80" />
          <span className="relative grid h-3 w-3 place-items-center">
            {!reducedMotion && <span className="absolute inset-0 animate-ping-soft rounded-full bg-primary/50" />}
            <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-primary shadow" />
          </span>
        </div>
      )}
    </div>
  );
});

function Scene({
  house,
  timeline,
  step,
  ghost,
  xray,
  autoRotate,
  resetTick,
  intro,
  insets,
  mobile,
  lighting = 'day',
  onIntroDone,
  emphasis = true,
  reducedMotion = false,
  callout,
  calloutEl,
}: SceneProps) {
  const { gl, scene, camera, invalidate, size } = useThree();
  const controls = useRef<CameraControls>(null);
  const director = useMemo(() => new Director(house, timeline), [house, timeline]);
  const ctx = useMemo(() => getContext(house), [house]);
  const userAngles = useRef<{ az: number; polar: number } | null>(null);
  const introState = useRef<'none' | 'hold' | 'glide'>(intro ? 'hold' : 'none');
  const lastStep = useRef(-1);
  const prebuilding = useRef(true);
  const autoplayRotate = useRef(false);
  /** Step-requested slow orbit (camera.orbit), stops when the user grabs the camera. */
  const stepOrbit = useRef(0);
  const duskTarget = useRef(lighting === 'dusk' ? 1 : 0);
  const dusk = useRef(duskTarget.current);
  /** Dev-only capture hooks: freeze the camera (no orbit) or advance the orbit by sim seconds. */
  const dbg = useRef({ freeze: false, orbitBy: (secs: number) => void secs });

  // --- environment (soft reflections / fill) --------------------------------
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.42;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    // Debug handle for headless checks (dev only).
    if (process.env.NODE_ENV !== 'production') {
      dbg.current.orbitBy = (secs: number) => {
        const c = controls.current;
        if (c) c.azimuthAngle += secs * ORBIT_SPEED;
      };
      (window as unknown as { __b3d?: unknown }).__b3d = { director, controls, introState, gl, scene, camera, stage: dbg.current };
    }
    director.onChange = () => invalidate();
    return () => {
      director.onChange = undefined;
    };
  }, [director, invalidate, gl, scene, camera]);

  useEffect(() => () => director.dispose(), [director]);

  // --- light rig ---------------------------------------------------------------
  const lights = useMemo(() => {
    const lb = ctx.lot.bbox;
    const center = new THREE.Vector3((lb.min[0] + lb.max[0]) / 2, 0, (lb.min[1] + lb.max[1]) / 2);
    const radius = Math.hypot(lb.max[0] - lb.min[0], lb.max[1] - lb.min[1]) / 2 + 8;
    // Sun over the viewer's left shoulder (relative to the street-front view) so soft
    // shadows fall back-right and stay readable; ~48° high.
    const front = (() => {
      const inv = ctx.lot.street.inward;
      return Math.atan2(-inv[0], -inv[1]);
    })();
    const sAz = front - 62 * DEG;
    const sw = new THREE.Vector2(Math.sin(sAz), Math.cos(sAz));
    const sunDir = new THREE.Vector3(sw.x, 1.12, sw.y).normalize();
    const sun = new THREE.DirectionalLight('#FFF7EE', 2.05);
    sun.position.copy(center).addScaledVector(sunDir, 60);
    sun.target.position.copy(center);
    sun.castShadow = true;
    const s = mobile ? 1024 : 2048;
    sun.shadow.mapSize.set(s, s);
    const cam = sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 10;
    cam.far = 140;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    const hemi = new THREE.HemisphereLight('#EEF3FA', '#CFC7B8', 1.05);
    const fill = new THREE.DirectionalLight('#DDE8FF', 0.55);
    fill.position.copy(center).add(new THREE.Vector3(-sw.x * 40, 25, -sw.y * 40));
    fill.target.position.copy(center);
    return { sun, hemi, fill, center, radius, sunDir };
  }, [ctx, mobile]);

  // Dusk backdrop: a full-screen gradient drawn first (deep blue overhead → amber horizon glow
  // on the sun side). Opaque at dusk, so it replaces the page's CSS gradient behind the canvas.
  const sky = useMemo(() => makeSky(), []);
  useEffect(() => () => {
    sky.geometry.dispose();
    sky.material.dispose();
  }, [sky]);

  useEffect(() => {
    duskTarget.current = lighting === 'dusk' ? 1 : 0;
    invalidate();
  }, [lighting, invalidate]);

  // A deep link straight into a dusk step starts AT dusk: apply the current level once
  // (the per-frame easing only runs while the level is moving).
  useEffect(() => {
    applyDusk(dusk.current);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lights, director]);

  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _duskDir = useMemo(() => new THREE.Vector3(), []);
  const _sunScreen = useMemo(() => new THREE.Vector3(), []);

  /**
   * Golden hour: a low warm sun raking in from the camera's front-left (it follows the
   * camera's azimuth, like a turntable under studio light, so every orbit frame has a lit
   * facade and a cool shaded one with long shadows), a cool blue sky fill, less environment.
   */
  function applyDusk(k: number) {
    const { sun, hemi, fill, center, sunDir } = lights;
    const az = (controls.current?.azimuthAngle ?? director.frontAzimuth + 35 * DEG) - DUSK_SUN_AZ * DEG;
    const el = DUSK_SUN_EL * DEG;
    _duskDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const dir = _dir.copy(sunDir).lerp(_duskDir, k).normalize();
    sun.position.copy(center).addScaledVector(dir, 70);
    sun.color.copy(DAY_SUN).lerp(DUSK_SUN, k);
    sun.intensity = 2.05 + (2.6 - 2.05) * k;
    hemi.color.copy(DAY_SKY).lerp(DUSK_SKY, k);
    hemi.groundColor.copy(DAY_GROUND).lerp(DUSK_GROUND, k);
    hemi.intensity = 1.05 - 0.22 * k;
    fill.intensity = 0.55 * (1 - k);
    scene.environmentIntensity = 0.42 * (1 - 0.55 * k);
    gl.toneMappingExposure = 1 + 0.06 * k;
    const u = sky.material.uniforms;
    u.uLevel.value = k;
    // Where the sun sits on screen (the warm glow follows it).
    _sunScreen.copy(camera.position).addScaledVector(_duskDir, 1000).project(camera);
    (u.uSun.value as THREE.Vector2).set(THREE.MathUtils.clamp(_sunScreen.x, -2.2, 2.2), -0.55);
    (u.uAspect as { value: number }).value = size.width / Math.max(1, size.height);
    sky.visible = k > 0.003;
    floor.visible = k < 0.6;
    director.setDusk(k);
  }

  // --- floor (shadow catcher + soft contact blob) ------------------------------
  const floor = useMemo(() => {
    const g = new THREE.Group();
    const y = ctx.terrain.baseY - 0.02;
    const tb = ctx.terrain.bounds;
    const cx = (tb.min[0] + tb.max[0]) / 2;
    const cz = (tb.min[1] + tb.max[1]) / 2;
    const plane = new THREE.Mesh(new THREE.CircleGeometry(lights.radius * 2.2, 64), new THREE.ShadowMaterial({ opacity: 0.12, color: '#3A2E22' }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, y, cz);
    plane.receiveShadow = true;
    g.add(plane);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    if (x) {
      const grd = x.createRadialGradient(64, 64, 10, 64, 64, 64);
      grd.addColorStop(0, 'rgba(60,45,30,0.22)');
      grd.addColorStop(0.55, 'rgba(60,45,30,0.10)');
      grd.addColorStop(1, 'rgba(60,45,30,0)');
      x.fillStyle = grd;
      x.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const w = (tb.max[0] - tb.min[0]) * 1.5;
    const d = (tb.max[1] - tb.min[1]) * 1.5;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(cx, y - 0.01, cz);
    g.add(blob);
    return g;
  }, [ctx, lights.radius]);

  // --- camera framing -------------------------------------------------------------
  const frame = (focus: Focus, instant: boolean) => {
    const c = controls.current;
    if (!c) return;
    const hint = focus.hint;
    const box = focus.box;
    const site = hint?.fit === 'site' || hint?.fit === 'plan';
    const center = hint?.target ? new THREE.Vector3(...hint.target) : box.getCenter(new THREE.Vector3());
    const r = Math.max(3.2, box.getBoundingSphere(new THREE.Sphere()).radius);
    const w = Math.max(200, size.width - insets.left - insets.right);
    const h = Math.max(200, size.height - insets.top - insets.bottom);
    const vfov = FOV * DEG * (h / size.height);
    const hfov = 2 * Math.atan(Math.tan((FOV * DEG) / 2) * (w / size.height));
    const fit = Math.min(vfov, hfov);
    // Portrait (phones): never zoom in past the fit, or wide hero shots crop the house.
    const portrait = h > w * 1.05;
    const zoom = portrait ? Math.max(1, hint?.zoom ?? 1) : hint?.zoom ?? 1;
    let dist = hint?.distance ?? (r / Math.sin(fit / 2)) * (site && !portrait ? 0.92 : 0.98) * zoom;
    dist = Math.min(150, Math.max(7, dist));
    const az =
      hint?.azimuth !== undefined ? director.frontAzimuth + hint.azimuth * DEG : userAngles.current?.az ?? director.frontAzimuth + 35 * DEG;
    const polar = hint?.polar !== undefined && !userAngles.current ? hint.polar * DEG : userAngles.current?.polar ?? (hint?.polar ?? 55) * DEG;
    const sp = Math.sin(polar);
    const pos = new THREE.Vector3(sp * Math.sin(az), Math.cos(polar), sp * Math.cos(az)).multiplyScalar(dist).add(center);
    instant = instant || reducedMotion;
    void c.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, !instant);
    const wpp = (2 * dist * Math.tan((FOV * DEG) / 2)) / size.height;
    // camera-controls negates focal y: +y moves the camera down (target appears higher).
    void c.setFocalOffset(((insets.right - insets.left) / 2) * wpp, ((insets.bottom - insets.top) / 2) * wpp, 0, !instant);
  };

  // Step changes.
  useEffect(() => {
    const c = controls.current;
    const first = lastStep.current < 0;
    lastStep.current = step;
    director.setStep(step);
    if (first && intro && step === 0) {
      director.startIntro();
      // Top-down over the plan, drawing-up = screen-up.
      // Top-down on the plan frame, filling the screen like the landing's 2D sheet.
      const b = director.planBox() ?? director.focus(0).box;
      const center = b.getCenter(new THREE.Vector3());
      const halfV = Math.max((b.max.z - b.min.z) / 2, ((b.max.x - b.min.x) / 2) * (size.height / size.width));
      const dist = (halfV * 1.04) / Math.tan((FOV * DEG) / 2);
      if (c) {
        void c.setLookAt(center.x, center.y + dist, center.z + 0.001, center.x, center.y, center.z, false);
        void c.setFocalOffset(0, 0, 0, false);
      }
      introState.current = 'hold';
    } else {
      if (introState.current !== 'none') {
        // The intro was cut short by a step change: restore the normal camera pace and release the UI.
        if (c) c.smoothTime = 0.55;
        if (!first) onIntroDone?.();
      }
      introState.current = 'none';
      frame(director.focus(step), first);
    }
    stepOrbit.current = timeline.steps[step]?.camera?.orbit && !reducedMotion ? performance.now() + 1400 : 0;
    anchor.current = director.calloutAnchor(step);
    calloutT.current = performance.now();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, director]);

  useEffect(() => {
    if (lastStep.current < 0 || introState.current !== 'none') return;
    userAngles.current = null;
    frame(director.focus(director.step), false);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTick, insets.left, insets.right, insets.top, insets.bottom, size.width, size.height]);

  useEffect(() => {
    director.setGhost(ghost);
    invalidate();
  }, [ghost, director, invalidate]);
  useEffect(() => {
    director.setXray(xray);
    invalidate();
  }, [xray, director, invalidate]);

  useEffect(() => {
    autoplayRotate.current = autoRotate;
    invalidate();
  }, [autoRotate, invalidate]);

  useEffect(() => {
    director.setFocus(emphasis);
    invalidate();
  }, [emphasis, director, invalidate]);
  useEffect(() => {
    director.reducedMotion = reducedMotion;
  }, [reducedMotion, director]);

  // --- callout pin ---------------------------------------------------------------
  const anchor = useRef<THREE.Vector3 | null>(null);
  /** When the current step started / the camera last moved (ms). */
  const calloutT = useRef(0);
  const lastCam = useMemo(() => new THREE.Matrix4(), []);
  const _proj = useMemo(() => new THREE.Vector3(), []);
  const calloutShown = useRef(false);
  const calloutOn = !!callout && emphasis;
  const placeCallout = () => {
    const el = calloutEl.current;
    if (!el) return;
    const now = performance.now();
    if (!lastCam.equals(camera.matrixWorld)) {
      lastCam.copy(camera.matrixWorld);
      calloutT.current = Math.max(calloutT.current, now - 400);
    }
    const a = anchor.current;
    let show = calloutOn && !!a && introState.current === 'none' && dusk.current < 0.05 && !autoplayRotate.current && stepOrbit.current === 0;
    // Wait for the camera to settle (and the step's parts to start appearing).
    const wait = calloutT.current + 650 - now;
    if (show && wait > 0) {
      show = false;
      invalidate();
    }
    if (show && a) {
      const v = _proj.copy(a).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      // Keep it in the unobstructed area (the pill sits ~60 px above the point).
      if (v.z > 1 || x < insets.left + 120 || x > size.width - insets.right - 120 || y < insets.top + 70 || y > size.height - insets.bottom - 12) show = false;
      else {
        const tr = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        if (el.dataset.tr !== tr) {
          el.dataset.tr = tr;
          el.style.transform = tr;
        }
      }
    }
    if (show !== calloutShown.current) {
      calloutShown.current = show;
      el.style.opacity = show ? '1' : '0';
    }
  };

  useFrame((_, dt) => {
    const c = controls.current;
    let busy = director.update(dt, camera);
    if (Math.abs(dusk.current - duskTarget.current) > 0.001) {
      dusk.current += (duskTarget.current - dusk.current) * Math.min(1, dt * 1.6);
      if (Math.abs(dusk.current - duskTarget.current) < 0.002) dusk.current = duskTarget.current;
      applyDusk(dusk.current);
      busy = true;
    } else if (dusk.current > 0.001) applyDusk(dusk.current); // the dusk sun follows the camera
    if (introState.current === 'hold' && director.introPhase() === 'glide' && c) {
      introState.current = 'glide';
      c.smoothTime = 1.15;
      frame(director.focus(0), false);
    }
    if (introState.current === 'glide' && director.introPhase() === 'done' && c) {
      introState.current = 'none';
      c.smoothTime = 0.55;
      onIntroDone?.();
    }
    const orbiting = stepOrbit.current > 0 && performance.now() > stepOrbit.current;
    if ((autoplayRotate.current || orbiting) && c && !dbg.current.freeze) {
      c.azimuthAngle += dt * (orbiting && !autoplayRotate.current ? ORBIT_SPEED : 0.14);
    }
    // Build the rest of the timeline in small idle slices.
    if (prebuilding.current && !busy) prebuilding.current = director.prebuild(4);
    placeCallout();
    if (busy || autoplayRotate.current || stepOrbit.current > 0 || prebuilding.current) invalidate();
  });

  return (
    <>
      <primitive object={sky} />
      <primitive object={lights.hemi} />
      <primitive object={lights.sun} />
      <primitive object={lights.sun.target} />
      <primitive object={lights.fill} />
      <primitive object={lights.fill.target} />
      <primitive object={floor} />
      <primitive object={director.root} />
      <CameraControls
        ref={controls}
        makeDefault
        smoothTime={0.55}
        draggingSmoothTime={0.12}
        minDistance={3}
        maxDistance={180}
        maxPolarAngle={88 * DEG}
        dollyToCursor
        onStart={() => {
          const c = controls.current;
          stepOrbit.current = 0;
          if (!c) return;
          // Remember the user's view angles for the next step framings.
          setTimeout(() => {
            const cc = controls.current;
            if (cc) userAngles.current = { az: cc.azimuthAngle, polar: cc.polarAngle };
          }, 0);
        }}
        onEnd={() => {
          const c = controls.current;
          if (c) userAngles.current = { az: c.azimuthAngle, polar: c.polarAngle };
        }}
      />
    </>
  );
}

/** Full-screen dusk gradient (drawn first, no depth): deep blue overhead, amber low on the sun side. */
function makeSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uLevel: { value: 0 },
      uSun: { value: new THREE.Vector2(-0.6, -0.55) },
      uAspect: { value: 1.6 },
      uTop: { value: new THREE.Color('#0C1838') },
      uMid: { value: new THREE.Color('#2F4B80') },
      uLow: { value: new THREE.Color('#A98597') },
      uHorizon: { value: new THREE.Color('#F4A660') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vNdc;
      void main() {
        vNdc = position.xy * 2.0;
        gl_Position = vec4(position.xy * 2.0, 1.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLevel;
      uniform vec2 uSun;
      uniform float uAspect;
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uLow;
      uniform vec3 uHorizon;
      varying vec2 vNdc;
      void main() {
        float y = vNdc.y * 0.5 + 0.5;
        vec3 c = mix(uLow, uMid, smoothstep(0.18, 0.66, y));
        c = mix(c, uTop, smoothstep(0.6, 1.05, y));
        // Amber horizon glow low in the frame, reaching higher on the sun side.
        vec2 d = (vNdc - uSun) * vec2(uAspect * 0.45, 0.85);
        float g = exp(-dot(d, d) * 1.1);
        float band = 1.0 - smoothstep(0.0, 0.42 + 0.22 * g, y);
        c = mix(c, uHorizon, clamp(band * (0.55 + 0.45 * g) + g * 0.25, 0.0, 1.0));
        gl_FragColor = vec4(c, uLevel);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1e6;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'dusk-sky';
  return mesh;
}
