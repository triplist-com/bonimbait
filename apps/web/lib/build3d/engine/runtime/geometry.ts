/**
 * Shape → three.js geometry. Primitives are built in WORLD coordinates of the part
 * (before the part's position/rotationY). Instanced shapes return a unit base
 * geometry + per-instance matrices. Terrain builds the soil "cake" with optional
 * morph target; the plan drape builds its own shader material.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clipPolygonConvex, pointInPolygon, sampleGrid } from '../../house/geometry';
import type { HouseModel, SheetViewport, TerrainGrid } from '../../house/types';
import type { DrapeShape, InstancedShape, PlanShape, PrimitiveShape, TerrainShape, TubeShape, Vec2, Vec3 } from '../types';

const UP = new THREE.Vector3(0, 1, 0);

function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  out.clearGroups();
  return out;
}

function rodGeometry(a: Vec3, b: Vec3, r: number, seg: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb) || 1e-4;
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  g.translate(va.x, va.y, va.z);
  return g;
}

function tubeGeometry(s: TubeShape): THREE.BufferGeometry {
  const pts = s.points.map((p) => new THREE.Vector3(...p));
  if (s.closed && pts.length > 2) pts.push(pts[0].clone());
  const bend = s.bend ?? s.radius * 3;
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cursor = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const isCorner = i < pts.length - 1 && bend > 0;
    if (!isCorner) {
      path.add(new THREE.LineCurve3(cursor, p.clone()));
      cursor = p.clone();
      continue;
    }
    const next = pts[i + 1];
    const din = p.clone().sub(pts[i - 1]);
    const dout = next.clone().sub(p);
    const b = Math.min(bend, din.length() / 2, dout.length() / 2);
    const s0 = p.clone().sub(din.normalize().multiplyScalar(b));
    const s1 = p.clone().add(dout.normalize().multiplyScalar(b));
    if (s0.distanceTo(cursor) > 1e-5) path.add(new THREE.LineCurve3(cursor, s0));
    path.add(new THREE.QuadraticBezierCurve3(s0, p.clone(), s1));
    cursor = s1;
  }
  const length = path.getLength();
  const segs = bend > 0 ? Math.min(800, Math.max(12, Math.ceil(length / Math.max(0.04, s.radius * 1.5)))) : Math.max(1, pts.length - 1);
  return new THREE.TubeGeometry(path, segs, s.radius, s.radialSegments ?? 10, false);
}

/** Non-instanced primitive geometry (world coordinates of the part). */
export function buildPrimitive(s: PrimitiveShape): THREE.BufferGeometry {
  switch (s.kind) {
    case 'box': {
      const g = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);
      if (s.rotY) g.rotateY(s.rotY);
      if (s.at) g.translate(s.at[0], s.at[1], s.at[2]);
      return g;
    }
    case 'cylinder': {
      const g = new THREE.CylinderGeometry(s.radiusTop ?? s.radius, s.radius, s.height, s.segments ?? 24, 1, !!s.open);
      const at = s.at ?? [0, 0, 0];
      g.translate(at[0], at[1] + s.height / 2, at[2]);
      return g;
    }
    case 'rod':
      return rodGeometry(s.a, s.b, s.radius, s.segments ?? 10);
    case 'extrude': {
      const shape = new THREE.Shape(s.outline.map((p) => new THREE.Vector2(p[0], p[1])));
      for (const h of s.holes ?? []) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-3, s.y1 - s.y0), bevelEnabled: false, curveSegments: 6 });
      g.rotateX(Math.PI / 2);
      g.translate(0, s.y1, 0);
      return g;
    }
    case 'tube':
      return tubeGeometry(s);
    case 'merge': {
      const parts = s.shapes.map((x) => clean(buildPrimitive(x)));
      const g = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
      parts.forEach((p) => p.dispose());
      return g;
    }
  }
}

// ---------------------------------------------------------------------------
// Instancing
// ---------------------------------------------------------------------------

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitRods = new Map<number, THREE.BufferGeometry>();
function unitRod(seg: number) {
  let g = unitRods.get(seg);
  if (!g) {
    g = new THREE.CylinderGeometry(1, 1, 1, seg, 1);
    g.translate(0, 0.5, 0);
    unitRods.set(seg, g);
  }
  return g;
}
/** Shared base geometries must survive part disposal. */
export const isSharedGeometry = (g: THREE.BufferGeometry) => g === unitBox || Array.from(unitRods.values()).includes(g);

export interface InstancedBuild {
  geometry: THREE.BufferGeometry;
  matrices: Float32Array;
  count: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export function buildInstanced(s: InstancedShape): InstancedBuild {
  const count = s.items.length;
  const matrices = new Float32Array(count * 16);
  if (s.kind === 'boxes') {
    s.items.forEach((it, i) => {
      if (it.rot) _e.set(it.rot[0], it.rot[1], it.rot[2], 'YXZ');
      else _e.set(0, it.rotY ?? 0, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(...it.at), _q, _s.set(...it.size));
      _m.toArray(matrices, i * 16);
    });
    return { geometry: unitBox, matrices, count };
  }
  if (s.kind === 'rods') {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    s.items.forEach((it, i) => {
      a.set(...it.a);
      b.set(...it.b);
      const len = a.distanceTo(b) || 1e-4;
      _q.setFromUnitVectors(UP, b.sub(a).normalize());
      const r = it.r ?? s.radius;
      _m.compose(a, _q, _s.set(r, len, r));
      _m.toArray(matrices, i * 16);
    });
    return { geometry: unitRod(s.segments ?? 8), matrices, count };
  }
  const geometry = buildPrimitive(s.of);
  s.items.forEach((it, i) => {
    if (it.rot) _e.set(it.rot[0], it.rot[1], it.rot[2], 'YXZ');
    else _e.set(0, it.rotY ?? 0, 0);
    _q.setFromEuler(_e);
    const sc = it.scale ?? 1;
    if (typeof sc === 'number') _s.set(sc, sc, sc);
    else _s.set(sc[0], sc[1], sc[2]);
    _m.compose(_p.set(...it.at), _q, _s);
    _m.toArray(matrices, i * 16);
  });
  return { geometry, matrices, count };
}

// ---------------------------------------------------------------------------
// Terrain cake
// ---------------------------------------------------------------------------

const C_SOIL = new THREE.Color('#CDB28A');
const C_SOIL2 = new THREE.Color('#C4A87E');
const C_CUT = new THREE.Color('#AE8F66');
const C_ROCK = new THREE.Color('#B3A893');
const C_TOP = new THREE.Color('#8F6E48');
const C_CLAY = new THREE.Color('#B48F60');
const C_PLINTH = new THREE.Color('#EFE9DF');
const C_PLINTH_LOW = new THREE.Color('#F4F0EA');
/** Skirt rows: absolute depths (m) for the soil band, then fractions of the full depth. */
const SKIRT_T = [0, 0.12, 0.3, 0.6, 1.0, 0.5, 1];
const SKIRT_ABS = 5;
const skirtDepth = (k: number, D: number, prev: number) => Math.min(D, Math.max(prev, k < SKIRT_ABS ? SKIRT_T[k] : SKIRT_T[k] * D));

function terrainPass(grid: TerrainGrid, ref: TerrainGrid | undefined, baseY: number) {
  const { cols, rows, cell, origin, heights } = grid;
  const nTop = cols * rows;
  const border: number[] = [];
  for (let c = 0; c < cols; c++) border.push(c); // z min edge
  for (let r = 1; r < rows; r++) border.push(r * cols + cols - 1); // x max edge
  for (let c = cols - 2; c >= 0; c--) border.push((rows - 1) * cols + c); // z max edge
  for (let r = rows - 2; r >= 1; r--) border.push(r * cols); // x min edge
  const nSk = border.length * SKIRT_T.length;
  const pos = new Float32Array((nTop + nSk) * 3);
  const col = new Float32Array((nTop + nSk) * 3);
  const tmp = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const h = heights[i];
      pos[i * 3] = origin[0] + c * cell;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = origin[1] + r * cell;
      // Gentle mottling + cut / steep coloring.
      const x = pos[i * 3];
      const z = pos[i * 3 + 2];
      const n = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(z * 0.7) * 2) * Math.cos(z * 0.6 - x * 0.2);
      tmp.copy(C_SOIL).lerp(C_SOIL2, n * 0.6);
      if (ref) {
        const cut = ref.heights[i] - h;
        if (cut > 0.04) tmp.lerp(C_CUT, Math.min(1, (cut - 0.04) / 0.35));
      }
      const hx = heights[r * cols + Math.min(cols - 1, c + 1)] - heights[r * cols + Math.max(0, c - 1)];
      const hz = heights[Math.min(rows - 1, r + 1) * cols + c] - heights[Math.max(0, r - 1) * cols + c];
      const slope = Math.hypot(hx, hz) / (2 * cell);
      // Only real cut faces read as rock; graded banks stay soil-colored.
      if (slope > 2.2) tmp.lerp(C_ROCK, Math.min(0.5, (slope - 2.2) / 3));
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
  }
  let k = nTop;
  for (const bi of border) {
    const top = heights[bi];
    let prevD = 0;
    for (let si = 0; si < SKIRT_T.length; si++) {
      prevD = skirtDepth(si, top - baseY, prevD);
      const y = top - prevD;
      pos[k * 3] = pos[bi * 3];
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = pos[bi * 3 + 2];
      // Architectural-model plinth: a thin band of soil under the surface, then a light,
      // almost-background base that fades toward the bottom (no tall walls of dirt).
      const d = top - y;
      if (d < 0.25) tmp.copy(C_TOP).lerp(C_CLAY, d / 0.25);
      else if (d < 0.9) tmp.copy(C_CLAY).lerp(C_PLINTH, (d - 0.25) / 0.65);
      else tmp.copy(C_PLINTH).lerp(C_PLINTH_LOW, Math.min(1, (d - 0.9) / 4));
      col[k * 3] = tmp.r;
      col[k * 3 + 1] = tmp.g;
      col[k * 3 + 2] = tmp.b;
      k += 1;
    }
  }
  return { pos, col, border, nTop };
}

function terrainIndex(grid: TerrainGrid, border: number[], nTop: number, pos: Float32Array): number[] {
  const { cols, rows } = grid;
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = (r + 1) * cols + c;
      const d = r * cols + c + 1;
      const e = (r + 1) * cols + c + 1;
      idx.push(a, b, d, d, b, e);
    }
  }
  // Skirts: winding chosen so faces point away from the grid center.
  const cx = (pos[0] + pos[(cols - 1) * 3]) / 2;
  const cz = (pos[2] + pos[((rows - 1) * cols) * 3 + 2]) / 2;
  const L = SKIRT_T.length;
  for (let j = 0; j < border.length - 1 + 1; j++) {
    const j2 = (j + 1) % border.length;
    for (let t = 0; t < L - 1; t++) {
      const p0 = nTop + j * L + t;
      const p1 = nTop + j2 * L + t;
      const q0 = p0 + 1;
      const q1 = p1 + 1;
      // Outward check on the first quad of this column pair.
      const ax = pos[p1 * 3] - pos[p0 * 3];
      const az = pos[p1 * 3 + 2] - pos[p0 * 3 + 2];
      const mx = (pos[p0 * 3] + pos[p1 * 3]) / 2 - cx;
      const mz = (pos[p0 * 3 + 2] + pos[p1 * 3 + 2]) / 2 - cz;
      // Normal of (p0, q0, p1) ~ (down × along) ; compare with outward (mx, mz).
      const nx = -az;
      const nz = ax;
      if (nx * mx + nz * mz > 0) idx.push(p0, q0, p1, p1, q0, q1);
      else idx.push(p0, p1, q0, p1, q1, q0);
    }
  }
  return idx;
}

/** Soil cake geometry; with `from`, base = from and morph target 0 = grid. */
export function buildTerrain(s: TerrainShape): THREE.BufferGeometry {
  const target = terrainPass(s.grid, s.ref, s.baseY);
  const baseGrid = s.from ?? s.grid;
  const base = s.from ? terrainPass(s.from, s.ref, s.baseY) : target;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base.pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(base.col, 3));
  g.setIndex(terrainIndex(baseGrid, base.border, base.nTop, base.pos));
  g.computeVertexNormals();
  if (s.from) {
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(target.pos, 3));
    tg.setIndex(g.index);
    tg.computeVertexNormals();
    g.morphAttributes.position = [new THREE.BufferAttribute(target.pos, 3)];
    g.morphAttributes.normal = [tg.getAttribute('normal') as THREE.BufferAttribute];
    g.morphAttributes.color = [new THREE.BufferAttribute(target.col, 3)];
    g.morphTargetsRelative = false;
    // Bounds must include both states.
    g.computeBoundingBox();
    tg.computeBoundingBox();
    g.boundingBox?.union(tg.boundingBox as THREE.Box3);
    g.boundingSphere = g.boundingBox ? g.boundingBox.getBoundingSphere(new THREE.Sphere()) : null;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Draped surface (clipped to an outline)
// ---------------------------------------------------------------------------

export function buildDrape(s: DrapeShape): THREE.BufferGeometry {
  const cell = s.cell ?? 0.5;
  const lift = s.lift ?? 0.03;
  const xs = s.outline.map((p) => p[0]);
  const zs = s.outline.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs) / cell) * cell;
  const z0 = Math.floor(Math.min(...zs) / cell) * cell;
  const x1 = Math.max(...xs);
  const z1 = Math.max(...zs);
  const pos: number[] = [];
  const h = (x: number, z: number) => sampleGrid(s.grid, x, z) + lift;
  const pushTri = (a: Vec2, b: Vec2, c: Vec2) => {
    // Ensure upward winding (CCW seen from +Y → (b-a)×(c-a) has +Y).
    const cross = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    const [p, q] = cross >= 0 ? [b, c] : [c, b];
    pos.push(a[0], h(a[0], a[1]), a[1], p[0], h(p[0], p[1]), p[1], q[0], h(q[0], q[1]), q[1]);
  };
  for (let x = x0; x < x1; x += cell) {
    for (let z = z0; z < z1; z += cell) {
      const sq: Vec2[] = [
        [x, z],
        [x + cell, z],
        [x + cell, z + cell],
        [x, z + cell],
      ];
      if (s.holes?.some((h) => sq.every((p) => pointInPolygon(p, h)))) continue;
      const inside = sq.every((p) => pointInPolygon(p, s.outline));
      if (inside) {
        pushTri(sq[0], sq[3], sq[1]);
        pushTri(sq[1], sq[3], sq[2]);
        continue;
      }
      const piece = clipPolygonConvex(s.outline, sq);
      if (piece.length < 3) continue;
      const tris = THREE.ShapeUtils.triangulateShape(
        piece.map((p) => new THREE.Vector2(p[0], p[1])),
        [],
      );
      for (const [i, j, k] of tris) pushTri(piece[i], piece[j], piece[k]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Plan drape (sheet viewport on the terrain)
// ---------------------------------------------------------------------------

export interface PlanBuild {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  viewport: SheetViewport;
  /** Model-space bounds of the drawing frame. */
  bounds: { min: Vec2; max: Vec2 };
  flatY: number;
}

export function buildPlan(s: PlanShape, house: HouseModel): PlanBuild {
  const vp = house.sheet.viewports.find((v) => v.id === s.viewport) ?? house.sheet.viewports[0];
  const [bx0, by0, bx1, by1] = vp.bboxPt;
  const toModel = (px: number, py: number): Vec2 => [(px - vp.originPt[0]) * vp.metersPerPt, (py - vp.originPt[1]) * vp.metersPerPt];
  const m0 = toModel(bx0, by0);
  const m1 = toModel(bx1, by1);
  const min: Vec2 = [Math.min(m0[0], m1[0]), Math.min(m0[1], m1[1])];
  const max: Vec2 = [Math.max(m0[0], m1[0]), Math.max(m0[1], m1[1])];
  const step = 0.5;
  const nx = Math.max(2, Math.ceil((max[0] - min[0]) / step) + 1);
  const nz = Math.max(2, Math.ceil((max[1] - min[1]) / step) + 1);
  const g = s.drape;
  const gx0 = g.origin[0];
  const gz0 = g.origin[1];
  const gx1 = gx0 + (g.cols - 1) * g.cell;
  const gz1 = gz0 + (g.rows - 1) * g.cell;
  let maxH = -Infinity;
  for (const h of g.heights) maxH = Math.max(maxH, h);
  const flatY = maxH + 0.08;
  const pos = new Float32Array(nx * nz * 3);
  const ty = new Float32Array(nx * nz);
  const inside = new Float32Array(nx * nz);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = min[0] + ((max[0] - min[0]) * i) / (nx - 1);
      const z = min[1] + ((max[1] - min[1]) * j) / (nz - 1);
      pos[k * 3] = x;
      pos[k * 3 + 1] = flatY;
      pos[k * 3 + 2] = z;
      ty[k] = sampleGrid(g, x, z) + 0.035;
      const m = 0.05;
      inside[k] = x >= gx0 + m && x <= gx1 - m && z >= gz0 + m && z <= gz1 - m ? 1 : 0;
      // UV inside the cropped viewport image (v up).
      uv[k * 2] = i / (nx - 1);
      uv[k * 2 + 1] = 1 - j / (nz - 1);
    }
  }
  // If the model x axis runs opposite to the sheet x axis (never for this sheet), flip u.
  if (m0[0] > m1[0]) for (let k = 0; k < nx * nz; k++) uv[k * 2] = 1 - uv[k * 2];
  if (m0[1] > m1[1]) for (let k = 0; k < nx * nz; k++) uv[k * 2 + 1] = 1 - uv[k * 2 + 1];
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = (j + 1) * nx + i;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aTerrainY', new THREE.BufferAttribute(ty, 1));
  geo.setAttribute('aInside', new THREE.BufferAttribute(inside, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  const bb = geo.boundingBox as THREE.Box3;
  let minT = Infinity;
  ty.forEach((v) => {
    minT = Math.min(minT, v);
  });
  bb.min.y = Math.min(bb.min.y, minT);
  geo.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null },
      uMorph: { value: 1 },
      uInk: { value: 1 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aTerrainY;
      attribute float aInside;
      uniform float uMorph;
      varying vec2 vUv;
      varying float vInside;
      void main() {
        vUv = uv;
        vInside = aInside;
        vec3 p = position;
        p.y = mix(position.y, aTerrainY, uMorph);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float uInk;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vInside;
      void main() {
        vec4 t = texture2D(map, vUv);
        float dark = 1.0 - min(t.r, min(t.g, t.b));
        float inkA = smoothstep(0.04, 0.42, dark);
        vec3 inkCol = mix(t.rgb, vec3(0.10, 0.09, 0.09), 0.18);
        vec3 col = mix(t.rgb, inkCol, uInk);
        float a = mix(1.0, inkA * 0.9, uInk) * uOpacity * mix(1.0, vInside, uInk);
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return { geometry: geo, material, viewport: vp, bounds: { min, max }, flatY };
}

/**
 * Plan texture for a viewport: the pre-cropped `/build3d/plan-<viewport>.webp`
 * (= the viewport frame, see docs/build3d/extraction.md); falls back to cropping the
 * full sheet image into a ≤ 2048 px canvas.
 */
export function loadPlanTexture(house: HouseModel, vp: SheetViewport, onLoad: (t: THREE.Texture) => void): () => void {
  let cancelled = false;
  const finish = (tex: THREE.Texture) => {
    if (cancelled) return;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    onLoad(tex);
  };
  const fromSheet = () => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      const k = img.naturalWidth / house.sheet.widthPt;
      const [x0, y0, x1, y1] = vp.bboxPt;
      const sw = (x1 - x0) * k;
      const sh = (y1 - y0) * k;
      const scale = Math.min(1, 2048 / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, x0 * k, y0 * k, sw, sh, 0, 0, canvas.width, canvas.height);
      finish(new THREE.CanvasTexture(canvas));
    };
    img.src = house.sheet.image;
  };
  const crop = new Image();
  crop.decoding = 'async';
  crop.onload = () => {
    if (cancelled) return;
    const t = new THREE.Texture(crop);
    finish(t);
  };
  crop.onerror = fromSheet;
  crop.src = house.sheet.image.replace(/plan-sheet\.webp$/, `plan-${vp.id}.webp`);
  return () => {
    cancelled = true;
  };
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

const edgeCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

export function edgesOf(g: THREE.BufferGeometry, angle = 28): THREE.BufferGeometry {
  let e = edgeCache.get(g);
  if (!e) {
    e = new THREE.EdgesGeometry(g, angle);
    edgeCache.set(g, e);
  }
  return e;
}

/** Instanced line geometry sharing the mesh's instanceMatrix attribute. */
export function instancedEdges(base: THREE.BufferGeometry, instanceMatrix: THREE.InstancedBufferAttribute, count: number) {
  const e = edgesOf(base);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', e.getAttribute('position'));
  g.setAttribute('instanceMatrix', instanceMatrix);
  g.instanceCount = count;
  return g;
}
