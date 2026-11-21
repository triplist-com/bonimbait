/**
 * Shared material instances: palette materials, plus cached ghost and highlight
 * variants of ANY material (palette or model), and edge (outline) materials.
 * Variants are shared, so changing the global highlight level is one loop.
 */
import * as THREE from 'three';
import { ACCENT, INK, PALETTE } from '../palette';
import type { MaterialKey } from '../types';

export const GHOST_OPACITY = 0.13;
/** Occluders faded by the automatic x-ray: lighter than the ghost preview so the house keeps its shape. */
export const XRAY_OPACITY = 0.24;
const EDGE_OPACITY = 0.42;
/** Landscape materials that darken at dusk. */
const DUSK_GROUND = new Set<MaterialKey>(['soil', 'soilCut', 'rock', 'asphalt', 'gravel', 'grass']);
/** Lit window panes at dusk: dense warm glass (day: the palette's 0.45). */
const DUSK_GLASS_OPACITY = 0.86;
/** Muted ("finished") parts: desaturate toward this warm paper gray (sRGB), and their outline opacity at full mute. */
const MUTE_GRAY = new THREE.Color('#D8D1C6');
const MUTE_EDGE_OPACITY = 0.24;

type Std = THREE.MeshStandardMaterial;

const isStd = (m: THREE.Material): m is Std => (m as Std).isMeshStandardMaterial === true;

export class MaterialLibrary {
  private base = new Map<string, Std>();
  private ghosts = new Map<string, THREE.Material>();
  private xrays = new Map<string, THREE.Material>();
  private highlights = new Map<string, THREE.Material>();
  private highlightList: Std[] = [];
  private muted = new Map<string, THREE.Material>();
  private muteU = { value: 0 };
  private mutedList: Std[] = [];
  private muteGray = { value: MUTE_GRAY.clone() };
  private level = -1;
  private dusk = 0;
  private duskList: Std[] = [];
  private groundList: Std[] = [];

  readonly accent = new THREE.Color(ACCENT);
  readonly ink = new THREE.Color(INK);

  readonly edge = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: EDGE_OPACITY, depthWrite: false });
  readonly edgeGhost = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.1, depthWrite: false });
  /** Outlines of x-ray-faded occluders: faint, so a faded roof build-up does not read as a grid. */
  readonly edgeXray = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.05, depthWrite: false });
  readonly edgeHighlight = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95, depthWrite: false });
  /** Outlines of muted (finished) parts while a step's new parts are emphasized. */
  readonly edgeMuted = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: EDGE_OPACITY, depthWrite: false });

  /** Instanced-edge shader materials (instanceMatrix attribute shared with the mesh). */
  readonly instEdge = makeInstancedEdgeMaterial(INK, EDGE_OPACITY);
  readonly instEdgeGhost = makeInstancedEdgeMaterial(INK, 0.1);
  readonly instEdgeXray = makeInstancedEdgeMaterial(INK, 0.05);
  readonly instEdgeHighlight = makeInstancedEdgeMaterial(ACCENT, 0.95);
  readonly instEdgeMuted = makeInstancedEdgeMaterial(INK, EDGE_OPACITY);

  /** Palette material (shared). `color` overrides the palette color. */
  get(key: MaterialKey, color?: string, opts: { vertexColors?: boolean; side?: THREE.Side; offset?: boolean } = {}): Std {
    const offset = opts.offset ?? true;
    const id = `${key}|${color ?? ''}|${opts.vertexColors ? 'v' : ''}|${opts.side ?? 0}|${offset ? 'o' : ''}`;
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
        // Push faces back a hair so outlines win the depth test (no z-fighting). Parts without
        // outlines (skins: render, stone, paint) stay put, or edges BEHIND them show through
        // at grazing angles.
        polygonOffset: offset,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      m.name = `pal:${key}`;
      if (spec.emissive) {
        m.emissive.set(spec.emissive);
        m.userData.duskOpacity = opacity < 1 ? DUSK_GLASS_OPACITY : opacity;
        m.userData.dayOpacity = opacity;
        this.applyDuskTo(m);
        this.duskList.push(m);
      }
      if (DUSK_GROUND.has(key)) {
        m.userData.dayColor = m.color.clone();
        this.groundList.push(m);
        this.applyGroundDusk(m);
      }
      this.base.set(id, m);
    }
    return m;
  }

  /** At dusk the landscape falls into cool shade, so the white house and the lamps pop. */
  private applyGroundDusk(m: Std) {
    const k = this.dusk;
    const day = m.userData.dayColor as THREE.Color;
    m.color.setRGB(day.r * (1 - 0.52 * k), day.g * (1 - 0.5 * k), day.b * (1 - 0.4 * k));
  }

  /** Translucent "ghost" variant of any material (future preview). */
  ghostOf(m: THREE.Material): THREE.Material {
    return this.translucent(m, this.ghosts, GHOST_OPACITY);
  }

  /** Translucent variant for x-ray occluders (a bit more present than the ghost preview). */
  xrayOf(m: THREE.Material): THREE.Material {
    return this.translucent(m, this.xrays, XRAY_OPACITY);
  }

  private translucent(m: THREE.Material, cache: Map<string, THREE.Material>, opacity: number): THREE.Material {
    let g = cache.get(m.uuid);
    if (!g) {
      g = m.clone();
      g.transparent = true;
      g.opacity = Math.min(opacity, m.opacity);
      g.depthWrite = false;
      if (isStd(g)) {
        g.emissive.copy(isStd(m) ? m.emissive : g.emissive);
        g.side = THREE.FrontSide;
      }
      cache.set(m.uuid, g);
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
      // Dark parts (steel, aluminum, bitumen) need more magenta to read as "new" at a glance.
      const lum = 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
      // Saturated parts (orange rebar, red / blue pipes) already pop against the muted house:
      // less magenta, so they keep their true color instead of turning muddy.
      const mx = Math.max(m.color.r, m.color.g, m.color.b);
      const sat = mx > 1e-4 ? (mx - Math.min(m.color.r, m.color.g, m.color.b)) / mx : 0;
      c.userData.hlGain = (0.26 + 0.34 * Math.max(0, 1 - lum / 0.35)) * (1 - 0.35 * sat);
      c.emissiveIntensity = Math.max(0, this.level) * (c.userData.hlGain as number);
      this.highlights.set(m.uuid, c);
      this.highlightList.push(c);
      h = c;
    }
    return h;
  }

  /**
   * "Finished" variant of any material while the current step's new parts are emphasized:
   * desaturated toward a warm paper gray (an assembly-manual look). Plain materials lerp their
   * color (same shader program as the source, no compile); vertex-colored terrain gets a few
   * shader lines after the base color, driven by one shared uniform. `k` scales the amount
   * (terrain mutes less). Glowing (dusk) palette materials are never muted.
   */
  mutedOf(m: THREE.Material, k = 1): THREE.Material {
    if (!isStd(m) || this.duskList.includes(m)) return m;
    const id = `${m.uuid}|${k}`;
    let v = this.muted.get(id);
    if (!v) {
      const c = m.clone();
      if (!m.vertexColors) {
        const orig = m.color.clone();
        const lum = 0.2126 * orig.r + 0.7152 * orig.g + 0.0722 * orig.b;
        c.userData.orig = orig;
        c.userData.gray = new THREE.Color(lum, lum, lum).lerp(this.muteGray.value, 0.38);
        c.userData.k = k;
        c.color.copy(orig).lerp(c.userData.gray as THREE.Color, this.muteU.value * k);
        this.mutedList.push(c);
        this.muted.set(id, c);
        return c;
      }
      const muteK = { value: k };
      c.onBeforeCompile = (sh) => {
        sh.uniforms.uMute = this.muteU;
        sh.uniforms.uMuteK = muteK;
        sh.uniforms.uMuteGray = this.muteGray;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uMute;\nuniform float uMuteK;\nuniform vec3 uMuteGray;')
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            {
              float mL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
              diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(mL), uMuteGray, 0.38), uMute * uMuteK);
            }`,
          );
      };
      c.customProgramCacheKey = () => 'b3d-muted';
      this.muted.set(id, c);
      v = c;
    }
    return v;
  }

  /** Mute amount 0..1 for every muted variant. */
  setMute(level: number) {
    this.muteU.value = level;
    for (const m of this.mutedList) m.color.copy(m.userData.orig as THREE.Color).lerp(m.userData.gray as THREE.Color, level * (m.userData.k as number));
    const o = EDGE_OPACITY + (MUTE_EDGE_OPACITY - EDGE_OPACITY) * level;
    this.edgeMuted.opacity = o;
    this.instEdgeMuted.uniforms.uOpacity.value = o;
  }

  /** Global highlight level 0..1 (shared by every part of the current step). */
  setHighlight(level: number) {
    if (Math.abs(level - this.level) < 0.002) return;
    this.level = level;
    for (const m of this.highlightList) m.emissiveIntensity = level * ((m.userData.hlGain as number | undefined) ?? 0.26);
    // Outlines stay fully magenta at the resting level: the "new" outline reads in stills.
    this.edgeHighlight.color.copy(this.ink).lerp(this.accent, Math.min(1, level * 2));
    this.edgeHighlight.opacity = EDGE_OPACITY + (0.95 - EDGE_OPACITY) * Math.min(1, level * 2);
    const u = this.instEdgeHighlight.uniforms;
    (u.uColor.value as THREE.Color).copy(this.edgeHighlight.color);
    u.uOpacity.value = this.edgeHighlight.opacity;
  }

  /** Lamps glow brighter than lit panes; lit panes turn denser (a warm lit room, not clear glass). */
  private applyDuskTo(m: Std) {
    const k = this.dusk;
    const glass = m.name === 'pal:glassLit';
    m.emissiveIntensity = k * (glass ? 1.25 : 2.2);
    const o = (m.userData.dayOpacity as number) + ((m.userData.duskOpacity as number) - (m.userData.dayOpacity as number)) * k;
    m.opacity = o;
  }

  /** 0 = day, 1 = dusk: emissive palette materials ('light', 'glassLit') glow. */
  setDusk(level: number) {
    // Skip tiny steps while easing, but always land exactly on 0 / 1.
    if (level === this.dusk || (Math.abs(level - this.dusk) < 0.002 && level > 0 && level < 1)) return;
    this.dusk = level;
    for (const m of this.duskList) this.applyDuskTo(m);
    for (const m of this.groundList) this.applyGroundDusk(m);
    for (const cache of [this.ghosts, this.xrays])
      cache.forEach((g, uuid) => {
        const src = this.duskList.find((m) => m.uuid === uuid);
        if (src && isStd(g)) g.emissiveIntensity = src.emissiveIntensity;
      });
  }

  dispose() {
    this.base.forEach((m) => m.dispose());
    this.ghosts.forEach((m) => m.dispose());
    this.xrays.forEach((m) => m.dispose());
    this.highlights.forEach((m) => m.dispose());
    this.muted.forEach((m) => m.dispose());
    this.edgeMuted.dispose();
    this.instEdgeMuted.dispose();
    this.edge.dispose();
    this.edgeGhost.dispose();
    this.edgeXray.dispose();
    this.instEdgeXray.dispose();
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
