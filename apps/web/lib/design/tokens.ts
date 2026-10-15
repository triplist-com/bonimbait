/**
 * Bonim Bait design tokens (owner brand: bonimbayit.co.il).
 *
 * TypeScript mirror of the CSS custom properties in `app/globals.css`.
 * CSS and Tailwind read the variables; JS consumers that cannot read CSS
 * (OG images, SVG charts, the style guide, emails) read this file.
 * `tests/design/tokens.test.ts` fails if the two drift apart.
 *
 * Brand audit (live site CSS, 2026-10-14):
 *   #E61559  logo, icons, section highlights      -> primary-600 (DEFAULT)
 *   #E81359  Elementor buttons and borders         -> rendered as primary-600 (visually identical)
 *   #FE3366  Elementor "accent" (Calendly #FC3565) -> primary-500
 *   #C4125E  hover state                           -> primary-700
 *   #A30F4E  pressed state                         -> primary-800
 *   #231F20  logo wordmark and body text           -> ink-900 (DEFAULT)
 *   #2E2F2E  icon outlines                         -> close to ink-800
 * Brand type is "Atlas" (AAA foundry, commercial licence, not redistributable);
 * Heebo is the free stand-in (see docs/platform/DESIGN_SYSTEM.md).
 *
 * Client-safe: no server imports.
 */

export type Scale = Readonly<Record<string, string>>;

/** Brand magenta. 600 is the exact logo hex; white text on it is 4.55:1. */
export const primary = {
  50: '#FFF0F4',
  100: '#FFE1EA',
  200: '#FFC4D5',
  300: '#FF97B4',
  400: '#FE5A87',
  500: '#FE3366',
  600: '#E61559',
  700: '#C4125E',
  800: '#A30F4E',
  900: '#7D0C3D',
  950: '#4D0624',
} as const satisfies Scale;

/**
 * Warm "concrete" neutrals anchored on the brand ink (#231F20 at 900).
 * Text: 900 primary, 600 secondary (7.3:1), 500 muted (4.9:1 on white).
 * 400 is for icons, placeholders and disabled states (3.2:1), never body text.
 */
export const ink = {
  50: '#F8F6F4',
  100: '#F1EEEB',
  200: '#E4DFDA',
  300: '#CFC8C2',
  400: '#958D87',
  500: '#776F6A',
  600: '#5C5551',
  700: '#46403D',
  800: '#322D2C',
  900: '#231F20',
  950: '#161314',
} as const satisfies Scale;

/** Warm limestone / sand surfaces (Jerusalem stone, plaster, sand). */
export const sand = {
  50: '#FBF8F3',
  100: '#F5EFE5',
  200: '#EBE1D1',
  300: '#DDCDB4',
  400: '#C8B08E',
  500: '#AE916B',
  600: '#8E7354',
  700: '#6F5940',
  800: '#51412F',
  900: '#362B20',
} as const satisfies Scale;

/** Semantic scales. Text on white uses 700; fills and icons use 600 (or 500). */
export const success = {
  50: '#ECF8F1',
  100: '#D3EFDF',
  200: '#A8DFC0',
  500: '#1FA463',
  600: '#158A52',
  700: '#0F6E42',
  800: '#0B5533',
} as const satisfies Scale;

export const warning = {
  50: '#FFF8EB',
  100: '#FDEBC8',
  200: '#FAD58E',
  500: '#F0A30A',
  600: '#D48806',
  700: '#8A5A00',
  800: '#6B4500',
} as const satisfies Scale;

export const danger = {
  50: '#FEF2F1',
  100: '#FDE2DF',
  200: '#FAC3BD',
  500: '#E5483A',
  600: '#CF3226',
  700: '#A8251C',
  800: '#861E17',
} as const satisfies Scale;

export const info = {
  50: '#EFF6FD',
  100: '#DBEBFB',
  200: '#B5D6F6',
  500: '#2A78D6',
  600: '#1F64B8',
  700: '#194F91',
  800: '#143D70',
} as const satisfies Scale;

/** Every themeable scale, by Tailwind colour name. */
export const COLOR_SCALES = { primary, ink, sand, success, warning, danger, info } as const;
export type ColorScaleName = keyof typeof COLOR_SCALES;

/** Semantic surface and text roles (CSS: --bb-<role>). */
export const semantic = {
  paper: '#FAF8F5', // page plane
  surface: '#FFFFFF', // cards, header, inputs
  'surface-sunken': ink[50],
  line: ink[200],
  'line-subtle': ink[100],
  text: ink[900],
  'text-muted': ink[600],
  'text-subtle': ink[500],
  link: primary[700],
  focus: primary[600],
} as const satisfies Scale;

/** Exact hexes found on bonimbayit.co.il, for reference and brand assets. */
export const brandHex = {
  magenta: '#E61559',
  magentaButton: '#E81359',
  accent: '#FE3366',
  calendly: '#FC3565',
  hover: '#C4125E',
  pressed: '#A30F4E',
  ink: '#231F20',
  iconInk: '#2E2F2E',
  stageIconAccent: '#EF3D69',
  whatsapp: '#25D366',
} as const;

/**
 * Data-viz palette for dashboards (light surfaces).
 *
 * Categorical order was enumerated with the dataviz validator, brand magenta
 * pinned to slot 1: worst adjacent CVD deltaE 10.0 (target >= 8), normal-vision
 * 24.8 (floor 15), first three slots pass all-pairs (CVD 12.4). Slot 3 (amber)
 * is 2.75:1 on white: charts that use it must show direct labels or a table.
 * Assign in order, never cycle; a 9th series folds into "Other".
 */
export const dataViz = {
  surface: '#FFFFFF',
  categorical: ['#E61559', '#2A78D6', '#D18F00', '#008300', '#8A6FDF', '#199E70', '#6250D6', '#EB6834'],
  /** One-hue magnitude ramp (light -> dark). For ordinal marks start at 300. */
  sequential: [primary[100], primary[200], primary[300], primary[400], primary[500], primary[600], primary[700], primary[800], primary[900]],
  /** Diverging: under (blue) <-> neutral <-> over (magenta). */
  diverging: {
    negative: ['#194F91', '#2A78D6', '#86B6EF'],
    neutral: ink[100],
    positive: [primary[300], primary[600], primary[800]],
  },
  /** Reserved status colours: always paired with an icon and a label. */
  status: { good: success[600], warning: warning[500], serious: '#EC835A', critical: danger[600] },
  chrome: { grid: ink[100], axis: ink[300], label: ink[500], text: ink[900] },
} as const;

export const motion = {
  duration: { instant: 100, fast: 150, base: 200, slow: 300, slower: 500 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    in: 'cubic-bezier(0.7, 0, 0.84, 0)',
  },
} as const;

/** "#E61559" -> "230 21 89" (space-separated channels for rgb(var() / a)). */
export function hexToChannels(hex: string): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

/** All CSS custom properties this file defines: `--bb-primary-600` -> "#E61559". */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, scale] of Object.entries(COLOR_SCALES)) {
    for (const [step, hex] of Object.entries(scale)) vars[`--bb-${name}-${step}`] = hex;
  }
  for (const [role, hex] of Object.entries(semantic)) vars[`--bb-${role}`] = hex;
  return vars;
}
