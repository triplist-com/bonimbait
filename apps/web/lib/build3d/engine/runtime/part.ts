/**
 * Builds the three.js objects of one Part:
 *   root (part position/rotationY) → pivot (entry/exit animation transform) → meshes (+ edges)
 * and keeps everything the director needs to animate and restyle it.
 */
import * as THREE from 'three';
import { createModel } from '../../models';
import type { HouseModel } from '../../house/types';
import { instancePoints, instanceSlots, normalizeAnim, normalizeExit, type NormAnim, type NormExit } from '../anim';
import { PALETTE } from '../palette';
import type { MaterialKey, Part } from '../types';
import type { TimelinePart } from '../timeline';
import {
  buildDrape,
  buildInstanced,
  buildPlan,
  buildPrimitive,
  buildTerrain,
  edgesOf,
  instancedEdges,
  isSharedGeometry,
} from './geometry';
import type { MaterialLibrary } from './materials';

export type Mode = 'hidden' | 'enter' | 'shown' | 'leave' | 'appear' | 'vanish' | 'ghost';

export interface InstancedState {
  mesh: THREE.InstancedMesh;
  /** Final (settled) matrices. */
  base: Float32Array;
  slots: Float32Array;
  count: number;
  /** Base geometry bounds (local, for pivots). */
  minY: number;
  cx: number;
  cz: number;
  /** All instances are at their final matrices. */
  settled: boolean;
}

export interface PartRT {
  tp: TimelinePart;
  part: Part;
  anim: NormAnim;
  exit: NormExit;
  root: THREE.Group;
  pivot: THREE.Group;
  meshes: THREE.Mesh[];
  lines: THREE.LineSegments[];
  inst?: InstancedState;
  /** Bounds in world space at rest. */
  box: THREE.Box3;
  /** Local (pivot space) bounds for animation pivots. */
  localBox: THREE.Box3;
  morph?: THREE.Mesh;
  plan?: ReturnType<typeof buildPlan>;
  animate?: (t: number) => void;
  isGround: boolean;
  matKey?: MaterialKey;
  /** Has outlines (its materials keep the polygon offset). */
  edges: boolean;
  // --- dynamic state (director) ---
  mode: Mode;
  /** Director clock time the current transition started at. */
  t0: number;
  /** Current x-ray multiplier target and value. */
  xrayTarget: number;
  xrayValue: number;
  look: { opacity: number; hl: boolean; key: string };
  baseOpacity: number;
}

const NO_EDGE_MODELS = new Set(['tree', 'tree-olive', 'palm', 'bush', 'rock', 'worker', 'surveyor', 'planter']);

function defaultEdges(p: Part): boolean {
  if (p.edges !== undefined) return p.edges;
  const k = p.shape.kind;
  if (k === 'terrain' || k === 'drape' || k === 'lines' || k === 'plan' || k === 'rods') return false;
  if (k === 'model') return !NO_EDGE_MODELS.has(p.shape.name);
  return PALETTE[p.material].edges;
}

/** Base palette key for a part at a given step (fresh concrete darkens the pour step). */
export function materialKeyAt(p: Part, age: number): MaterialKey {
  if (p.material === 'concrete' && age <= 0) return 'concreteFresh';
  return p.material;
}

export function buildPart(tp: TimelinePart, lib: MaterialLibrary, house: HouseModel): PartRT {
  const part = tp.part;
  const root = new THREE.Group();
  root.name = part.id;
  if (part.position) root.position.set(...part.position);
  if (part.rotationY) root.rotation.y = part.rotationY;
  const pivot = new THREE.Group();
  root.add(pivot);
  const meshes: THREE.Mesh[] = [];
  const lines: THREE.LineSegments[] = [];
  const isGround = part.tags?.includes('ground') ?? false;
  const edges = defaultEdges(part);
  const cast = part.castShadow ?? !(isGround || part.shape.kind === 'lines' || part.material === 'hole');
  const receive = part.receiveShadow ?? true;
  let inst: InstancedState | undefined;
  let morph: THREE.Mesh | undefined;
  let plan: PartRT['plan'];
  let animate: PartRT['animate'];
  const anim = normalizeAnim(part);
  const s = part.shape;

  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.userData.base = mat;
    pivot.add(m);
    meshes.push(m);
    if (edges) {
      const l = new THREE.LineSegments(edgesOf(geo), lib.edge);
      l.userData.kind = 'edge';
      m.add(l);
      lines.push(l);
    }
    return m;
  };

  switch (s.kind) {
    case 'boxes':
    case 'rods':
    case 'instances': {
      const b = buildInstanced(s);
      const mat = lib.get(part.material, part.color, { offset: edges });
      const mesh = new THREE.InstancedMesh(b.geometry, mat, b.count);
      mesh.instanceMatrix.array.set(b.matrices);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.userData.base = mat;
      pivot.add(mesh);
      meshes.push(mesh);
      if (!b.geometry.boundingBox) b.geometry.computeBoundingBox();
      const gb = b.geometry.boundingBox as THREE.Box3;
      const pts = instancePoints(part) ?? [];
      inst = {
        mesh,
        base: b.matrices,
        slots: instanceSlots(pts, anim),
        count: b.count,
        minY: gb.min.y,
        cx: (gb.min.x + gb.max.x) / 2,
        cz: (gb.min.z + gb.max.z) / 2,
        settled: true,
      };
      if (edges) {
        const eg = instancedEdges(b.geometry, mesh.instanceMatrix, b.count);
        const l = new THREE.LineSegments(eg, lib.instEdge);
        l.frustumCulled = false;
        l.userData.kind = 'iedge';
        mesh.add(l);
        lines.push(l);
      }
      break;
    }
    case 'terrain': {
      const geo = buildTerrain(s);
      const m = addMesh(geo, lib.get(part.material, part.color, { vertexColors: true }));
      if (s.from) {
        m.morphTargetInfluences = [1];
        morph = m;
      }
      break;
    }
    case 'drape':
      addMesh(buildDrape(s), lib.get(part.material, part.color, { offset: edges })).castShadow = false;
      break;
    case 'lines': {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(s.points.flat(), 3));
      const mat = new THREE.LineBasicMaterial({ color: part.color ?? PALETTE[part.material].color, transparent: true, opacity: 0.95 });
      const l = new THREE.LineSegments(g, mat);
      l.userData.base = mat;
      l.userData.kind = 'line';
      pivot.add(l);
      lines.push(l);
      break;
    }
    case 'plan': {
      plan = buildPlan(s, house);
      const m = new THREE.Mesh(plan.geometry, plan.material);
      m.renderOrder = 2;
      m.userData.base = plan.material;
      m.userData.kind = 'plan';
      pivot.add(m);
      meshes.push(m);
      break;
    }
    case 'model': {
      const obj = createModel(s.name, { size: s.size, seed: s.seed, color: s.color ?? part.color, pose: s.pose });
      animate = obj.userData.animate as PartRT['animate'];
      pivot.add(obj);
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = cast;
        m.receiveShadow = receive;
        const mat = m.material as THREE.Material;
        if (!Array.isArray(m.material)) {
          // Model materials are shared by the model kit; give them the outline offset once.
          if (edges && !mat.polygonOffset) {
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = 1;
            mat.polygonOffsetUnits = 1;
            mat.needsUpdate = true;
          }
          m.userData.base = mat;
        }
        meshes.push(m);
        if (edges && !mat.transparent) {
          const l = new THREE.LineSegments(edgesOf(m.geometry, 35), lib.edge);
          l.userData.kind = 'edge';
          m.add(l);
          lines.push(l);
        }
      });
      break;
    }
    default: {
      addMesh(buildPrimitive(s), lib.get(part.material, part.color, { offset: edges }));
    }
  }

  root.updateMatrixWorld(true);
  const localBox = new THREE.Box3();
  if (inst) {
    const g = inst.mesh.geometry;
    const gb = g.boundingBox as THREE.Box3;
    const m = new THREE.Matrix4();
    const tmp = new THREE.Box3();
    for (let i = 0; i < inst.count; i++) {
      m.fromArray(inst.base, i * 16);
      tmp.copy(gb).applyMatrix4(m);
      localBox.union(tmp);
    }
  } else {
    localBox.setFromObject(pivot, false);
    // setFromObject is in world space; convert back into pivot space.
    const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
    localBox.applyMatrix4(inv);
  }
  const box = localBox.clone().applyMatrix4(pivot.matrixWorld);

  return {
    tp,
    part,
    anim,
    exit: normalizeExit(part),
    root,
    pivot,
    meshes,
    lines,
    inst,
    box,
    localBox,
    morph,
    plan,
    animate,
    isGround,
    matKey: s.kind === 'model' || s.kind === 'plan' || s.kind === 'lines' ? undefined : part.material,
    edges,
    mode: 'hidden',
    t0: 0,
    xrayTarget: 1,
    xrayValue: 1,
    look: { opacity: -1, hl: false, key: '' },
    baseOpacity: part.opacity ?? 1,
  };
}

/** Frees per-part GPU resources (shared geometries/materials are kept). */
export function disposePart(rt: PartRT) {
  rt.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.userData.dyn) (m.userData.dyn as THREE.Material).dispose();
    if ((m as THREE.Mesh).isMesh && rt.part.shape.kind !== 'model' && !isSharedGeometry(m.geometry)) m.geometry.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  rt.plan?.material.dispose();
  rt.plan?.material.uniforms.map.value?.dispose();
}
