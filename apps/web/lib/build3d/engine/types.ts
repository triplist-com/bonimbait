/**
 * Step engine contract (docs/build3d/SPEC.md §4).
 *
 * A Step is metadata + the Parts it adds + selectors of earlier parts it removes.
 * Parts are declarative: a Shape (geometry), a MaterialKey, tags, an entry Anim
 * and an exit animation. The viewer derives everything else (visibility per step,
 * highlight, ghost preview, x-ray, camera framing) from the ordered step list.
 *
 * Units: meters, model frame from lib/build3d/house/types.ts (+Y up, Y=0 = ±0.00).
 */
import type { TerrainGrid, Vec2, Vec3, ViewportId } from '../house/types';

export type { Vec2, Vec3, TerrainGrid };

/** Phases 0..13 (see PHASES in ./phases.ts for names and colors). */
export type PhaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/** Shared material palette keys (SPEC §6). Colors live in ./materials.ts. */
export type MaterialKey =
  | 'soil'
  | 'soilCut'
  | 'rock'
  | 'gravel'
  | 'concreteFresh'
  | 'concrete'
  | 'rebar'
  | 'plywood'
  | 'timber'
  | 'block'
  | 'plaster'
  | 'stone'
  | 'bitumen'
  | 'roofWhite'
  | 'glass'
  | 'aluminum'
  | 'porcelain'
  | 'parquet'
  | 'grass'
  | 'pipeRed'
  | 'pipeBlue'
  | 'drain'
  | 'conduit'
  | 'steel'
  | 'galvanized'
  | 'ribbon'
  | 'fenceFabric'
  | 'hole'
  | 'asphalt'
  | 'poly'
  | 'insulation'
  | 'paint'
  | 'wood'
  | 'water'
  | 'white'
  | 'ink'
  | 'string'
  /** Lamp surface: white by day, glows warm at dusk. */
  | 'light'
  /** Window glass that glows warm at dusk (interior lights on). */
  | 'glassLit';

/** Named procedural models (owned by lib/build3d/models; origin bottom-center, front +X, meters). */
export type { ModelName } from '../models';
import type { ModelName } from '../models';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Axis-aligned box (before rotY), centered at `at`. */
export interface BoxShape {
  kind: 'box';
  size: Vec3;
  at?: Vec3;
  rotY?: number;
}

/** Vertical cylinder / cone; `at` is the BOTTOM center. */
export interface CylinderShape {
  kind: 'cylinder';
  radius: number;
  /** Top radius (cone / frustum). Defaults to `radius`. */
  radiusTop?: number;
  height: number;
  at?: Vec3;
  segments?: number;
  /** No caps (rings, open holes). */
  open?: boolean;
}

/** Cylinder between two points (bars, posts, pipes without bends). */
export interface RodShape {
  kind: 'rod';
  a: Vec3;
  b: Vec3;
  radius: number;
  segments?: number;
}

/** Polygon in XZ extruded between y0 and y1 (slabs, beams outlines, pads). */
export interface ExtrudeShape {
  kind: 'extrude';
  outline: Vec2[];
  holes?: Vec2[][];
  y0: number;
  y1: number;
}

/** Round tube along a 3D polyline with rounded corners (pipes, conduits, bent bars). */
export interface TubeShape {
  kind: 'tube';
  points: Vec3[];
  radius: number;
  /** Corner fillet radius (m). Default 3 × radius. */
  bend?: number;
  closed?: boolean;
  radialSegments?: number;
}

/** Thin flat surface draped on a terrain grid, clipped exactly to `outline`. */
export interface DrapeShape {
  kind: 'drape';
  outline: Vec2[];
  grid: TerrainGrid;
  /** Height above the terrain (m). Default 0.03. */
  lift?: number;
  /** Sampling cell (m). Default 0.5. */
  cell?: number;
  /** Areas left out (e.g. lawn under paving): cells fully inside a hole are skipped. */
  holes?: Vec2[][];
}

/** 1-px line segments (string lines, survey marks). `points` are pairs. */
export interface LinesShape {
  kind: 'lines';
  points: Vec3[];
}

/** Several primitive shapes merged into ONE geometry (one draw call, one material). */
export interface MergeShape {
  kind: 'merge';
  shapes: PrimitiveShape[];
}

export type PrimitiveShape = BoxShape | CylinderShape | RodShape | ExtrudeShape | TubeShape | MergeShape;

/** Instanced boxes (blocks, boards, tiles, pavers). One draw call. */
export interface BoxesShape {
  kind: 'boxes';
  items: Array<{ at: Vec3; size: Vec3; rotY?: number; /** Full euler (x, y, z) overrides rotY. */ rot?: Vec3 }>;
}

/** Instanced bars between two points (rebar, posts, props). One draw call. */
export interface RodsShape {
  kind: 'rods';
  radius: number;
  items: Array<{ a: Vec3; b: Vec3; r?: number }>;
  segments?: number;
}

/** Instanced copies of one primitive shape (cages, stirrups, sleeves). */
export interface InstancesShape {
  kind: 'instances';
  of: PrimitiveShape;
  items: Array<{ at: Vec3; rotY?: number; rot?: Vec3; scale?: number | Vec3 }>;
}

/**
 * Terrain "cake" (top surface + soil-section sides down to baseY) from a grid.
 * With `from` (same dims) the geometry morphs from -> grid during the entry
 * animation (anim type 'morph'), e.g. natural ground -> excavated pit.
 * `ref` (same dims) colors cut areas (ref - h > 5 cm) darker.
 */
export interface TerrainShape {
  kind: 'terrain';
  grid: TerrainGrid;
  from?: TerrainGrid;
  ref?: TerrainGrid;
  baseY: number;
}

/** The plan sheet viewport, draped on a terrain grid (phase 0 + intro). */
export interface PlanShape {
  kind: 'plan';
  viewport: ViewportId;
  drape: TerrainGrid;
}

/** A named procedural model (lib/build3d/models). */
export interface ModelShape {
  kind: 'model';
  name: ModelName;
  /** Rescale to [x, y, z] meters (0 keeps the natural size on that axis). */
  size?: Vec3;
  seed?: number;
  color?: string;
  /** Model-specific pose (see lib/build3d/models/kit.ts Opts.pose), e.g. the pump-truck hose end. */
  pose?: number[];
}

export type InstancedShape = BoxesShape | RodsShape | InstancesShape;

export type Shape =
  | PrimitiveShape
  | InstancedShape
  | DrapeShape
  | LinesShape
  | TerrainShape
  | PlanShape
  | ModelShape;

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/**
 * Entry animations.
 * - drop:     falls in from above (`from` = [0, h, 0], default h ≈ 2.5 m) with a soft bounce
 * - rise:     grows up from its bottom (scale Y 0 -> 1)
 * - pour:     like rise but slower and linear-ish (concrete filling its form)
 * - grow:     uniform scale from its bottom-center
 * - fade:     opacity 0 -> 1
 * - slide:    moves in from `from` offset (default [0, 0, 6])
 * - morph:    terrain morph `from` -> `grid` (TerrainShape only)
 * - courses:  instanced: per-instance small drop, ordered bottom-up row by row
 * - sequence: instanced: per-instance grow, one after another (order by `order`)
 * - none:     appears instantly
 * Instanced parts with `stagger` > 0 animate per instance (any type).
 */
export type AnimType = 'drop' | 'rise' | 'pour' | 'grow' | 'fade' | 'slide' | 'morph' | 'courses' | 'sequence' | 'none';

export type Ease = 'out' | 'inOut' | 'linear' | 'bounce' | 'back';

export interface Anim {
  type: AnimType;
  /** Seconds after the step starts. Default 0. */
  delay?: number;
  /** Seconds per item (whole part when not staggered). Default per type. */
  duration?: number;
  /** Instanced parts: seconds between consecutive instances (or courses). */
  stagger?: number;
  /** Instanced parts: instance ordering for stagger. Default 'index' ('courses' for type courses). */
  order?: 'index' | 'courses' | 'x' | '-x' | 'z' | '-z' | 'y' | 'near';
  /** Origin for order 'near' (closest first). */
  origin?: Vec2;
  /** drop: [0, h, 0]; slide: offset the part starts at (meters, world axes). */
  from?: Vec3;
  ease?: Ease;
}

/** How a part leaves when a later step removes it. Default 'fade' ('lift' for tag formwork). */
export type ExitType = 'fade' | 'lift' | 'sink' | 'shrink' | 'slide' | 'none';

export interface Exit {
  type: ExitType;
  delay?: number;
  duration?: number;
  /** slide: offset to move to; lift: [0, h, 0]. */
  to?: Vec3;
}

// ---------------------------------------------------------------------------
// Parts & steps
// ---------------------------------------------------------------------------

export interface Part {
  /** Unique across the whole build (prefix with the step id). */
  id: string;
  shape: Shape;
  material: MaterialKey;
  /** Override the palette color (keeps the material's other properties). */
  color?: string;
  /** Extra translation applied to the whole part. */
  position?: Vec3;
  /** Rotation around +Y (radians) about `position`. */
  rotationY?: number;
  /** Free tags: 'formwork', 'machine', 'temp', 'ground', 'level:lower', ... Used by `remove`. */
  tags?: string[];
  anim?: Anim | AnimType;
  exit?: Exit | ExitType;
  /** Crisp outlines. Default: true except ground/drape/lines/glass/water/poly and rods. */
  edges?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** May appear as a faint ghost before it is built (ghost toggle). Default: permanent parts only. */
  ghost?: boolean;
  /** May be faded by automatic x-ray. Default true (false for tag 'ground'). */
  xray?: boolean;
  /** Magenta highlight while its step is current. Default true (false for tag 'ground'). */
  highlight?: boolean;
  /** Keep the model's idle loop running after its own step (machines that stay at work). */
  idle?: boolean;
  /** Base opacity < 1 for permanently translucent parts (poly sheet). */
  opacity?: number;
}

/** A line in the step's bill of materials ("IKEA parts list"). */
export interface MaterialLine {
  nameHe: string;
  qty: number;
  unitHe: string;
}

export interface CameraHint {
  /** What to frame. Default 'parts' (this step's new parts). */
  fit?: 'parts' | 'house' | 'site' | 'plan';
  /** Explicit box to frame (overrides fit). */
  bounds?: { min: Vec3; max: Vec3 };
  /** Explicit look-at target (overrides the framed box center). */
  target?: Vec3;
  /** Degrees around +Y from +Z (street side). Default ≈ 35. */
  azimuth?: number;
  /** Degrees from straight down (0) to horizon (90). Default ≈ 55. */
  polar?: number;
  /** Explicit distance (m). Default: fitted to bounds. */
  distance?: number;
  /** Multiplies the fitted distance. Default 1. */
  zoom?: number;
  /** Slow orbit while the step plays (reveal moments). */
  orbit?: boolean;
}

export interface ViewFlags {
  /** Occlusion x-ray: parts between the camera and this step's parts turn translucent. Default auto. */
  xray?: boolean;
  /** Parts whose bottom is above this Y turn translucent while the step is current. */
  ghostAbove?: number;
  /** Terrain turns translucent to show underground work (piles, sewer). */
  groundXray?: boolean;
  /** Parts with any of these tags turn translucent while the step is current (e.g. forms around rebar). */
  ghostTags?: string[];
  /**
   * Scene lighting. 'dusk' = warm low sun, deeper sky, and materials 'light' /
   * 'glassLit' glow (lamps, lit windows). Default 'day'.
   */
  lighting?: 'day' | 'dusk';
}

export interface Removal {
  ids?: string[];
  tags?: string[];
}

/** Text a step shows; comes from lib/build3d/content when present (content wins). */
export interface StepText {
  titleHe: string;
  descHe: string;
  crewHe: string;
  durationDays: number;
  tipHe: string;
  searchQuery: string;
  videos?: Array<{ titleHe: string; href: string }>;
  checkpointHe?: string;
}

export interface Step extends StepText {
  /** Canonical id from docs/build3d/STEPS.md. */
  id: string;
  phase: PhaseId;
  /** Bill of materials computed from geometry. */
  materials: MaterialLine[];
  /** Rough estimate (ILS, ex-VAT) — always labelled as an estimate in the UI. */
  costILS: number;
  parts: Part[];
  remove?: Removal;
  camera?: CameraHint;
  view?: ViewFlags;
}

/** What a step author writes: text is optional (falls back to content by id). */
export type StepDef = Omit<Step, keyof StepText> & Partial<StepText>;
