/**
 * Material specs for the two framed methods (docs/build3d/METHODS.md § steel and timber).
 * One framing kit (./walls.ts, ./roof.ts, ./envelope.ts) builds both; everything that differs
 * (member sizes, colors, plate build-up, joist spacing, rates, Hebrew names in the bills of
 * materials) lives here.
 *
 * Wall cross-section (inside each house wall's own thickness, so the shared finishing skins sit
 * exactly on the wall faces): from the exterior face inward
 *   cement board 12 mm | house wrap 2 mm | (timber: OSB 11 mm) | studs | 10 mm drywall zone,
 * the interior gypsum boards are the shared plaster-skin geometry (25 mm, 10 mm of it inside).
 */
import type { MaterialKey } from '../../../engine/types';

export type FrameMethod = 'steel' | 'timber';

export interface FrameSpec {
  method: FrameMethod;
  /** Letter after the phase number in step ids: p6s-… / p6t-… */
  k: 's' | 't';
  /** Stud width along the wall (steel flange / lumber thickness). */
  studW: number;
  /** Plate / track height (one layer). */
  plateH: number;
  /** Treated sole plate under the panels (timber only, m). */
  soleH: number;
  /** Top plates (timber double top plate, steel one track). */
  topPlates: number;
  spacing: number;
  /** Parapet stud spacing (cantilevered posts are closer). */
  parapetSpacing: number;
  /** Max panel length (shop-built panels). */
  panelMax: number;
  joistSpacing: number;
  /** Exterior build-up outside the studs (cement board + wrap [+ OSB]). */
  outerT: number;
  osbT: number;
  frameMat: MaterialKey;
  frameColor?: string;
  /** Treated sole plate color (timber) / track color (steel). */
  soleColor?: string;
  /** Big headers / roof girder (steel: hot-rolled beam, timber: glulam). */
  beamMat: MaterialKey;
  beamColor?: string;
  woolColor: string;
  deckMat: MaterialKey;
  deckColors: string[];
  rates: {
    baseM: number;
    wallM2: number;
    joistM2: number;
    deckM2: number;
    lowerM2: number;
    partitionM2: number;
    parapetM2: number;
    sheathingM2: number;
    insulationM2: number;
    drywallM2: number;
  };
  he: {
    /** Bill-of-materials names (Hebrew). */
    studs: string;
    base: string;
    joists: string;
    deck: string;
    wool: string;
    beam: string;
  };
}

/** Light-gauge steel (LSF): galvanized C-studs in U-tracks, C-joists, cement boards. */
export const STEEL: FrameSpec = {
  method: 'steel',
  k: 's',
  studW: 0.041,
  plateH: 0.04,
  soleH: 0,
  topPlates: 1,
  spacing: 0.6,
  parapetSpacing: 0.4,
  panelMax: 3.0,
  joistSpacing: 0.6,
  outerT: 0.014,
  osbT: 0,
  frameMat: 'galvanized',
  frameColor: '#C4CACF',
  soleColor: '#B9C0C6',
  beamMat: 'steel',
  beamColor: '#4F565E',
  woolColor: '#B9A777',
  deckMat: 'cementBoard',
  deckColors: ['#B3B1A9', '#ABA9A1'],
  rates: {
    baseM: 240,
    wallM2: 450,
    joistM2: 420,
    deckM2: 230,
    lowerM2: 450,
    partitionM2: 260,
    parapetM2: 350,
    sheathingM2: 190,
    insulationM2: 55,
    drywallM2: 115,
  },
  he: {
    studs: 'ניצבי פלדה מגולוונת C150',
    base: 'מסילות תחתונות U150',
    joists: 'קורות גג C250 מגולוונות',
    deck: 'לוחות צמנט-שבבים 22 מ״מ',
    wool: 'צמר סלעים 100 מ״מ',
    beam: 'קורת פלדה HEA',
  },
};

/** Timber frame: kiln-dried C24 studs, treated sole plates, OSB, I-joists. */
export const TIMBER: FrameSpec = {
  method: 'timber',
  k: 't',
  studW: 0.045,
  plateH: 0.045,
  soleH: 0.045,
  topPlates: 2,
  spacing: 0.6,
  parapetSpacing: 0.4,
  panelMax: 2.44,
  joistSpacing: 0.4,
  outerT: 0.025,
  osbT: 0.011,
  frameMat: 'lumber',
  soleColor: '#8E9467',
  beamMat: 'lumber',
  beamColor: '#C99459',
  woolColor: '#E2C45E',
  deckMat: 'osb',
  deckColors: ['#D3A25E', '#C9964F'],
  rates: {
    baseM: 200,
    wallM2: 480,
    joistM2: 480,
    deckM2: 200,
    lowerM2: 480,
    partitionM2: 280,
    parapetM2: 380,
    sheathingM2: 160,
    insulationM2: 60,
    drywallM2: 115,
  },
  he: {
    studs: 'ניצבי עץ C24 במידה 45×145',
    base: 'קורות סף מעץ מוגן (אימפרגנציה)',
    joists: 'קורות I מעץ בגובה 240 מ״מ',
    deck: 'לוחות OSB/3 בעובי 22 מ״מ',
    wool: 'צמר מינרלי 140 מ״מ',
    beam: 'קורת עץ מודבק (גלולם)',
  },
};

/** Thickness zones (m). */
export const CB_T = 0.012;
export const WRAP_T = 0.002;
/** Part of the interior skin that sits inside the wall (matches p10-plaster-interior). */
export const DRY_EMBED = 0.01;
export const OSB_COLORS = ['#D7A862', '#CB9A53'];
export const CEMENT_BOARD = '#BEBBB3';
export const GYPSUM = '#E4E1DA';
export const WRAP = '#E8EEF2';
/** Fresh interior plaster (concrete walls: ממ״ד, podium) before paint, as in p10-plaster-interior. */
export const FRESH_PLASTER = '#D3CABC';

/** Steel weights (kg per running meter) used for the bill of materials. */
export const STEEL_KG_M = {
  studExt: 2.4,
  studInt: 1.2,
  track: 2.0,
  trackInt: 1.0,
  header: 6.5,
  bridge: 0.6,
  strap: 0.6,
  joist: 5.2,
  rim: 4.4,
  /** Hot-rolled HEA 240 / IPE 240. */
  beam: 60,
} as const;
