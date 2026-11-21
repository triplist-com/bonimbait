/**
 * Construction-method metadata for the picker, the viewer switcher and the comparison summary
 * (docs/build3d/METHODS.md). Pure data: safe to import from the landing.
 *
 * Owned by the researcher (figures and sources: docs/build3d/methods-research.md). Numbers here are
 * the method's *typical* figures for a ~250–300 m² private house in Israel; the per-step sums for this
 * house live in METHOD_TOTALS (content/totals.ts).
 */
import type { MethodId } from '../methods';

export interface MethodInfo {
  id: MethodId;
  nameHe: string;
  /** 2–4 words for chips / segmented controls. */
  shortHe: string;
  /** One sentence for the picker card. */
  taglineHe: string;
  /** 2–3 sentences: what it is and how it is built. */
  descHe: string;
  /** Typical build time for this house, months (structure → keys). */
  months: number;
  /** Relative cost vs concrete, e.g. +0.04 = 4% more. */
  costVsConcrete: number;
  /** 1–5 (5 = best): thermal performance, speed, Israeli market availability. */
  scores: { thermal: number; speed: number; availability: number };
  prosHe: string[];
  consHe: string[];
  /** Phase names that differ from the concrete ones (by phase id 0–13). */
  phaseNamesHe: Partial<Record<number, string>>;
  /** Short badge for the picker, e.g. "הנפוצה בישראל". */
  badgeHe?: string;
}

/** Placeholder until the researcher fills it in: names are final, figures are not. */
export const METHODS_INFO: Record<MethodId, MethodInfo> = {
  concrete: {
    id: 'concrete',
    nameHe: 'בטון ובלוקים',
    shortHe: 'בטון ובלוקים',
    taglineHe: 'שלד בטון מזוין ומילוי בלוקים: השיטה הנפוצה בישראל.',
    descHe: '',
    months: 16,
    costVsConcrete: 0,
    scores: { thermal: 2, speed: 2, availability: 5 },
    prosHe: [],
    consHe: [],
    phaseNamesHe: {},
    badgeHe: 'הנפוצה בישראל',
  },
  icf: {
    id: 'icf',
    nameHe: 'ICF: תבניות בידוד יצוקות',
    shortHe: 'ICF',
    taglineHe: 'קירות בטון שנוצקים בתוך בלוקי קלקר שנשארים כבידוד.',
    descHe: '',
    months: 13,
    costVsConcrete: 0.03,
    scores: { thermal: 5, speed: 3, availability: 3 },
    prosHe: [],
    consHe: [],
    phaseNamesHe: { 4: 'קומה תחתונה: קירות ICF', 6: 'קומת כניסה: קירות ICF', 7: 'מחיצות ומעקות' },
  },
  steel: {
    id: 'steel',
    nameHe: 'שלד פלדה קלה (LSF)',
    shortHe: 'פלדה קלה',
    taglineHe: 'קירות וקורות מפרופילי פלדה מגולוונת, מעל קומה תחתונה מבטון.',
    descHe: '',
    months: 11,
    costVsConcrete: -0.02,
    scores: { thermal: 4, speed: 5, availability: 3 },
    prosHe: [],
    consHe: [],
    phaseNamesHe: { 6: 'קומת כניסה: שלד פלדה קלה', 7: 'מילוי ומחיצות', 10: 'מעטפת: לוחות, בידוד וגבס' },
  },
  timber: {
    id: 'timber',
    nameHe: 'מסגרת עץ',
    shortHe: 'עץ',
    taglineHe: 'קירות מניצבי עץ ולוחות OSB, מעל קומה תחתונה מבטון.',
    descHe: '',
    months: 11,
    costVsConcrete: 0.03,
    scores: { thermal: 4, speed: 5, availability: 2 },
    prosHe: [],
    consHe: [],
    phaseNamesHe: { 6: 'קומת כניסה: מסגרת עץ', 7: 'מילוי ומחיצות', 10: 'מעטפת: לוחות, בידוד וגבס' },
  },
  precast: {
    id: 'precast',
    nameHe: 'בנייה טרומית',
    shortHe: 'טרומי',
    taglineHe: 'פאנלים ולוחות בטון מהמפעל, מורכבים במנוף תוך ימים.',
    descHe: '',
    months: 12,
    costVsConcrete: 0,
    scores: { thermal: 3, speed: 4, availability: 4 },
    prosHe: [],
    consHe: [],
    phaseNamesHe: { 4: 'קומה תחתונה: הרכבת פאנלים', 5: 'תקרה: לוחות חלולים', 6: 'קומת כניסה: הרכבת פאנלים', 7: 'מחיצות ומעקות' },
  },
};
