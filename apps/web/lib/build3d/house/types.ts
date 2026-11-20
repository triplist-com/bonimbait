/**
 * House model schema for the "plan to 3D assembly" demo (/3d).
 *
 * This file is the contract between the plan extraction (house.json, overlay.json)
 * and everything that renders or sequences the house (engine, steps, landing).
 * Change it only through the orchestrator (docs/build3d/SPEC.md).
 *
 * Coordinate frame (model space), all lengths in METERS:
 *   +X = drawing right, +Z = drawing down (toward the street / parking),
 *   +Y = up. Y = 0 is the ±0.00 datum (entrance floor finished level, 271.50 abs).
 *   Looking down from +Y with screen-up = -Z reproduces the drawing orientation.
 * Sheet space: PDF page points, origin top-left, y down (PyMuPDF convention),
 *   page 1899 x 1701 pt. plan-sheet.webp is this page rendered at 3600 px wide.
 */

/** [x, z] in meters, model space. */
export type Vec2 = [number, number];
/** [x, y, z] in meters, model space. */
export type Vec3 = [number, number, number];

export type LevelId = 'lower' | 'entrance' | 'roof';
export type ViewportId = 'entrance' | 'lower';

export interface HouseModel {
  version: 1;
  meta: {
    titleHe: string;
    plot: string;
    /** Absolute elevation of ±0.00 in meters (271.50). */
    zeroAbsolute: number;
    sourcePdf: {
      title: string;
      creator: string;
      pageWidthPt: number;
      pageHeightPt: number;
      sizeBytes: number;
    };
    /** Everything not read from the drawing (heights, slab thickness, sills...). */
    assumptions: string[];
  };
  sheet: {
    widthPt: number;
    heightPt: number;
    /** Public URL of the rendered sheet image. */
    image: string;
    viewports: SheetViewport[];
  };
  levels: Level[];
  site: Site;
  walls: Wall[];
  columns: Column[];
  openings: Opening[];
  rooms: Room[];
  stairs: Stair[];
  slabs: Slab[];
  outdoor: OutdoorArea[];
  fixtures: Fixture[];
}

export interface SheetViewport {
  id: ViewportId;
  titleHe: string;
  /** Drawing frame on the sheet: [x0, y0, x1, y1] in page points. */
  bboxPt: [number, number, number, number];
  /**
   * Sheet -> model: x = (px - originPt[0]) * metersPerPt, z = (py - originPt[1]) * metersPerPt.
   * Both viewports MUST map to the same model frame (the two plans overlay exactly).
   */
  originPt: [number, number];
  metersPerPt: number;
}

export interface Level {
  id: LevelId;
  nameHe: string;
  /** Finished floor level, meters relative to ±0.00. Roof: top of roof slab. */
  floorY: number;
  /** Structural slab thickness under this floor (m). */
  slabThickness: number;
  /** Clear height from finished floor to underside of the slab above (m). */
  ceilingHeight: number;
}

export interface TerrainGrid {
  /** Model-space [x, z] of grid node (0, 0). */
  origin: Vec2;
  /** Node spacing in meters. */
  cell: number;
  cols: number;
  rows: number;
  /** rows * cols heights (m rel. ±0.00), row-major, row r is z = origin.z + r * cell. */
  heights: number[];
}

export interface Site {
  /** Lot polygon (counter-clockwise or clockwise, closed implicitly). */
  boundary: Vec2[];
  /** Setback ("קו בניין") polylines. */
  buildingLines: Vec2[][];
  /** Spot elevations read from the drawing, relative to ±0.00. */
  spotElevations: Array<{ p: Vec2; y: number; labelAbs?: number }>;
  /** Natural ground before works, covering the lot plus a margin. */
  terrainNatural: TerrainGrid;
  /** Finished grade after landscaping (same grid as terrainNatural). */
  terrainFinished: TerrainGrid;
  /** Where the street is, as a polyline just outside the lot. */
  street?: Vec2[];
  /** Angle of true north in model XZ, radians; 0 means north = -Z (drawing up). */
  northAngle: number;
  /** Neighbor lots for context labels. */
  neighbors?: Array<{ labelHe: string; at: Vec2 }>;
}

export type WallMaterial = 'concrete' | 'block';
export type WallRole =
  | 'exterior'
  | 'interior'
  | 'retaining'
  | 'mamad'
  | 'parapet'
  | 'site-retaining'
  | 'fence';

export interface Wall {
  id: string;
  level: LevelId | 'site';
  material: WallMaterial;
  role: WallRole;
  /** Centerline endpoints. */
  a: Vec2;
  b: Vec2;
  thickness: number;
  /** Bottom of the wall (top of the structure below), m rel. ±0.00. */
  baseY: number;
  /** Height from baseY (to underside of slab above for storey walls). */
  height: number;
  /** Original filled polygon(s) from the sheet, page points (for the 2D overlay). */
  polygonPt?: Array<Array<[number, number]>>;
}

export interface Column {
  id: string;
  level: LevelId;
  center: Vec2;
  /** [sizeX, sizeZ] before rotation. */
  size: [number, number];
  rotation?: number;
  baseY: number;
  height: number;
}

export type OpeningKind =
  | 'door'
  | 'entry-door'
  | 'window'
  | 'vitrine'
  | 'sliding-door'
  | 'mamad-door'
  | 'mamad-window'
  | 'opening';

export interface Opening {
  id: string;
  wallId: string;
  level: LevelId;
  kind: OpeningKind;
  /** Distance from wall.a to the opening CENTER along the wall (m). */
  offset: number;
  width: number;
  /** Sill and head heights relative to the level's floorY (m). */
  sill: number;
  head: number;
  /** For doors: which side of the wall it swings to (+1/-1 along the wall normal). */
  swingSide?: 1 | -1;
}

export type RoomKind =
  | 'living'
  | 'kitchen'
  | 'dining'
  | 'bedroom'
  | 'master'
  | 'bath'
  | 'wc'
  | 'closet'
  | 'mamad'
  | 'entry'
  | 'hall'
  | 'stairs'
  | 'laundry'
  | 'family'
  | 'storage'
  | 'terrace';

export interface Room {
  id: string;
  level: LevelId;
  nameHe: string;
  kind: RoomKind;
  polygon: Vec2[];
  labelAt: Vec2;
  /** Area in m², computed from polygon. */
  area: number;
  /** Dimension label exactly as written on the plan, e.g. "500/800" (cm). */
  dimsLabel?: string;
}

export interface Stair {
  id: string;
  from: LevelId;
  to: LevelId;
  footprint: Vec2[];
  /** Walking line from bottom to top, model XZ. */
  path: Vec2[];
  width: number;
  risers: number;
}

export type SlabRole = 'ground' | 'suspended' | 'roof' | 'terrace' | 'balcony';

export interface Slab {
  id: string;
  /** The level whose floor this slab carries ('roof' = roof slab). */
  level: LevelId;
  role: SlabRole;
  outline: Vec2[];
  holes?: Vec2[][];
  /** Top of structural slab, m rel. ±0.00. */
  topY: number;
  thickness: number;
}

export type OutdoorKind =
  | 'parking'
  | 'path'
  | 'deck'
  | 'lawn'
  | 'gravel'
  | 'planter'
  | 'pergola'
  | 'terrace'
  | 'garden'
  | 'steps';

export interface OutdoorArea {
  id: string;
  kind: OutdoorKind;
  nameHe?: string;
  outline: Vec2[];
  /** Finished surface level, m rel. ±0.00. */
  y: number;
}

export type FixtureKind =
  | 'bed-double'
  | 'bed-single'
  | 'sofa'
  | 'armchair'
  | 'coffee-table'
  | 'dining-table'
  | 'kitchen-island'
  | 'kitchen-counter'
  | 'toilet'
  | 'sink'
  | 'shower'
  | 'bathtub'
  | 'wardrobe'
  | 'desk'
  | 'tv'
  | 'car'
  | 'outdoor-table'
  | 'lounge-chair'
  | 'washer'
  | 'tree';

export interface Fixture {
  id: string;
  level: LevelId | 'site';
  kind: FixtureKind;
  center: Vec2;
  /** [sizeX, sizeZ] before rotation, meters. */
  size: [number, number];
  /** Radians around +Y. */
  rotation: number;
  /** Bottom of the fixture, m rel. ±0.00 (defaults to the level floor). */
  y?: number;
}

/**
 * 2D overlay for the landing "analysis" animation, in SHEET page points.
 * Drawn as SVG over plan-sheet.webp (viewBox = 0 0 widthPt heightPt).
 */
export interface PlanOverlay {
  widthPt: number;
  heightPt: number;
  viewports: Array<{ id: ViewportId; bboxPt: [number, number, number, number]; titleHe: string }>;
  /** Wall fills: SVG path data in page points, grouped for staged reveal. */
  walls: Array<{ viewport: ViewportId; material: WallMaterial; d: string }>;
  openings: Array<{ viewport: ViewportId; kind: OpeningKind; x: number; y: number; w: number; angle: number }>;
  rooms: Array<{ viewport: ViewportId; nameHe: string; x: number; y: number; area: number; d: string }>;
  /** A few dimension strings to "read" during the animation. */
  dims: Array<{ viewport: ViewportId; text: string; x1: number; y1: number; x2: number; y2: number }>;
  /** Lot boundary + spot elevations, for the site stage of the animation. */
  site: {
    boundary: Array<{ viewport: ViewportId; d: string }>;
    elevations: Array<{ viewport: ViewportId; x: number; y: number; text: string }>;
  };
  /** Headline numbers the animation counts up to. */
  stats: {
    walls: number;
    concreteWalls: number;
    blockWalls: number;
    openings: number;
    rooms: number;
    levels: number;
    builtAreaM2: number;
    lotAreaM2: number;
  };
}
