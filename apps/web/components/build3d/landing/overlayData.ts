import type { PlanOverlay, ViewportId } from '@/lib/build3d/house/types';

/**
 * TEMPORARY mock of lib/build3d/house/overlay.json (the Extractor's output),
 * hand-built from rough sheet coordinates. Replace by the real import once it exists.
 */
const K = 1.055; // rough view->page conversion used while eyeballing the sheet
const rect = (x: number, y: number, w: number, h: number, dx = 0) =>
  `M${Math.round((x + dx) * K)} ${Math.round(y * K)}h${Math.round(w * K)}v${Math.round(h * K)}h${-Math.round(w * K)}z`;

const DX = 744; // lower plan is the entrance plan shifted right
const vp = (id: ViewportId) => (id === 'entrance' ? 0 : DX);

function build(): PlanOverlay {
  const walls: PlanOverlay['walls'] = [];
  const concrete = (id: ViewportId, x: number, y: number, w: number, h: number) =>
    walls.push({ viewport: id, material: 'concrete', d: rect(x, y, w, h, vp(id)) });
  const block = (id: ViewportId, x: number, y: number, w: number, h: number) =>
    walls.push({ viewport: id, material: 'block', d: rect(x, y, w, h, vp(id)) });

  // entrance floor
  concrete('entrance', 400, 898, 128, 6); concrete('entrance', 400, 898, 6, 90);
  concrete('entrance', 522, 898, 6, 90); concrete('entrance', 400, 982, 128, 6);
  block('entrance', 400, 535, 6, 80); block('entrance', 400, 535, 130, 6);
  block('entrance', 523, 535, 6, 80); block('entrance', 400, 630, 100, 5);
  block('entrance', 400, 685, 90, 5); block('entrance', 684, 615, 6, 245);
  block('entrance', 530, 612, 160, 6); block('entrance', 530, 855, 160, 6);
  block('entrance', 402, 760, 125, 5); block('entrance', 660, 860, 6, 125);
  // lower floor
  concrete('lower', 405, 540, 6, 220); concrete('lower', 405, 540, 290, 6);
  concrete('lower', 690, 540, 6, 220); concrete('lower', 405, 755, 290, 6);
  block('lower', 480, 546, 5, 150); block('lower', 560, 600, 5, 150); block('lower', 460, 650, 100, 5);
  block('lower', 600, 650, 90, 5);

  const room = (id: ViewportId, nameHe: string, x: number, y: number, w: number, h: number, area: number) => ({
    viewport: id,
    nameHe,
    x: Math.round((x + w / 2 + vp(id)) * K),
    y: Math.round((y + h / 2) * K),
    area,
    d: rect(x + 6, y + 6, w - 8, h - 8, vp(id)),
  });
  const rooms: PlanOverlay['rooms'] = [
    room('entrance', 'סלון', 530, 618, 155, 240, 38.0),
    room('entrance', 'פינת אוכל ומטבח', 530, 860, 130, 125, 24.5),
    room('entrance', 'ממ״ד', 406, 905, 116, 78, 12.0),
    room('entrance', 'חדר הורים', 406, 541, 117, 88, 17.0),
    room('entrance', 'חדר ארונות', 406, 636, 85, 48, 7.5),
    room('lower', 'חדר שינה', 412, 546, 68, 100, 11.0),
    room('lower', 'חדר שינה', 500, 600, 90, 150, 14.0),
    room('lower', 'משפחה', 600, 546, 90, 100, 15.0),
  ];

  const opening = (id: ViewportId, kind: PlanOverlay['openings'][number]['kind'], x: number, y: number, w: number, angle: number) => ({
    viewport: id, kind, x: Math.round((x + vp(id)) * K), y: Math.round(y * K), w: Math.round(w * K), angle,
  });
  const openings: PlanOverlay['openings'] = [
    opening('entrance', 'entry-door', 450, 788, 36, 90),
    opening('entrance', 'window', 580, 855, 60, 0),
    opening('entrance', 'window', 684, 700, 60, 90),
    opening('entrance', 'sliding-door', 600, 612, 80, 0),
    opening('entrance', 'mamad-window', 400, 940, 40, 90),
    opening('entrance', 'door', 470, 630, 30, 0),
    opening('lower', 'window', 405, 600, 40, 90),
    opening('lower', 'window', 690, 600, 40, 90),
    opening('lower', 'door', 520, 650, 30, 0),
  ];

  return {
    widthPt: 1899,
    heightPt: 1701,
    viewports: [
      { id: 'entrance', bboxPt: [181, 209, 941, 1321], titleHe: 'קומת כניסה' },
      { id: 'lower', bboxPt: [965, 209, 1725, 1321], titleHe: 'קומה תחתונה' },
    ],
    walls,
    openings,
    rooms,
    dims: [
      { viewport: 'entrance', text: '860', x1: 538 * K, y1: 828 * K, x2: 690 * K, y2: 828 * K },
      { viewport: 'entrance', text: '800', x1: 706 * K, y1: 616 * K, x2: 706 * K, y2: 856 * K },
      { viewport: 'entrance', text: '500', x1: 440 * K, y1: 870 * K, x2: 530 * K, y2: 870 * K },
      { viewport: 'lower', text: '410', x1: 1180 * K, y1: 560 * K, x2: 1400 * K, y2: 560 * K },
    ],
    site: {
      boundary: [
        { viewport: 'entrance', d: `M${290 * K} ${398 * K}L${822 * K} ${402 * K}L${800 * K} ${1090 * K}Q${540 * K} ${1115 * K} ${290 * K} ${1140 * K}Z` },
        { viewport: 'lower', d: `M${1036 * K} ${398 * K}L${1566 * K} ${402 * K}L${1548 * K} ${1120 * K}Q${1290 * K} ${1150 * K} ${1036 * K} ${1140 * K}Z` },
      ],
      elevations: [
        { viewport: 'entrance', x: 770 * K, y: 395 * K, text: '268.24' },
        { viewport: 'entrance', x: 280 * K, y: 835 * K, text: '272.58' },
        { viewport: 'entrance', x: 790 * K, y: 1050 * K, text: '271.12' },
        { viewport: 'lower', x: 1560 * K, y: 395 * K, text: '268.24' },
      ],
    },
    stats: {
      walls: walls.length * 5, concreteWalls: 31, blockWalls: 58, openings: openings.length * 4,
      rooms: 17, levels: 2, builtAreaM2: 330, lotAreaM2: 560,
    },
  };
}

export const overlay: PlanOverlay = build();
