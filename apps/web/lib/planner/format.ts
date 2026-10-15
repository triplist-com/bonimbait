/**
 * Display formatting for planner amounts. Client-safe, pure.
 *
 * Numbers render inside an LTR isolate (`.num`), so values here are plain
 * "2.21–2.99" strings and the Hebrew unit ("מיליון", "אלף") is a separate part.
 */
import type { MoneyRange, MonthsRange } from './types';

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export interface CompactParts {
  /** Digits for an LTR isolate, without the currency sign: "2.21–2.99". */
  value: string;
  /** "מיליון", "אלף" or "". */
  unit: string;
}

function fixed2(n: number): string {
  return n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function thousands(n: number): string {
  return Math.round(n / 1000).toLocaleString('he-IL');
}

/** "₪2,600,000" (whole shekels, he-IL grouping). */
export function formatShekels(n: number): string {
  return `₪${Math.round(n).toLocaleString('he-IL')}`;
}

/** One amount, compact: 750000 -> { "750", "אלף" }, 2600000 -> { "2.60", "מיליון" }. */
export function compactAmount(n: number): CompactParts {
  if (Math.abs(n) >= 1_000_000) return { value: fixed2(n / 1_000_000), unit: 'מיליון' };
  if (Math.abs(n) >= 10_000) return { value: thousands(n), unit: 'אלף' };
  return { value: Math.round(n).toLocaleString('he-IL'), unit: '' };
}

/** A range in one unit, chosen by its top: { "2.21–2.99", "מיליון" }, { "690–930", "אלף" }. */
export function compactRange(min: number, max: number): CompactParts {
  if (Math.abs(max) >= 1_000_000) return { value: `${fixed2(min / 1_000_000)}–${fixed2(max / 1_000_000)}`, unit: 'מיליון' };
  if (Math.abs(max) >= 10_000) return { value: `${thousands(min)}–${thousands(max)}`, unit: 'אלף' };
  return { value: `${Math.round(min).toLocaleString('he-IL')}–${Math.round(max).toLocaleString('he-IL')}`, unit: '' };
}

/** Plain text (share messages, titles): "₪2.21–2.99 מיליון". */
export function rangeText(range: Pick<MoneyRange, 'min' | 'max'>): string {
  const { value, unit } = compactRange(range.min, range.max);
  return unit ? `₪${value} ${unit}` : `₪${value}`;
}

/** Plain text: "₪750 אלף". */
export function amountText(n: number): string {
  const { value, unit } = compactAmount(n);
  return unit ? `₪${value} ${unit}` : `₪${value}`;
}

/** "₪11,100–15,000 למ״ר". */
export function perM2Text(range: Pick<MoneyRange, 'min' | 'max'>): string {
  return `₪${range.min.toLocaleString('he-IL')}–${range.max.toLocaleString('he-IL')} למ״ר`;
}

/** [4, 5] -> "4–5 חודשים", [12, 12] -> "12 חודשים", [1, 1] -> "חודש". */
export function monthsText([a, b]: MonthsRange): string {
  if (a === b) return a === 1 ? 'חודש' : `${a} חודשים`;
  return `${a}–${b} חודשים`;
}

/** "2026-07-16" -> "16.7.2026". */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
}

/** "2026-07-16" -> "יולי 2026". */
export function monthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${HE_MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim();
}

/** A Date plus `months`, as "ספטמבר 2028". */
export function monthYearAfter(from: Date, months: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + Math.round(months), 1));
  return `${HE_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "נכון ל-2026" from the price book date. */
export function asOfBadge(validAsOf: string): string {
  const year = /^(\d{4})/.exec(validAsOf)?.[1] ?? '';
  return year ? `נכון ל-${year}` : 'נכון להיום';
}
