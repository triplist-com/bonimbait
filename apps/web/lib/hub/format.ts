/**
 * Hub display helpers: money (whole shekels), months and due dates in
 * Hebrew. Numbers are returned as separate parts so JSX can put them in an
 * LTR isolate (`.num`): "2.4–2.8" must never flip to "2.8–2.4" in RTL text.
 * Plain-text variants wrap the number in Unicode isolates. Client-safe.
 */

const LRI = '⁦';
const PDI = '⁩';

/** Plain text with the number isolated LTR. */
export function isolateLtr(text: string): string {
  return `${LRI}${text}${PDI}`;
}

const nis = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

/** "820,000". */
export function formatNumberHe(n: number): string {
  return nis.format(Math.round(n));
}

export interface MoneyParts {
  /** The digits ("2.6", "820", "2.4–2.8"): render in an LTR isolate. */
  value: string;
  /** "מיליון ₪", "אלף ₪", "₪". */
  unit: string;
}

function compactNumber(n: number, unit: 'million' | 'thousand'): string {
  if (unit === 'million') {
    const v = n / 1_000_000;
    return (Math.round(v * 10) / 10).toString();
  }
  return Math.round(n / 1000).toString();
}

function unitFor(n: number): 'million' | 'thousand' | 'plain' {
  const a = Math.abs(n);
  if (a >= 1_000_000) return 'million';
  if (a >= 10_000) return 'thousand';
  return 'plain';
}

const UNIT_LABEL = { million: 'מיליון ₪', thousand: 'אלף ₪', plain: '₪' } as const;

/** 2_600_000 -> { "2.6", "מיליון ₪" }; 820_000 -> { "820", "אלף ₪" }; 6_900 -> { "6,900", "₪" }. */
export function moneyParts(n: number): MoneyParts {
  const unit = unitFor(n);
  const value = unit === 'plain' ? formatNumberHe(n) : compactNumber(n, unit);
  return { value, unit: UNIT_LABEL[unit] };
}

/** A range in one unit when possible: [2.4M, 2.8M] -> { "2.4–2.8", "מיליון ₪" }. */
export function moneyRangeParts(min: number, max: number): MoneyParts {
  if (min === max) return moneyParts(min);
  if (min <= 0) {
    const top = moneyParts(max);
    return { value: top.value, unit: `${top.unit}` };
  }
  const unit = unitFor(max);
  const lo = unit === 'plain' ? formatNumberHe(min) : compactNumber(min, unit);
  const hi = unit === 'plain' ? formatNumberHe(max) : compactNumber(max, unit);
  if (lo === hi) return { value: lo, unit: UNIT_LABEL[unit] };
  return { value: `${lo}–${hi}`, unit: UNIT_LABEL[unit] };
}

/** "2.4–2.8 מיליון ₪" as plain text (LTR-isolated number), "עד 1.5 מיליון ₪" for open ranges. */
export function formatMoneyRange(min: number, max: number): string {
  const p = moneyRangeParts(min, max);
  return `${min <= 0 && max > 0 ? 'עד ' : ''}${isolateLtr(p.value)} ${p.unit}`;
}

/** "820 אלף ₪" as plain text. */
export function formatMoney(n: number): string {
  const p = moneyParts(n);
  return `${isolateLtr(p.value)} ${p.unit}`;
}

/** Full amount: "820,000 ₪". */
export function formatMoneyExact(n: number): string {
  return `${isolateLtr(formatNumberHe(n))} ₪`;
}

/** Signed variance: "+45 אלף ₪" / "−30 אלף ₪". */
export function varianceParts(n: number): MoneyParts & { sign: '+' | '−' | '' } {
  const p = moneyParts(Math.abs(n));
  return { ...p, sign: n > 0 ? '+' : n < 0 ? '−' : '' };
}

export const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const;

/** '2027-09' -> "ספטמבר 2027". */
export function monthLabel(month: string): string {
  const m = Number(month.slice(5, 7));
  const y = month.slice(0, 4);
  return `${HEBREW_MONTHS[m - 1] ?? ''} ${y}`.trim();
}

/** '2026-10-20' -> "20 באוקטובר". */
export function dayMonthLabel(date: string): string {
  const d = Number(date.slice(8, 10));
  const m = Number(date.slice(5, 7));
  return `${d} ב${HEBREW_MONTHS[m - 1] ?? ''}`;
}

/** Whole days from `today` to `date` (both YYYY-MM-DD). */
export function daysBetween(today: string, date: string): number {
  const a = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const b = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'none';

/** "היום", "מחר", "בעוד 3 ימים", "באיחור של יומיים", "20 באוקטובר". */
export function dueLabel(dueOn: string | null, today: string): { label: string; tone: DueTone } {
  if (!dueOn) return { label: 'בלי תאריך', tone: 'none' };
  const d = daysBetween(today, dueOn);
  if (d < 0) {
    const late = -d;
    return { label: late === 1 ? 'באיחור של יום' : late === 2 ? 'באיחור של יומיים' : `באיחור של ${late} ימים`, tone: 'overdue' };
  }
  if (d === 0) return { label: 'היום', tone: 'today' };
  if (d === 1) return { label: 'מחר', tone: 'soon' };
  if (d <= 7) return { label: d === 2 ? 'בעוד יומיים' : `בעוד ${d} ימים`, tone: 'soon' };
  return { label: dayMonthLabel(dueOn), tone: 'later' };
}

/** "1,024 ימים" style count with the right Hebrew for 1 and 2. */
export function daysLabel(n: number): string {
  const a = Math.abs(n);
  if (a === 1) return 'יום אחד';
  if (a === 2) return 'יומיים';
  return `${formatNumberHe(a)} ימים`;
}

/** "2.4 MB" / "830 KB". */
export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toString()} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
