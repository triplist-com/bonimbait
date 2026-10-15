/**
 * Milestones: the Gantt-lite schedule of a managed project, planned vs actual
 * dates by the owner's 7 stages. Status, slip, "the next milestone", the
 * timeline geometry, and a first schedule built from growth's price book
 * (`timelineMonths`, months per stage). Dates are YYYY-MM-DD calendar days.
 * Pure and client-safe.
 */
import { daysBetween } from '@/lib/hub/format';
import { STAGE_IDS, type StageId } from '@/lib/hub/types';
import type { MilestoneView } from './types';

export type MilestoneStatus = 'done' | 'in_progress' | 'late' | 'due_soon' | 'upcoming';

/** A milestone that should start within this many days is "due soon". */
export const DUE_SOON_DAYS = 14;

export function addDaysIso(date: string, days: number): string {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return new Date(t + Math.round(days) * 86_400_000).toISOString().slice(0, 10);
}

type Dates = Pick<MilestoneView, 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'>;

export function milestoneStatus(m: Dates, today: string): MilestoneStatus {
  if (m.actualEnd) return 'done';
  if (m.plannedEnd < today) return 'late';
  if (m.actualStart) return 'in_progress';
  if (daysBetween(today, m.plannedStart) <= DUE_SOON_DAYS) return 'due_soon';
  return 'upcoming';
}

/**
 * Days behind the plan (negative = ahead): a finished milestone against its
 * planned end; an open one that passed its planned end, against today.
 */
export function slipDays(m: Dates, today: string): number {
  if (m.actualEnd) return daysBetween(m.plannedEnd, m.actualEnd);
  if (m.plannedEnd < today) return daysBetween(m.plannedEnd, today);
  return 0;
}

function byPlan<T extends Pick<MilestoneView, 'plannedStart' | 'plannedEnd' | 'sortOrder' | 'title'>>(a: T, b: T): number {
  return (
    a.plannedStart.localeCompare(b.plannedStart) ||
    a.plannedEnd.localeCompare(b.plannedEnd) ||
    a.sortOrder - b.sortOrder ||
    a.title.localeCompare(b.title, 'he')
  );
}

export function sortMilestones<T extends MilestoneView>(ms: readonly T[]): T[] {
  return [...ms].sort((a, b) => STAGE_IDS.indexOf(a.stage) - STAGE_IDS.indexOf(b.stage) || byPlan(a, b));
}

/** The next open milestone: the earliest planned end that isn't done. */
export function nextMilestone<T extends MilestoneView>(ms: readonly T[]): T | null {
  const open = ms.filter((m) => !m.actualEnd);
  if (!open.length) return null;
  return [...open].sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd) || a.sortOrder - b.sortOrder)[0];
}

export interface StageGroup<T extends MilestoneView = MilestoneView> {
  stage: StageId;
  milestones: T[];
  plannedStart: string;
  plannedEnd: string;
  /** Earliest actual start, when work began. */
  actualStart: string | null;
  /** Latest actual end, only once every milestone of the stage is done. */
  actualEnd: string | null;
  done: number;
}

/** Milestones grouped by stage, in the owner's order. */
export function groupByStage<T extends MilestoneView>(ms: readonly T[]): StageGroup<T>[] {
  return STAGE_IDS.flatMap((stage) => {
    const mine = ms.filter((m) => m.stage === stage).sort(byPlan);
    if (!mine.length) return [];
    const starts = mine.map((m) => m.actualStart).filter((d): d is string => Boolean(d)).sort();
    const done = mine.filter((m) => m.actualEnd).length;
    return [
      {
        stage,
        milestones: mine,
        plannedStart: mine.map((m) => m.plannedStart).sort()[0],
        plannedEnd: mine.map((m) => m.plannedEnd).sort().at(-1)!,
        actualStart: starts[0] ?? null,
        actualEnd: done === mine.length ? mine.map((m) => m.actualEnd!).sort().at(-1)! : null,
        done,
      },
    ];
  });
}

export interface TimelineMonth {
  /** YYYY-MM */
  month: string;
  startPct: number;
  widthPct: number;
}

export interface TimelineRange {
  start: string;
  end: string;
  days: number;
  months: TimelineMonth[];
  /** Where today falls (0..100), or null outside the range. */
  todayPct: number | null;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The whole-month range covering every planned and actual date, and today. */
export function timelineRange(ms: readonly Dates[], today: string): TimelineRange {
  const dates = [today];
  for (const m of ms) {
    dates.push(m.plannedStart, m.plannedEnd);
    if (m.actualStart) dates.push(m.actualStart);
    if (m.actualEnd) dates.push(m.actualEnd);
  }
  dates.sort();
  const start = monthStart(dates[0]);
  const end = monthEnd(dates[dates.length - 1]);
  const days = daysBetween(start, end) + 1;

  const months: TimelineMonth[] = [];
  let cursor = start;
  while (cursor <= end) {
    const last = monthEnd(cursor);
    months.push({
      month: cursor.slice(0, 7),
      startPct: (daysBetween(start, cursor) / days) * 100,
      widthPct: ((daysBetween(cursor, last) + 1) / days) * 100,
    });
    cursor = addDaysIso(last, 1);
  }
  const t = daysBetween(start, today);
  return { start, end, days, months, todayPct: t >= 0 && t < days ? ((t + 0.5) / days) * 100 : null };
}

/** A bar's offset and width (percent of the range); at least `minPct` wide. */
export function barPosition(
  range: Pick<TimelineRange, 'start' | 'days'>,
  from: string,
  to: string,
  minPct = 1.2,
): { startPct: number; widthPct: number } {
  const a = Math.min(range.days, Math.max(0, daysBetween(range.start, from)));
  const b = Math.min(range.days, Math.max(a, daysBetween(range.start, to) + 1));
  const widthPct = Math.max(minPct, ((b - a) / range.days) * 100);
  const startPct = Math.max(0, Math.min((a / range.days) * 100, 100 - widthPct));
  return { startPct, widthPct };
}

export interface ScheduleSummary {
  total: number;
  done: number;
  late: number;
  inProgress: number;
  /** Of the finished milestones, the share finished on or before plan. */
  onTimeShare: number | null;
  /** The largest slip so far, in days (0 when nothing is late). */
  maxSlip: number;
}

export function scheduleSummary(ms: readonly MilestoneView[], today: string): ScheduleSummary {
  const statuses = ms.map((m) => milestoneStatus(m, today));
  const finished = ms.filter((m) => m.actualEnd);
  const onTime = finished.filter((m) => slipDays(m, today) <= 0).length;
  return {
    total: ms.length,
    done: finished.length,
    late: statuses.filter((s) => s === 'late').length,
    inProgress: statuses.filter((s) => s === 'in_progress').length,
    onTimeShare: finished.length ? onTime / finished.length : null,
    maxSlip: Math.max(0, ...ms.map((m) => slipDays(m, today))),
  };
}

// ---------------------------------------------------------------------------
// A first schedule (the manager adjusts it afterwards)
// ---------------------------------------------------------------------------

/** Typical milestones per stage, in order (the owner's vocabulary). */
export const STAGE_MILESTONES: Readonly<Record<StageId, readonly string[]>> = {
  purchase: ['בדיקות מגרש ותב״ע', 'חתימה על המגרש'],
  planning: ['תכנון מוקדם וסקיצות', 'תוכניות עבודה ויועצים', 'תקציב מפורט'],
  permit: ['הגשה לוועדה', 'אגרות והיטלים', 'מכרז קבלנים וחוזה', 'היתר בנייה'],
  frame: ['חפירה ויסודות', 'רצפה וקורות יסוד', 'קומת קרקע ותקרה', 'קומה א׳ ותקרה עליונה', 'גג ומעקות'],
  infrastructure: ['חשמל ותקשורת', 'אינסטלציה וביוב', 'מיזוג אוויר', 'איטום ובידוד'],
  finishing: ['טיח פנים וחוץ', 'ריצוף וחיפוי', 'אלומיניום וזכוכית', 'מטבח ונגרות', 'צבע וגמר'],
  'moving-in': ['פיתוח חוץ וגדרות', 'חיבורים וטופס 4', 'מסירה ובדק בית'],
};

/** Months for stages the price book prices as a moment ([0, 0]): purchase and moving in. */
const FALLBACK_MONTHS: Readonly<Partial<Record<StageId, [number, number]>>> = {
  purchase: [1, 3],
  'moving-in': [1, 3],
};

export interface MilestoneDraft {
  stage: StageId;
  title: string;
  plannedStart: string;
  plannedEnd: string;
  sortOrder: number;
}

/**
 * Milestones from `fromStage` to the keys, back to back from `startDate`:
 * each stage takes the midpoint of its typical months (growth's price book
 * `timelineMonths`), split evenly between its milestones.
 */
export function scheduleTemplate(
  fromStage: StageId,
  startDate: string,
  timelineMonths: Readonly<Partial<Record<StageId, readonly [number, number] | number[]>>>,
): MilestoneDraft[] {
  const out: MilestoneDraft[] = [];
  let cursor = startDate;
  let order = 0;
  for (const stage of STAGE_IDS.slice(Math.max(0, STAGE_IDS.indexOf(fromStage)))) {
    const raw = timelineMonths[stage];
    const months = raw && raw.length === 2 && (raw[0] > 0 || raw[1] > 0) ? [raw[0], raw[1]] : FALLBACK_MONTHS[stage] ?? [1, 2];
    const stageDays = Math.max(7, Math.round(((months[0] + months[1]) / 2) * 30.4));
    const titles = STAGE_MILESTONES[stage];
    const each = stageDays / titles.length;
    titles.forEach((title, i) => {
      const start = addDaysIso(cursor, Math.round(i * each));
      const end = addDaysIso(cursor, Math.max(Math.round((i + 1) * each) - 1, Math.round(i * each)));
      out.push({ stage, title, plannedStart: start, plannedEnd: end, sortOrder: (order += 10) });
    });
    cursor = addDaysIso(cursor, stageDays);
  }
  return out;
}
