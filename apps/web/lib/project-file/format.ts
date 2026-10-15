/**
 * Hebrew display helpers for project files (booking sheet, consult queue,
 * portal, reports). Pure and client-safe.
 *
 * Amounts follow the site's he-IL currency style ("6,900 ₪"); render them
 * inside `.num` (LTR isolate) when they sit in Hebrew text.
 */
import { getStage } from '@/lib/stages';
import { REGIONS } from '@/lib/constants/community';
import type { ProjectFile, ProjectStageId } from './types';

const NIS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const MONTH = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** 2600000 -> "‏2,600,000 ₪". */
export function formatNis(n: number): string {
  return NIS.format(Math.round(n));
}

function trimDecimal(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}

type Short = { value: string; unit: 'מיליון' | 'אלף' | '' };

function shortParts(n: number): Short {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return { value: trimDecimal(n / 1_000_000, abs >= 10_000_000 ? 0 : 1), unit: 'מיליון' };
  if (abs >= 1_000) return { value: trimDecimal(n / 1_000, 0), unit: 'אלף' };
  return { value: String(Math.round(n)), unit: '' };
}

/** 2600000 -> "2.6 מיליון ₪", 850000 -> "850 אלף ₪". */
export function formatNisShort(n: number): string {
  const p = shortParts(n);
  return p.unit ? `${p.value} ${p.unit} ₪` : `${p.value} ₪`;
}

/** [2400000, 2800000] -> "2.4–2.8 מיליון ₪"; equal ends -> one amount. */
export function formatBudgetRange(range: readonly [number, number]): string {
  const [lo, hi] = range;
  if (lo === hi) return formatNisShort(lo);
  const a = shortParts(lo);
  const b = shortParts(hi);
  if (a.unit === b.unit) return `${a.value}–${b.value}${b.unit ? ` ${b.unit}` : ''} ₪`;
  return `${a.value}${a.unit ? ` ${a.unit}` : ''}–${b.value}${b.unit ? ` ${b.unit}` : ''} ₪`;
}

/** Midpoint of a budget range (whole shekels). */
export function budgetMidpoint(range: readonly [number, number] | undefined): number | null {
  return range ? Math.round((range[0] + range[1]) / 2) : null;
}

/** '2027-09' -> "ספטמבר 2027". */
export function formatMonthHe(month: string | undefined | null): string | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

export function stageLabel(id: ProjectStageId | string | undefined | null): string | null {
  return id ? getStage(id as ProjectStageId)?.label ?? null : null;
}

export function regionName(slug: string | undefined | null): string | null {
  return slug ? REGIONS.find((r) => r.slug === slug)?.name ?? null : null;
}

/** Months from `now` until the target move-in (negative = past). */
export function monthsUntil(month: string | undefined, now: Date = new Date()): number | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return (y - now.getUTCFullYear()) * 12 + (m - (now.getUTCMonth() + 1));
}

export type ProjectFact = { key: 'stage' | 'region' | 'size' | 'budget' | 'moveIn'; label: string; value: string | null };

/** The five core facts with Hebrew labels; value null = missing. */
export function projectFacts(file: ProjectFile): ProjectFact[] {
  return [
    { key: 'stage', label: 'שלב', value: stageLabel(file.stage) },
    { key: 'region', label: 'אזור', value: regionName(file.regionSlug) },
    { key: 'size', label: 'גודל הבית', value: file.sizeM2 ? `${file.sizeM2} מ״ר` : null },
    { key: 'budget', label: 'תקציב', value: file.budgetRangeNis ? formatBudgetRange(file.budgetRangeNis) : null },
    { key: 'moveIn', label: 'כניסה מתוכננת', value: formatMonthHe(file.targetMoveIn) },
  ];
}

/** One line: "היתר/מכרז · אזור השרון · 220 מ״ר · 2.6 מיליון ₪". */
export function projectHeadline(file: ProjectFile): string {
  return projectFacts(file)
    .filter((f) => f.key !== 'moveIn' && f.value)
    .map((f) => f.value)
    .join(' · ');
}

/** "שאלה אחת" / "2 שאלות". */
export function countHe(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}
