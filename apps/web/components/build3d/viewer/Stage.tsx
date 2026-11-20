'use client';

/**
 * The 3D stage: canvas, light rig, soft floor shadow, camera controls and the
 * imperative Director that plays the timeline. Per-frame work lives in useFrame
 * (no React state updates while animating).
 */
import { CameraControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Director, type Focus } from '@/lib/build3d/engine/runtime/director';
import type { Timeline } from '@/lib/build3d/engine/timeline';
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
}

const DEG = Math.PI / 180;
const FOV = 32;

export default function Stage(props: StageProps) {
  return (
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
      <Scene {...props} />
    </Canvas>
  );
}

function Scene({ house, timeline, step, ghost, xray, autoRotate, resetTick, intro, insets, mobile, lighting = 'day', onIntroDone }: StageProps) {
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
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __b3d?: unknown }).__b3d = { director, controls, introState, gl, scene, camera };
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
    const south = new THREE.Vector2(Math.sin(front), Math.cos(front));
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
    const hemi = new THREE.HemisphereLight('#EEF3FA', '#CFC7B8', 0.95);
    const fill = new THREE.DirectionalLight('#DDE8FF', 0.35);
    fill.position.copy(center).add(new THREE.Vector3(-sw.x * 40, 25, -sw.y * 40));
    fill.target.position.copy(center);
    // Dusk: low warm sun from the west.
    const duskDir = new THREE.Vector3(sw.x * 1.6 - south.y * 0.6, 0.45, sw.y * 1.6 + south.x * 0.6).normalize();
    return { sun, hemi, fill, center, radius, sunDir, duskDir };
  }, [ctx, mobile]);

  useEffect(() => {
    duskTarget.current = lighting === 'dusk' ? 1 : 0;
    invalidate();
  }, [lighting, invalidate]);

  const applyDusk = (k: number) => {
    const { sun, hemi, fill, center, sunDir, duskDir } = lights;
    const dir = sunDir.clone().lerp(duskDir, k).normalize();
    sun.position.copy(center).addScaledVector(dir, 60);
    sun.color.set('#FFF7EE').lerp(new THREE.Color('#FF9A55'), k);
    sun.intensity = 2.05 - 1.2 * k;
    hemi.color.set('#EEF3FA').lerp(new THREE.Color('#6C7BA8'), k);
    hemi.groundColor.set('#CFC7B8').lerp(new THREE.Color('#5A4636'), k);
    hemi.intensity = 0.95 - 0.4 * k;
    fill.intensity = 0.35 * (1 - k);
    scene.environmentIntensity = 0.42 * (1 - 0.6 * k);
    director.lib.setDusk(k);
  };

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
    let dist = hint?.distance ?? (r / Math.sin(fit / 2)) * (site ? 0.92 : 0.98) * (hint?.zoom ?? 1);
    dist = Math.min(150, Math.max(7, dist));
    const az =
      hint?.azimuth !== undefined ? director.frontAzimuth + hint.azimuth * DEG : userAngles.current?.az ?? director.frontAzimuth + 35 * DEG;
    const polar = hint?.polar !== undefined && !userAngles.current ? hint.polar * DEG : userAngles.current?.polar ?? (hint?.polar ?? 55) * DEG;
    const sp = Math.sin(polar);
    const pos = new THREE.Vector3(sp * Math.sin(az), Math.cos(polar), sp * Math.cos(az)).multiplyScalar(dist).add(center);
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
      introState.current = 'none';
      frame(director.focus(step), first);
    }
    stepOrbit.current = timeline.steps[step]?.camera?.orbit ? performance.now() + 1400 : 0;
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

  useFrame((_, dt) => {
    const c = controls.current;
    let busy = director.update(dt, camera);
    if (Math.abs(dusk.current - duskTarget.current) > 0.001) {
      dusk.current += (duskTarget.current - dusk.current) * Math.min(1, dt * 1.6);
      if (Math.abs(dusk.current - duskTarget.current) < 0.002) dusk.current = duskTarget.current;
      applyDusk(dusk.current);
      busy = true;
    }
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
    if ((autoplayRotate.current || orbiting) && c) {
      c.azimuthAngle += dt * (orbiting && !autoplayRotate.current ? 0.1 : 0.14);
    }
    // Build the rest of the timeline in small idle slices.
    if (prebuilding.current && !busy) prebuilding.current = director.prebuild(4);
    if (busy || autoplayRotate.current || stepOrbit.current > 0 || prebuilding.current) invalidate();
  });

  return (
    <>
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
