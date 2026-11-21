/**
 * Plausible stand-in for house.json (plot 43) while the extractor works.
 * Proportions follow the real sheet: house ~10.8 × 17 m, lower floor under the
 * north half (z 0..8.2) at −3.27, flat roof at +3.30, lot ~20 × 26 m sloping from
 * about +0.9 at the street (+Z) to −3.3 at the back (−Z). Origin = house NW corner.
 */
import type { HouseModel, TerrainGrid, Vec2, Wall, Opening } from './types';

const MPP = 0.0352778; // meters per PDF point at 1:100

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function makeGrid(fn: (x: number, z: number) => number): TerrainGrid {
  const origin: Vec2 = [-8, -8];
  const cell = 1;
  const cols = 29;
  const rows = 35;
  const heights: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = origin[0] + c * cell;
      const z = origin[1] + r * cell;
      heights.push(Math.round(fn(x, z) * 1000) / 1000);
    }
  }
  return { origin, cell, cols, rows, heights };
}

const natural = (x: number, z: number) =>
  -3.3 + 4.2 * smoothstep(-3, 17, z) + 0.03 * (x - 6) + 0.12 * Math.sin(x * 0.45 + z * 0.3);

const finished = (x: number, z: number) => {
  if (z < -0.3) return -3.3 + 0.02 * (x - 6) * 0;
  if (z > 17.2) return 0.15 + 0.5 * smoothstep(17.2, 21.5, z);
  return natural(x, z);
};

let wallSeq = 0;
function wall(
  level: Wall['level'],
  material: Wall['material'],
  role: Wall['role'],
  a: Vec2,
  b: Vec2,
  thickness: number,
  baseY: number,
  height: number,
): Wall {
  wallSeq += 1;
  return { id: `w${wallSeq}`, level, material, role, a, b, thickness, baseY, height };
}

const E_BASE = -0.05;
const E_H = 3.1;
const L_BASE = -3.32;
const L_H = 3.02;

const walls: Wall[] = [
  // Entrance floor — exterior
  wall('entrance', 'block', 'exterior', [0, 0], [5.8, 0], 0.25, E_BASE, E_H), // w1
  wall('entrance', 'block', 'exterior', [5.8, 0], [5.8, 2.8], 0.25, E_BASE, E_H), // w2
  wall('entrance', 'block', 'exterior', [5.8, 2.8], [10.8, 2.8], 0.25, E_BASE, E_H), // w3
  wall('entrance', 'block', 'exterior', [10.8, 2.8], [10.8, 17], 0.25, E_BASE, E_H), // w4
  wall('entrance', 'block', 'exterior', [10.8, 17], [4.3, 17], 0.25, E_BASE, E_H), // w5
  wall('entrance', 'concrete', 'mamad', [4.3, 17], [0, 17], 0.3, E_BASE, E_H), // w6
  wall('entrance', 'concrete', 'mamad', [0, 17], [0, 13.5], 0.3, E_BASE, E_H), // w7
  wall('entrance', 'block', 'exterior', [0, 13.5], [0, 0], 0.25, E_BASE, E_H), // w8
  // Entrance floor — mamad inner walls + partitions
  wall('entrance', 'concrete', 'mamad', [0, 13.5], [4.3, 13.5], 0.3, E_BASE, E_H), // w9
  wall('entrance', 'concrete', 'mamad', [4.3, 13.5], [4.3, 17], 0.3, E_BASE, E_H), // w10
  wall('entrance', 'block', 'interior', [0, 6], [5.8, 6], 0.1, E_BASE, E_H), // w11
  wall('entrance', 'block', 'interior', [3.2, 6], [3.2, 13.5], 0.1, E_BASE, E_H), // w12
  wall('entrance', 'block', 'interior', [5.8, 2.8], [5.8, 6], 0.1, E_BASE, E_H), // w13
  // Lower floor
  wall('lower', 'block', 'exterior', [0, 0], [10.8, 0], 0.25, L_BASE, L_H), // w14
  wall('lower', 'concrete', 'retaining', [10.8, 0], [10.8, 8.2], 0.3, L_BASE, L_H), // w15
  wall('lower', 'concrete', 'retaining', [10.8, 8.2], [0, 8.2], 0.3, L_BASE, L_H), // w16
  wall('lower', 'concrete', 'retaining', [0, 8.2], [0, 0], 0.3, L_BASE, L_H), // w17
  wall('lower', 'block', 'interior', [3.6, 0], [3.6, 8.2], 0.1, L_BASE, L_H), // w18
  wall('lower', 'block', 'interior', [6.8, 0], [6.8, 5], 0.1, L_BASE, L_H), // w19
  wall('lower', 'block', 'interior', [3.6, 5], [10.8, 5], 0.1, L_BASE, L_H), // w20
];

let openingSeq = 0;
function opening(
  wallId: string,
  level: Opening['level'],
  kind: Opening['kind'],
  offset: number,
  width: number,
  sill: number,
  head: number,
): Opening {
  openingSeq += 1;
  return { id: `o${openingSeq}`, wallId, level, kind, offset, width, sill, head };
}

const openings: Opening[] = [
  opening('w1', 'entrance', 'window', 2.9, 1.8, 0.9, 2.2),
  opening('w3', 'entrance', 'vitrine', 2.5, 3.6, 0, 2.5),
  opening('w4', 'entrance', 'window', 3.2, 1.6, 0.9, 2.2),
  opening('w4', 'entrance', 'window', 8.5, 2.4, 0.9, 2.2),
  opening('w5', 'entrance', 'window', 3.2, 2.4, 1.0, 2.2),
  opening('w6', 'entrance', 'mamad-window', 2.2, 1.0, 1.0, 2.0),
  opening('w8', 'entrance', 'entry-door', 2.5, 1.1, 0, 2.3),
  opening('w8', 'entrance', 'window', 10.2, 1.4, 0.9, 2.2),
  opening('w9', 'entrance', 'mamad-door', 2.6, 0.9, 0, 2.1),
  opening('w11', 'entrance', 'door', 4.4, 0.9, 0, 2.1),
  opening('w14', 'lower', 'sliding-door', 1.8, 2.4, 0, 2.3),
  opening('w14', 'lower', 'sliding-door', 5.2, 2.4, 0, 2.3),
  opening('w14', 'lower', 'window', 8.8, 2.0, 0.9, 2.2),
  opening('w18', 'lower', 'door', 6.5, 0.9, 0, 2.1),
  opening('w20', 'lower', 'door', 1.5, 0.9, 0, 2.1),
];

const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

const area = (p: Vec2[]) =>
  Math.abs(p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0)) / 2;

function room(
  id: string,
  level: 'lower' | 'entrance',
  nameHe: string,
  kind: HouseModel['rooms'][number]['kind'],
  polygon: Vec2[],
) {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  const labelAt: Vec2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  return { id, level, nameHe, kind, polygon, labelAt, area: Math.round(area(polygon) * 10) / 10 };
}

const entranceOutline: Vec2[] = [
  [0, 0],
  [5.8, 0],
  [5.8, 2.8],
  [10.8, 2.8],
  [10.8, 17],
  [0, 17],
];

export const stubHouse: HouseModel = {
  version: 1,
  meta: {
    titleHe: 'בית פרטי — מגרש 43',
    plot: '43',
    zeroAbsolute: 271.5,
    sourcePdf: {
      title: 'Model',
      creator: 'AutoCAD',
      pageWidthPt: 1899,
      pageHeightPt: 1701,
      sizeBytes: 489533,
    },
    assumptions: ['STUB — placeholder geometry until house.json is extracted'],
  },
  sheet: {
    widthPt: 1899,
    heightPt: 1701,
    image: '/build3d/plan-sheet.webp',
    viewports: [
      {
        id: 'entrance',
        titleHe: 'קומת כניסה',
        bboxPt: [181, 208, 939, 1319],
        originPt: [422, 559],
        metersPerPt: MPP,
      },
      {
        id: 'lower',
        titleHe: 'קומה תחתונה',
        bboxPt: [967, 208, 1725, 1319],
        originPt: [1213, 559],
        metersPerPt: MPP,
      },
    ],
  },
  levels: [
    { id: 'lower', nameHe: 'קומה תחתונה', floorY: -3.27, slabThickness: 0.2, ceilingHeight: 2.72 },
    { id: 'entrance', nameHe: 'קומת כניסה', floorY: 0, slabThickness: 0.25, ceilingHeight: 3.0 },
    { id: 'roof', nameHe: 'גג', floorY: 3.3, slabThickness: 0.25, ceilingHeight: 0 },
  ],
  site: {
    boundary: [
      [-4.1, -5],
      [15.8, -5],
      [15.8, 21.2],
      [5.5, 21.9],
      [-4.1, 21.4],
    ],
    buildingLines: [
      [
        [-0.3, -1],
        [11.6, -1],
        [11.6, 17.8],
        [-0.3, 17.8],
        [-0.3, -1],
      ],
    ],
    spotElevations: [
      { p: [-3, -4], y: -3.26, labelAbs: 268.24 },
      { p: [14.5, -4], y: -3.26, labelAbs: 268.24 },
      { p: [-3.5, 9], y: -1.62, labelAbs: 269.88 },
      { p: [15, 13], y: -0.38, labelAbs: 271.12 },
      { p: [0, 21], y: 1.08, labelAbs: 272.58 },
      { p: [9, 21.5], y: 0.68, labelAbs: 272.18 },
    ],
    terrainNatural: makeGrid(natural),
    terrainFinished: makeGrid(finished),
    street: [
      [-8, 24.6],
      [20, 24.2],
    ],
    northAngle: Math.PI / 4,
    neighbors: [
      { labelHe: 'מגרש 42', at: [-7, 8] },
      { labelHe: 'מגרש 44', at: [19, 8] },
    ],
  },
  walls,
  columns: [
    { id: 'c1', level: 'lower', center: [5.2, 0], size: [0.3, 0.3], baseY: L_BASE, height: L_H },
    { id: 'c2', level: 'entrance', center: [10.8, 2.8], size: [0.3, 0.3], baseY: E_BASE, height: E_H },
  ],
  openings,
  rooms: [
    room('r1', 'entrance', 'יחידת הורים', 'master', rect(0, 0, 5.8, 6)),
    room('r2', 'entrance', 'סלון', 'living', rect(5.8, 2.8, 10.8, 9)),
    room('r3', 'entrance', 'פינת אוכל', 'dining', rect(3.2, 9, 10.8, 13.5)),
    room('r4', 'entrance', 'מטבח', 'kitchen', rect(4.3, 13.5, 10.8, 17)),
    room('r5', 'entrance', 'ממ"ד', 'mamad', rect(0, 13.5, 4.3, 17)),
    room('r6', 'entrance', 'כניסה', 'entry', rect(0, 6, 3.2, 13.5)),
    room('r7', 'entrance', 'מרפסת', 'terrace', rect(5.8, 0, 10.8, 2.8)),
    room('r8', 'lower', 'חדר שינה', 'bedroom', rect(0, 0, 3.6, 5)),
    room('r9', 'lower', 'חדר שינה', 'bedroom', rect(3.6, 0, 6.8, 5)),
    room('r10', 'lower', 'חדר משפחה', 'family', rect(6.8, 0, 10.8, 5)),
    room('r11', 'lower', 'חדר רחצה', 'bath', rect(0, 5, 3.6, 8.2)),
    room('r12', 'lower', 'מבואה', 'hall', rect(3.6, 5, 10.8, 8.2)),
  ],
  stairs: [
    {
      id: 's1',
      from: 'lower',
      to: 'entrance',
      footprint: rect(1.6, 5.3, 2.8, 12.6),
      path: [
        [2.2, 5.6],
        [2.2, 12.3],
      ],
      width: 1.1,
      risers: 18,
    },
  ],
  slabs: [
    { id: 'sl1', level: 'lower', role: 'ground', outline: rect(0, 0, 10.8, 8.2), topY: -3.32, thickness: 0.2 },
    {
      id: 'sl2',
      level: 'entrance',
      role: 'suspended',
      outline: [
        [0, 0],
        [5.8, 0],
        [5.8, 2.8],
        [10.8, 2.8],
        [10.8, 8.2],
        [0, 8.2],
      ],
      topY: -0.05,
      thickness: 0.25,
    },
    { id: 'sl3', level: 'entrance', role: 'terrace', outline: rect(5.8, 0, 10.8, 2.8), topY: -0.15, thickness: 0.25 },
    { id: 'sl4', level: 'entrance', role: 'ground', outline: rect(0, 8.2, 10.8, 17), topY: -0.05, thickness: 0.25 },
    { id: 'sl5', level: 'roof', role: 'roof', outline: entranceOutline, topY: 3.3, thickness: 0.25 },
  ],
  outdoor: [
    { id: 'od1', kind: 'parking', nameHe: 'חניה', outline: rect(0.3, 17.8, 6.3, 21.3), y: 0.6 },
    { id: 'od2', kind: 'path', nameHe: 'שביל מרוצף', outline: rect(6.6, 17.2, 8.2, 21.4), y: 0.35 },
    { id: 'od3', kind: 'lawn', nameHe: 'דשא', outline: rect(-3.6, -4.5, 15.2, -0.6), y: -3.3 },
    { id: 'od4', kind: 'deck', nameHe: 'דק', outline: rect(0.5, -2.6, 6.5, -0.2), y: -3.25 },
    { id: 'od5', kind: 'pergola', nameHe: 'פרגולה', outline: rect(5.9, 0.1, 10.7, 2.7), y: -0.15 },
  ],
  fixtures: [
    { id: 'f1', level: 'entrance', kind: 'bed-double', center: [2.6, 3.2], size: [1.8, 2.0], rotation: 0 },
    { id: 'f2', level: 'entrance', kind: 'sofa', center: [9.8, 6], size: [2.6, 0.95], rotation: Math.PI / 2 },
    { id: 'f3', level: 'entrance', kind: 'dining-table', center: [7, 11.2], size: [2.2, 1.0], rotation: 0 },
    { id: 'f4', level: 'entrance', kind: 'kitchen-island', center: [7.6, 15], size: [2.4, 1.0], rotation: 0 },
    { id: 'f5', level: 'lower', kind: 'bed-single', center: [1.8, 2.5], size: [0.9, 2.0], rotation: 0 },
    { id: 'f6', level: 'lower', kind: 'toilet', center: [0.6, 7.6], size: [0.4, 0.65], rotation: 0 },
    { id: 'f7', level: 'site', kind: 'car', center: [1.9, 19.6], size: [1.8, 4.5], rotation: Math.PI / 2, y: 0.6 },
    { id: 'f8', level: 'site', kind: 'car', center: [4.7, 19.6], size: [1.8, 4.5], rotation: Math.PI / 2, y: 0.6 },
    { id: 'f9', level: 'site', kind: 'tree', center: [-2.2, -3], size: [3, 3], rotation: 0, y: -3.3 },
    { id: 'f10', level: 'site', kind: 'tree', center: [13.5, -3.2], size: [3, 3], rotation: 0, y: -3.3 },
  ],
};
