import { STEPS_A } from './steps-a';
import { STEPS_B } from './steps-b';
import { STEPS_ICF } from './steps-icf';
import { STEPS_STEEL } from './steps-steel';
import { STEPS_TIMBER } from './steps-timber';
import { STEPS_PRECAST } from './steps-precast';
import type { MethodId } from '../methods';
import type { StepContent, StepContentMap } from './types';

export type { StepContent } from './types';
export { PRICES } from './prices';

export const PHASES: Array<{ id: number; nameHe: string; summaryHe: string; typicalWeeks: number }> = [
  { id: 0, nameHe: 'התוכנית', summaryHe: 'תוכנית הגשה מאושרת ותוכניות ביצוע מונחות על המגרש.', typicalWeeks: 1 },
  { id: 1, nameHe: 'הכנת המגרש', summaryHe: 'סימון, ניקוי והקמת אתר העבודה.', typicalWeeks: 2 },
  { id: 2, nameHe: 'עבודות עפר', summaryHe: 'חפירת הקומה התחתונה, יישור והידוק.', typicalWeeks: 2 },
  { id: 3, nameHe: 'יסודות', summaryHe: 'כלונסאות וקורות יסוד, ובהם ביוב תת-קרקעי.', typicalWeeks: 5 },
  { id: 4, nameHe: 'קומה תחתונה: שלד', summaryHe: 'קירות תומכים, איטום, רצפה ועמודים.', typicalWeeks: 6 },
  { id: 5, nameHe: 'תקרת הקומה התחתונה', summaryHe: 'טפסנות, זיון, יציקה ואשפרה.', typicalWeeks: 5 },
  { id: 6, nameHe: 'קומת כניסה: שלד', summaryHe: 'רצפה, עמודים, ממ״ד ותקרת גג, עד שהשלד מוכן.', typicalWeeks: 7 },
  { id: 7, nameHe: 'בנייה', summaryHe: 'קירות בלוקים, חגורות, מעקות ומשקופים עיוורים.', typicalWeeks: 8 },
  { id: 8, nameHe: 'גג', summaryHe: 'בטון שיפועים, בידוד, איטום וציוד גג.', typicalWeeks: 3 },
  { id: 9, nameHe: 'מערכות', summaryHe: 'אינסטלציה, ניקוז, חשמל ומיזוג בתוך הקירות.', typicalWeeks: 6 },
  { id: 10, nameHe: 'טיח וחיפוי', summaryHe: 'פיגומים, טיח פנים וחוץ וחיפוי אבן.', typicalWeeks: 10 },
  { id: 11, nameHe: 'גמרים', summaryHe: 'ריצוף, חיפוי, גבס, אלומיניום, דלתות, מטבח וצבע.', typicalWeeks: 13 },
  { id: 12, nameHe: 'פיתוח', summaryHe: 'קירות, חניה, שבילים, פרגולה וגינה.', typicalWeeks: 7 },
  { id: 13, nameHe: 'מסירת מפתח', summaryHe: 'ריהוט, בדיקות אחרונות וטופס 4.', typicalWeeks: 2 },
];

export const STEP_CONTENT: Record<string, StepContent> = { ...STEPS_A, ...STEPS_B };

/** Per-method step text: the method's own steps + re-wordings of shared steps (win over STEP_CONTENT). */
export const METHOD_CONTENT: Record<MethodId, StepContentMap> = {
  concrete: {},
  icf: STEPS_ICF,
  steel: STEPS_STEEL,
  timber: STEPS_TIMBER,
  precast: STEPS_PRECAST,
};

export const SUMMARY: { totalMonthsTypical: number; noteHe: string } = {
  totalMonthsTypical: 16,
  noteHe:
    'המחירים והזמנים כאן הם הערכות גסות להדגמה בלבד, לפני מע״מ, ומבוססים על בית של כ-250 עד 300 מ״ר. עלות ולוחות זמנים בפועל תלויים במגרש, בקבלן ובמפרט, ויש לקבלם מהצעות מחיר.',
};
