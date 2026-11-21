import type { PhaseId } from './types';
import { DEFAULT_METHOD, type MethodId } from '../methods';
import { METHODS_INFO } from '../content/methods';

export interface PhaseInfo {
  id: PhaseId;
  /** Name for the active construction method (see setPhaseMethod). */
  nameHe: string;
  /** UI chip / timeline segment color. */
  color: string;
}

/** Construction phases (SPEC §5): default (concrete) names and UI colors. */
const BASE: readonly PhaseInfo[] = [
  { id: 0, nameHe: 'התוכנית', color: '#64748B' },
  { id: 1, nameHe: 'הכנת המגרש', color: '#7E9A45' },
  { id: 2, nameHe: 'עבודות עפר', color: '#B9813F' },
  { id: 3, nameHe: 'יסודות', color: '#7D8590' },
  { id: 4, nameHe: 'קומה תחתונה — שלד', color: '#3F7FC4' },
  { id: 5, nameHe: 'תקרת הקומה התחתונה', color: '#2A9C93' },
  { id: 6, nameHe: 'קומת כניסה — שלד', color: '#2D5C9A' },
  { id: 7, nameHe: 'בנייה', color: '#C0563B' },
  { id: 8, nameHe: 'גג', color: '#7A5BA8' },
  { id: 9, nameHe: 'מערכות', color: '#E0831C' },
  { id: 10, nameHe: 'טיח וחיפוי', color: '#B39A6B' },
  { id: 11, nameHe: 'גמרים', color: '#CF5F8A' },
  { id: 12, nameHe: 'פיתוח', color: '#4A9E57' },
  { id: 13, nameHe: 'מסירת מפתח', color: '#E61559' },
];

let activeMethod: MethodId = DEFAULT_METHOD;

/**
 * Select the method whose phase names `PHASES[i].nameHe` / `phaseInfo()` report.
 * The assembly viewer calls it while rendering, before its children (step card, scrubber,
 * step list) read the names; only one viewer is mounted at a time.
 */
export function setPhaseMethod(method: MethodId): void {
  activeMethod = method;
}

/** Phase name for a method: METHODS_INFO[method].phaseNamesHe override, else the default name. */
export function phaseNameHe(id: PhaseId, method: MethodId = activeMethod): string {
  return METHODS_INFO[method]?.phaseNamesHe[id] ?? BASE[id].nameHe;
}

/** Construction phases with their UI colors; `nameHe` follows the active method. */
export const PHASES: readonly PhaseInfo[] = BASE.map((b) => ({
  id: b.id,
  color: b.color,
  get nameHe() {
    return phaseNameHe(b.id);
  },
}));

export function phaseInfo(id: PhaseId): PhaseInfo {
  return PHASES[id];
}
