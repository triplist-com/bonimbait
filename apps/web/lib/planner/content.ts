/**
 * Planner copy: the five questions' options, in the owner's words. Numbers live
 * in the price book; this file only names things. Client-safe.
 */
import { MEMBER_REGIONS, type RegionOption } from '@/lib/constants/community';
import { BUILD_STAGES, getStage } from '@/lib/stages';
import type { ExtraId, FinishLevelId, Floors, StageId } from './types';

export const PLANNER_TITLE = 'תקציב ראשוני ב-3 דקות';

export const SIZE_LIMITS = { min: 60, max: 600, step: 10, default: 200 } as const;
/** Quick picks under the m² slider. */
export const SIZE_PRESETS = [150, 180, 200, 250, 300] as const;
/** Accepted input range (prefill, URLs): anything outside is clamped. */
export const SIZE_BOUNDS = { min: 40, max: 2000 } as const;

export const FLOOR_LABELS: Record<Floors, { label: string; hint: string }> = {
  1: { label: 'קומה אחת', hint: 'יותר יסודות וגג לכל מטר: השלד יקר יותר' },
  2: { label: 'שתי קומות', hint: 'הנפוץ ביותר. התקרה היא גם הרצפה של הקומה שמעל' },
  3: { label: 'שלוש קומות ומעלה', hint: 'כולל קומת מרתף או גג. השלד הכי יעיל למטר' },
};

export const FINISH_LEVELS: Record<FinishLevelId, { label: string; description: string }> = {
  basic: { label: 'בסיסי', description: 'גמר פשוט וחסכוני, מעט שינויים מהמפרט' },
  standard: { label: 'סטנדרטי-טוב', description: 'רוב הבתים שאנחנו מלווים: אלומיניום טוב, ריצוף איכותי, מיני מרכזי' },
  high: { label: 'גבוה', description: 'ויטרינות גדולות, נגרות בהתאמה אישית, מערכות מתקדמות' },
  luxury: { label: 'יוקרה', description: 'חללים כפולים, חומרים מיובאים ופרטים מיוחדים בכל חדר' },
};

export const EXTRAS: Record<ExtraId, { label: string; hint: string }> = {
  basement: { label: 'מרתף', hint: 'אפשר להפוך אותו ליחידה מניבה' },
  pool: { label: 'בריכה', hint: 'בריכת סקימר פרטית' },
  slope: { label: 'מגרש בשיפוע או פיתוח כבד', hint: 'חומות, מילוי אדמה ומשטחי חוץ' },
  vrf: { label: 'מיזוג VRF נסתר', hint: 'במקום מיני מרכזי' },
  smart_home: { label: 'בית חכם ומתח נמוך', hint: 'אינטרקום, מצלמות, תאורה ותרחישים' },
};

/** The 13 member regions, in the community's order. */
export const PLANNER_REGIONS: ReadonlyArray<RegionOption> = MEMBER_REGIONS;

export function regionName(slug: string): string {
  return PLANNER_REGIONS.find((r) => r.slug === slug)?.name ?? slug;
}

export function stageLabel(id: StageId): string {
  return getStage(id)?.label ?? id;
}

export function stageIcon(id: StageId): string {
  return getStage(id)?.icon ?? '/brand/stages/planning.svg';
}

/** Stage ids in the owner's order. */
export const STAGE_IDS: StageId[] = BUILD_STAGES.map((s) => s.id);

export const QUESTION_TITLES = {
  size: 'כמה מטר יהיה הבית?',
  floors: 'כמה קומות?',
  region: 'איפה בונים?',
  finish: 'איזו רמת גמר?',
  extras: 'יש תוספות?',
} as const;

export type QuestionId = keyof typeof QUESTION_TITLES;
export const QUESTION_ORDER: QuestionId[] = ['size', 'floors', 'region', 'finish', 'extras'];

/** Short step labels for the progress bar. */
export const QUESTION_STEP_LABELS: Record<QuestionId, string> = {
  size: 'שטח',
  floors: 'קומות',
  region: 'אזור',
  finish: 'גמר',
  extras: 'תוספות',
};
