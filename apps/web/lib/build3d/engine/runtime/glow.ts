/**
 * Cheap dusk glow, no postprocessing: additive camera-facing halos at lamps and lit
 * windows, plus soft light pools on the ground under garden lamps. Two instanced quads
 * (one draw call each); everything scales with the dusk level.
 *
 * Halos are pushed a little toward the camera in view space, so a halo centered in a
 * window is not clipped by the wall the window sits in, but still hides behind
 * anything really in front of it.
 */
import * as THREE from 'three';

export interface GlowHalo {
  at: THREE.Vector3;
  /** Billboard width / height (m). */
  w: number;
  h: number;
  color: THREE.Color;
  /** Intensity multiplier. */
  k: number;
}

export interface GlowPool {
  at: THREE.Vector3;
  radius: number;
  color: THREE.Color;
  k: number;
}

const HALO_VS = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aSize;
  attribute vec4 aColor;
  uniform float uPush;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vUv = position.xy * 2.0;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    float d = length(mv.xyz);
    mv.xyz += (-mv.xyz / d) * min(uPush, d * 0.5);
    mv.xy += position.xy * aSize;
    gl_Position = projectionMatrix * mv;
  }`;

const POOL_VS = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aSize;
  attribute vec4 aColor;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vUv = position.xy * 2.0;
    vColor = aColor;
    vec3 p = aCenter + vec3(position.x * aSize.x, 0.0, -position.y * aSize.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

/** Soft core + wide falloff; uRect > 0 squares the shape off (window glow). */
const GLOW_FS = /* glsl */ `
  uniform float uLevel;
  uniform float uRect;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec2 q = abs(vUv);
    float round_ = length(vUv);
    float rect = pow(pow(q.x, 4.0) + pow(q.y, 4.0), 0.25);
    float d = mix(round_, rect, uRect);
    if (d >= 1.0) discard;
    float f = 1.0 - d;
    float a = f * f * (0.55 + 0.45 * f) + 0.6 * pow(f, 6.0);
    float k = a * vColor.a * uLevel;
    gl_FragColor = vec4(vColor.rgb * k, k);
    #include <colorspace_fragment>
  }`;

function makeMaterial(vs: string, rect: number, push: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uLevel: { value: 0 }, uRect: { value: rect }, uPush: { value: push } },
    vertexShader: vs,
    fragmentShader: GLOW_FS,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

class QuadSet {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  readonly material: THREE.ShaderMaterial;

  constructor(vs: string, rect: number, push: number, renderOrder: number) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.instanceCount = 0;
    this.material = makeMaterial(vs, rect, push);
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  set(items: Array<{ at: THREE.Vector3; w: number; h: number; color: THREE.Color; k: number }>) {
    const n = items.length;
    const c = new Float32Array(n * 3);
    const s = new Float32Array(n * 2);
    const col = new Float32Array(n * 4);
    items.forEach((it, i) => {
      c.set([it.at.x, it.at.y, it.at.z], i * 3);
      s.set([it.w, it.h], i * 2);
      col.set([it.color.r, it.color.g, it.color.b, it.k], i * 4);
    });
    this.geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(c, 3));
    this.geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(s, 2));
    this.geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 4));
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}

export class GlowLayer {
  readonly group = new THREE.Group();
  /** Step the halos were collected for (-1: stale). */
  step = -1;
  private halos = new QuadSet(HALO_VS, 0.55, 0.45, 20);
  private pools = new QuadSet(POOL_VS, 0, 0, 19);
  private level = 0;

  constructor() {
    this.group.name = 'glow';
    this.group.add(this.pools.mesh, this.halos.mesh);
    this.group.visible = false;
  }

  setItems(halos: GlowHalo[], pools: GlowPool[]) {
    this.halos.set(halos);
    this.pools.set(pools.map((p) => ({ at: p.at, w: p.radius * 2, h: p.radius * 2, color: p.color, k: p.k })));
  }

  setLevel(k: number) {
    this.level = k;
    this.halos.material.uniforms.uLevel.value = k;
    this.pools.material.uniforms.uLevel.value = k;
    this.group.visible = k > 0.003;
  }

  get value() {
    return this.level;
  }

  dispose() {
    this.halos.dispose();
    this.pools.dispose();
  }
}
