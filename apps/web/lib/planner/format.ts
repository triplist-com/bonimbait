/**
 * Display formatting for planner amounts. Client-safe, pure.
 *
 * Numbers in Hebrew text need care:
 *   - In JSX, digits go in an LTR isolate (`.num`); the Hebrew unit stays outside it.
 *   - In plain strings (badges, share text, owner-edited notes), ranges are wrapped in
 *     Unicode isolates (LRI ... PDI). Without them, RTL text shows "200-250" fine but
 *     "5%-6%" or "200–250" (en dash) reversed.
 *   - A range never breaks across lines: word joiners around its dash, and a no-break
 *     space before its unit.
 */
import type { MoneyRange, MonthsRange } from './types';

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Left-to-right isolate / pop directional isolate (Unicode 6.3). */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
/** Word joiner: no line break here. */
const WJ = String.fromCharCode(0x2060);
/** No-break space (number and unit stay on one line). */
const NBSP = String.fromCharCode(0xa0);
/** What stripIsolates() removes: word joiners and the bidi isolates. */
const INVISIBLE_RE = new RegExp(`[${WJ}${LRI}-${PDI}]`, 'g');
/** The dash between the two ends of a range, unbreakable. */
const DASH = `${WJ}–${WJ}`;

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
  if (Math.abs(max) >= 1_000_000) return { value: `${fixed2(min / 1_000_000)}${DASH}${fixed2(max / 1_000_000)}`, unit: 'מיליון' };
  if (Math.abs(max) >= 10_000) return { value: `${thousands(min)}${DASH}${thousands(max)}`, unit: 'אלף' };
  return { value: `${Math.round(min).toLocaleString('he-IL')}${DASH}${Math.round(max).toLocaleString('he-IL')}`, unit: '' };
}

/** Digits (and ₪) as an LTR island inside Hebrew text. */
export function ltr(text: string): string {
  return `${LRI}${text}${PDI}`;
}

// A numeric range: "200-250", "5%–6%", "₪700-800", "1,100–1,900", "12,000–14,000".
const RANGE_RE = /₪?\d[\d,.]*%?(?:\s*[-–]\s*₪?\d[\d,.]*%?)+/g;

/**
 * Isolate every numeric range in Hebrew copy so it reads left to right and stays
 * on one line. Use on all copy that can hold ranges, owner-edited notes included.
 * Idempotent.
 */
export function isolateRanges(text: string): string {
  return text.replace(RANGE_RE, (m: string, offset: number, whole: string) =>
    whole[offset - 1] === LRI ? m : ltr(m.replace(/\s*([-–])\s*/g, `${WJ}$1${WJ}`)),
  );
}

/** Without the invisible bidi and joining characters (structured data, plain exports). */
export function stripIsolates(text: string): string {
  return text.replace(INVISIBLE_RE, '').split(NBSP).join(' ');
}

/** Plain text (share messages, titles): "₪2.21–2.99 מיליון", digits isolated, unbreakable. */
export function rangeText(range: Pick<MoneyRange, 'min' | 'max'>): string {
  const { value, unit } = compactRange(range.min, range.max);
  return unit ? `${ltr(`₪${value}`)}${NBSP}${unit}` : ltr(`₪${value}`);
}

/** Plain text: "₪750 אלף", digits isolated, unbreakable. */
export function amountText(n: number): string {
  const { value, unit } = compactAmount(n);
  return unit ? `${ltr(`₪${value}`)}${NBSP}${unit}` : ltr(`₪${value}`);
}

/** "₪11,100–15,000 למ״ר", digits isolated, unbreakable. */
export function perM2Text(range: Pick<MoneyRange, 'min' | 'max'>): string {
  return `${ltr(`₪${range.min.toLocaleString('he-IL')}${DASH}${range.max.toLocaleString('he-IL')}`)}${NBSP}למ״ר`;
}

/** [4, 5] -> "4–5 חודשים" (range isolated), [12, 12] -> "12 חודשים", [1, 1] -> "חודש". */
export function monthsText([a, b]: MonthsRange): string {
  if (a === b) return a === 1 ? 'חודש' : `${a} חודשים`;
  return `${ltr(`${a}${DASH}${b}`)}${NBSP}חודשים`;
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
