/**
 * Follow-ups and retrieval. "ומה לגבי 300 מ״ר?" has no topic of its own, so
 * retrieval needs a standalone version of it:
 *
 *   1. Heuristic first (free): a question that names its own topic is used as is.
 *   2. Only an ambiguous follow-up goes to the cheapest model (rewrite-model.ts).
 *   3. If that fails or times out: the previous standalone question plus the follow-up.
 *
 * Detection reads whole tokens and the leading conjunction "ו" of the first
 * word only to recognise follow-up phrasing. The query itself is never
 * altered: single-letter Hebrew prefixes are never stripped from retrieval
 * tokens. Pure; server-side (it shares lib/knowledge/moments.ts's term rules,
 * whose regex lookbehind older Safari can't parse).
 */
import { queryTerms } from '@/lib/knowledge/moments';
import type { AdvisorHistoryTurn } from './types';

const SOFIT: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
/** Final letters to regular ones: queryTerms() returns terms in this form. */
const sofit = (s: string) => s.replace(/[ךםןףץ]/g, (c) => SOFIT[c] ?? c);

/** Words that point back at the previous turn. */
const ANAPHORA_WORDS = [
  'זה', 'זאת', 'זו', 'אלה', 'אלו', 'הזה', 'הזאת', 'הזו', 'האלה', 'האלו',
  'אותו', 'אותה', 'אותם', 'אותן', 'שלו', 'שלה', 'שלהם', 'שלהן',
  'בזה', 'לזה', 'מזה', 'עליו', 'עליה', 'עליהם', 'בו', 'בה', 'בהם', 'ממנו', 'ממנה',
  'כזה', 'כזאת', 'כזו', 'כאלה', 'הנ"ל', 'הנ״ל', 'שם', 'אז', 'גם', 'עדיין', 'במקרה',
];

/** Openings that continue the previous question ("ומה לגבי", "ואם", "מה עם"). */
const CONTINUATION = /^(?:ו(?:מה|כמה|איך|אם|מתי|איפה|למה|האם|גם|אצל|לגבי|עם|בשביל|כש)|מה\s+(?:לגבי|עם|בנוגע)|לגבי|בנוגע|ואצל|ובמקרה|ואם|אבל)(?=\s|$|[?,.])/;

/** Content terms that don't establish a topic on their own ("כמה זה עולה?"). */
const GENERIC_WORDS = [
  'עולה', 'עולים', 'עלות', 'עלויות', 'מחיר', 'מחירים', 'כסף', 'יקר', 'זול',
  'לעשות', 'עושים', 'עושה', 'כדאי', 'אפשר', 'חייב', 'חייבים', 'יותר', 'פחות',
  'טוב', 'טובה', 'חשוב', 'לבדוק', 'בודקים', 'זמן', 'לוקח', 'שווה', 'נכון', 'בערך',
  'דבר', 'דברים', 'משהו', 'כל', 'לגבי', 'בנוגע', 'מקרה', 'במקרה', 'סתם', 'ממש',
  'למשל', 'הרבה', 'קצת', 'פתאום', 'תודה', 'בבקשה', 'ואם', 'ומה', 'וכמה', 'ואיך', 'ומתי',
  'ואיפה', 'ולמה', 'והאם', 'וגם', 'אבל',
];

const ANAPHORA = new Set(ANAPHORA_WORDS);
/** Generic and pointing words, in queryTerms() form: neither names a topic. */
const NOT_TOPIC = new Set(GENERIC_WORDS.concat(ANAPHORA_WORDS).map(sofit));

const MAX_STANDALONE = 300;

function tokens(query: string): string[] {
  return query
    .replace(/[?!.,:;()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Content terms that carry a topic (knowledge's term rules, minus generic and pointing words). */
export function topicTerms(query: string): string[] {
  return queryTerms(query).filter((t) => !NOT_TOPIC.has(t));
}

/** Does this follow-up need a standalone rewrite before retrieval? */
export function needsRewrite(query: string, history: readonly AdvisorHistoryTurn[] | undefined): boolean {
  if (!history || history.length === 0) return false;
  const q = query.trim();
  if (!q) return false;
  const words = tokens(q);
  const anaphora = words.some((w) => ANAPHORA.has(w)) || CONTINUATION.test(q);
  const topics = topicTerms(q);
  if (anaphora) return topics.length < 3;
  if (topics.length >= 2) return false;
  // One topic word: standalone only when the question is long enough to stand alone.
  return !(topics.length === 1 && words.length >= 4);
}

/** The previous standalone question (what retrieval ran on), else the previous question. */
export function previousStandalone(history: readonly AdvisorHistoryTurn[]): string {
  const last = history[history.length - 1];
  return (last?.sq || last?.q || '').trim();
}

/** Fallback rewrite: previous standalone question + the follow-up, capped. */
export function heuristicStandalone(query: string, history: readonly AdvisorHistoryTurn[]): string {
  const prev = previousStandalone(history);
  const q = query.trim();
  if (!prev) return q.slice(0, MAX_STANDALONE);
  const joined = `${prev} ${q}`;
  return joined.length <= MAX_STANDALONE ? joined : `${prev.slice(0, MAX_STANDALONE - q.length - 1)} ${q}`.slice(0, MAX_STANDALONE);
}

/** A model rewrite we trust: Hebrew, short, and not empty. */
export function acceptRewrite(candidate: string | null | undefined): string | null {
  const s = (candidate ?? '').replace(/\s+/g, ' ').trim().replace(/^["״'“”]+|["״'“”]+$/g, '');
  if (s.length < 3 || s.length > 220) return null;
  if (!/[֐-׿]/.test(s)) return null;
  return s;
}
