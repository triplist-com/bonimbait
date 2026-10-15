import { segmentBody } from './segment-text';

/**
 * Exact moments inside a 3-minute transcript segment.
 *
 * Index rows carry `marks`: [char offset in the segment body, second] about every
 * 10 s (scripts/build_search_index.py). The answer route uses them to send Claude the
 * part of a segment that matches the question (not just its first characters) and to
 * play the video from the second the answer is said.
 */

/** [char offset in the segment body, second]. */
export type Mark = [number, number];

export interface MomentSegment {
  text: string;
  start_time: number;
  marks?: Mark[];
}

export interface FocusOptions {
  /** Window length in characters. */
  size?: number;
  /** The question asks for an amount (cost, price, budget): price figures count as a term. */
  numeric?: boolean;
}

const SOFIT: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const PREFIXES = 'הובלמכש';
const LEAD_CHARS = 120; // context kept before the first matching term (~7 s of speech)
const COST_QUESTION = /כמה\s+(?:עול|זה\s+עול|כסף|יעלה)|עלות|עלויות|מחיר|תקציב|הצעת\s+מחיר/;
// Amounts: "800,000", "250 אלף", "1.3 מיליון", "120 ש"ח", "300 שק", "₪".
const PRICE = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*(?:אלף|מיליון|ש"ח|שח|שקל|שק(?![א-ת]))|₪/g;
// Bare 3+ digit numbers that are not years ("2400 למטר", but also "1000 תקציבים").
const NUMBER = /(?<!\d)(?!(?:19|20)\d\d(?!\d))\d{3,}/g;

/** Does the question ask for an amount? */
export function wantsNumbers(query: string): boolean {
  return COST_QUESTION.test(query);
}

// Same stopwords and token rules as app/api/_lib/semantic.ts (kept here so the answer
// route's hook does not depend on the search module).
const STOPWORDS = new Set([
  'כמה', 'מה', 'איך', 'למה', 'האם', 'מי', 'מתי', 'איפה', 'איזה', 'איזו',
  'של', 'על', 'את', 'עם', 'או', 'גם', 'כן', 'לא', 'זה', 'זאת', 'הוא', 'היא',
  'אני', 'אתה', 'אנחנו', 'הם', 'הן', 'יש', 'אין',
  'צריך', 'צריכה', 'יכול', 'יכולה',
  'ליד', 'לפני', 'אחרי', 'בין', 'תחת', 'מעל',
  'ב', 'ל', 'מ', 'ה', 'ו', 'כ', 'ש',
]);

/** Content terms of a question (sofit-normalized; geresh/gershayim are punctuation). */
export function queryTerms(query: string): string[] {
  const cleaned = query.replace(/[׳״]/g, ' ').replace(/[^֐-׿a-zA-Z\s]/g, ' ');
  const out: string[] = [];
  for (const raw of cleaned.split(/\s+/).filter(Boolean)) {
    if (STOPWORDS.has(raw)) continue;
    const n = raw.replace(/[ךםןףץ]/g, (c) => SOFIT[c] || c);
    if (n.length < 2 || STOPWORDS.has(n)) continue;
    out.push(n);
  }
  return out;
}

/** Second at a body offset: the last mark at or before it, else the segment start. */
export function secondAt(marks: Mark[] | undefined, offset: number, fallback: number): number {
  let second = Math.floor(fallback);
  for (const [at, s] of marks ?? []) {
    if (at > offset) break;
    second = s;
  }
  return second;
}

/** A term occurrence; `amount` marks a formatted price (the best moment to play from). */
type Hit = { pos: number; term: number; amount?: boolean };

/** [start, end) of every match (exec loop: the app compiles to ES5, no matchAll iteration). */
function matchRanges(pattern: RegExp, text: string): Array<[number, number]> {
  const re = new RegExp(pattern.source, 'g');
  const out: Array<[number, number]> = [];
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    out.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

/** Positions of every query term in the body (same matching rules as semantic.ts). */
function termHits(body: string, terms: string[], numeric: boolean): Hit[] {
  const norm = body.replace(/[ךםןףץ]/g, (c) => SOFIT[c] || c);
  const hits: Hit[] = [];
  const find = (needle: string): number[] => {
    const out: number[] = [];
    for (let at = norm.indexOf(needle); at !== -1; at = norm.indexOf(needle, at + needle.length)) out.push(at);
    return out;
  };
  terms.forEach((t, term) => {
    const full = find(t);
    full.forEach((pos) => hits.push({ pos, term }));
    if (t.length > 3 && PREFIXES.includes(t[0])) {
      // Prefix-less form ("לבית" -> "בית"), except inside a full match already counted.
      const counted = new Set(full.map((p) => p + 1));
      for (const pos of find(t.slice(1))) if (!counted.has(pos)) hits.push({ pos, term });
    }
  });
  if (numeric) {
    // Price figures count as one more term; bare numbers inside an amount are not counted twice.
    const amounts = matchRanges(PRICE, body);
    amounts.forEach(([pos]) => hits.push({ pos, term: terms.length, amount: true }));
    matchRanges(NUMBER, body).forEach(([pos]) => {
      if (!amounts.some(([a, b]) => pos >= a && pos < b)) hits.push({ pos, term: terms.length });
    });
  }
  return hits.sort((a, b) => a.pos - b.pos);
}

/**
 * The `size`-character window of `body` with the most distinct query terms (then the
 * most hits, then the earliest), starting a little before its first hit on a word
 * boundary, plus the anchor to play from: for an amount question its first formatted
 * price (else its first number), otherwise its first hit. Without hits: the beginning.
 */
export function focusWindow(
  body: string,
  terms: string[],
  size: number,
  numeric = false,
): { start: number; end: number; anchor: number } {
  const hits = termHits(body, terms, numeric);
  if (hits.length === 0) return { start: 0, end: Math.min(size, body.length), anchor: 0 };
  let best = { distinct: 0, total: 0, i: 0, j: 0 };
  for (let i = 0, j = 0; i < hits.length; i++) {
    while (j < hits.length && hits[j].pos < hits[i].pos + size - LEAD_CHARS) j++;
    const distinct = new Set(hits.slice(i, j).map((h) => h.term)).size;
    if (distinct > best.distinct || (distinct === best.distinct && j - i > best.total)) {
      best = { distinct, total: j - i, i, j };
    }
  }
  const inWindow = hits.slice(best.i, best.j);
  const numbers = numeric ? inWindow.filter((h) => h.term === terms.length) : [];
  const anchor = (numbers.find((h) => h.amount) ?? numbers[0] ?? inWindow[0]).pos;
  if (body.length <= size) return { start: 0, end: body.length, anchor };
  let start = Math.max(0, inWindow[0].pos - LEAD_CHARS);
  const space = body.lastIndexOf(' ', start);
  if (start > 0 && space !== -1) start = space + 1;
  start = Math.min(start, Math.max(0, body.length - size));
  return { start, end: Math.min(body.length, start + size), anchor };
}

/**
 * The answer route's hook: for this question, the part of a video segment to show the
 * model and the second to play from (price-aware for cost questions).
 */
export function focusForQuery(query: string): (seg: MomentSegment, title: string | undefined) => { text: string; second: number } {
  const terms = queryTerms(query);
  const options: FocusOptions = { numeric: wantsNumbers(query) };
  return (seg, title) => focusSegment(seg, title, terms, options);
}

/** The part of a video segment to show the model, and the second to play from. */
export function focusSegment(
  seg: MomentSegment,
  title: string | undefined,
  terms: string[],
  { size = 800, numeric = false }: FocusOptions = {},
): { text: string; second: number } {
  const body = segmentBody(seg.text, title);
  const { start, end, anchor } = focusWindow(body, terms, size, numeric);
  return { text: body.slice(start, end), second: secondAt(seg.marks, anchor, seg.start_time) };
}
