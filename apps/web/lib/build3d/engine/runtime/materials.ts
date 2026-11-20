/**
 * Shared material instances: palette materials, plus cached ghost and highlight
 * variants of ANY material (palette or model), and edge (outline) materials.
 * Variants are shared, so changing the global highlight level is one loop.
 */
import * as THREE from 'three';
import { ACCENT, INK, PALETTE } from '../palette';
import type { MaterialKey } from '../types';

export const GHOST_OPACITY = 0.13;
const EDGE_OPACITY = 0.42;

type Std = THREE.MeshStandardMaterial;

const isStd = (m: THREE.Material): m is Std => (m as Std).isMeshStandardMaterial === true;

export class MaterialLibrary {
  private base = new Map<string, Std>();
  private ghosts = new Map<string, THREE.Material>();
  private highlights = new Map<string, THREE.Material>();
  private highlightList: Std[] = [];
  private level = -1;
  private dusk = 0;
  private duskList: Std[] = [];

  readonly accent = new THREE.Color(ACCENT);
  readonly ink = new THREE.Color(INK);

  readonly edge = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: EDGE_OPACITY, depthWrite: false });
  readonly edgeGhost = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.1, depthWrite: false });
  readonly edgeHighlight = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95, depthWrite: false });

  /** Instanced-edge shader materials (instanceMatrix attribute shared with the mesh). */
  readonly instEdge = makeInstancedEdgeMaterial(INK, EDGE_OPACITY);
  readonly instEdgeGhost = makeInstancedEdgeMaterial(INK, 0.1);
  readonly instEdgeHighlight = makeInstancedEdgeMaterial(ACCENT, 0.95);

  /** Palette material (shared). `color` overrides the palette color. */
  get(key: MaterialKey, color?: string, opts: { vertexColors?: boolean; side?: THREE.Side } = {}): Std {
    const id = `${key}|${color ?? ''}|${opts.vertexColors ? 'v' : ''}|${opts.side ?? 0}`;
    let m = this.base.get(id);
    if (!m) {
      const spec = PALETTE[key];
      const opacity = spec.opacity ?? 1;
      m = new THREE.MeshStandardMaterial({
        color: opts.vertexColors ? '#ffffff' : color ?? spec.color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
        vertexColors: !!opts.vertexColors,
        side: opts.side ?? (opacity < 1 ? THREE.DoubleSide : THREE.FrontSide),
        // Push faces back a hair so outlines win the depth test (no z-fighting).
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      if (spec.emissive) {
        m.emissive.set(spec.emissive);
        m.emissiveIntensity = this.dusk * 1.6;
        this.duskList.push(m);
      }
      m.name = `pal:${key}`;
      this.base.set(id, m);
    }
    return m;
  }

  /** Translucent "ghost" variant of any material (future preview / x-ray). */
  ghostOf(m: THREE.Material): THREE.Material {
    let g = this.ghosts.get(m.uuid);
    if (!g) {
      g = m.clone();
      g.transparent = true;
      g.opacity = Math.min(GHOST_OPACITY, m.opacity);
      g.depthWrite = false;
      if (isStd(g)) {
        g.emissive.copy(isStd(m) ? m.emissive : g.emissive);
        g.side = THREE.FrontSide;
      }
      this.ghosts.set(m.uuid, g);
    }
    return g;
  }

  /** Magenta-tinted variant (current step); intensity follows setHighlight(). */
  highlightOf(m: THREE.Material): THREE.Material {
    if (!isStd(m)) return m;
    let h = this.highlights.get(m.uuid);
    if (!h) {
      const c = m.clone();
      c.emissive.copy(this.accent);
      c.emissiveIntensity = Math.max(0, this.level) * 0.5;
      this.highlights.set(m.uuid, c);
      this.highlightList.push(c);
      h = c;
    }
    return h;
  }

  /** Global highlight level 0..1 (shared by every part of the current step). */
  setHighlight(level: number) {
    if (Math.abs(level - this.level) < 0.002) return;
    this.level = level;
    for (const m of this.highlightList) m.emissiveIntensity = level * 0.26;
    this.edgeHighlight.color.copy(this.ink).lerp(this.accent, Math.min(1, level * 1.3));
    this.edgeHighlight.opacity = EDGE_OPACITY + (0.95 - EDGE_OPACITY) * Math.min(1, level * 1.3);
    const u = this.instEdgeHighlight.uniforms;
    (u.uColor.value as THREE.Color).copy(this.edgeHighlight.color);
    u.uOpacity.value = this.edgeHighlight.opacity;
  }

  /** 0 = day, 1 = dusk: emissive palette materials ('light', 'glassLit') glow. */
  setDusk(level: number) {
    if (Math.abs(level - this.dusk) < 0.002) return;
    this.dusk = level;
    for (const m of this.duskList) m.emissiveIntensity = level * 1.6;
    this.ghosts.forEach((g, uuid) => {
      const src = this.duskList.find((m) => m.uuid === uuid);
      if (src && isStd(g)) g.emissiveIntensity = src.emissiveIntensity;
    });
  }

  dispose() {
    this.base.forEach((m) => m.dispose());
    this.ghosts.forEach((m) => m.dispose());
    this.highlights.forEach((m) => m.dispose());
    this.edge.dispose();
    this.edgeGhost.dispose();
    this.edgeHighlight.dispose();
    this.instEdge.dispose();
    this.instEdgeGhost.dispose();
    this.instEdgeHighlight.dispose();
  }
}

/** Line material for LineSegments with an InstancedBufferGeometry carrying `instanceMatrix`. */
export function makeInstancedEdgeMaterial(color: string, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      attribute mat4 instanceMatrix;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}
