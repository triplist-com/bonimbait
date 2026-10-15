/**
 * Question text for the content-gap engine. Pure and client-safe.
 *
 * Builders phrase the same topic many ways, and Hebrew questions share long
 * templates ("כמה עולה ... לבית פרטי?"). Measured on a labelled set of 84
 * builder questions in 22 topics (text-embedding-3-small), clustering on the
 * template-stripped "topic text" plus term overlap raised cluster purity from
 * 0.61 to 0.94 at similar completeness, compared with the raw question.
 */

/** Same list as app/api/_lib/semantic.ts, plus common function words. */
const STOPWORDS = new Set([
  'כמה', 'מה', 'איך', 'למה', 'האם', 'מי', 'מתי', 'איפה', 'איזה', 'איזו', 'אילו',
  'של', 'על', 'את', 'עם', 'או', 'גם', 'כן', 'לא', 'זה', 'זאת', 'זו', 'הוא', 'היא',
  'אני', 'אתה', 'אנחנו', 'הם', 'הן', 'יש', 'אין', 'צריך', 'צריכה', 'צריכים', 'יכול', 'יכולה', 'יכולים',
  'ליד', 'לפני', 'אחרי', 'בין', 'תחת', 'מעל', 'אם', 'כל', 'עוד', 'רק', 'מאוד', 'יותר', 'פחות',
  'לי', 'לנו', 'לכם', 'שלי', 'שלנו', 'שלכם', 'אפשר', 'חייב', 'חייבים', 'חייבת', 'כדי', 'מול', 'לגבי',
  'בלי', 'תוך', 'בתוך', 'עד', 'אז', 'אבל', 'וגם', 'ב', 'ל', 'מ', 'ה', 'ו', 'כ', 'ש',
]);

/** Words every construction question uses: they say "how much" or "a house", not what about. */
const GENERIC = new Set([
  'בית', 'בבית', 'לבית', 'הבית', 'בתים', 'פרטי', 'פרטית', 'עולה', 'עולים', 'עולות', 'עלות', 'עלויות',
  'מחיר', 'מחירים', 'כדאי', 'עדיף', 'חובה', 'שווה', 'לבנות', 'בנייה', 'בניה', 'לבנייה', 'בבנייה',
  'חדש', 'חדשה', 'באמת', 'מטר', 'למטר', 'מר', 'למר', 'לדעת', 'עושים', 'זמן', 'לוקח', 'ההבדל', 'הבדל',
  'סתם', 'הכי', 'טוב', 'טובה', 'מומלץ', 'ממליצים',
]);

const SOFIT: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const PREFIX_LETTERS = 'הובלמכש';

/** Display form: one line, ASCII quotes (content writes ממ"ד), at most 300 characters. */
export function cleanQuestion(q: string): string {
  return q.replace(/[״]/g, '"').replace(/[׳]/g, "'").replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Grouping key: letters and digits only (mirrors command_question_stats in SQL). */
export function questionKey(q: string): string {
  return cleanQuestion(q)
    .toLowerCase()
    .replace(/[^א-תa-z0-9 ]+/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

/** Bare word for stopword checks and term keys: no quotes, final letters folded. */
export function termKey(word: string): string {
  return word.replace(/["'״׳`]/g, '').replace(/[ךםןףץ]/g, (c) => SOFIT[c] ?? c);
}

/** The words that carry the topic: no punctuation, stopwords or generic construction words. */
export function topicWords(q: string): string[] {
  const words = cleanQuestion(q)
    .replace(/[^֐-׿a-zA-Z0-9\s"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.filter((w) => {
    const bare = w.replace(/["'`]/g, '');
    const key = termKey(w);
    return bare.length > 0 && !STOPWORDS.has(bare) && !GENERIC.has(bare) && !GENERIC.has(key) && !(key.length < 2 && !/\d/.test(key));
  });
}

/** Text embedded for clustering. Falls back to the question when nothing is left. */
export function topicText(q: string): string {
  const words = topicWords(q);
  return words.length ? words.join(' ') : cleanQuestion(q);
}

/** Term keys of the topic words (for overlap). */
export function topicTerms(q: string): string[] {
  return Array.from(new Set(topicWords(q).map(termKey).filter((t) => t.length >= 2)));
}

/** Equal, or equal after one leading Hebrew prefix letter (מרתף ~ במרתף). */
export function termsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length > 3 && PREFIX_LETTERS.includes(a[0]) && a.slice(1) === b) return true;
  if (b.length > 3 && PREFIX_LETTERS.includes(b[0]) && b.slice(1) === a) return true;
  return false;
}

/** Jaccard overlap of two term lists, prefix-tolerant, each term matched once. */
export function termOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const used = new Uint8Array(b.length);
  let shared = 0;
  for (const t of a) {
    for (let j = 0; j < b.length; j++) {
      if (!used[j] && termsMatch(t, b[j])) {
        used[j] = 1;
        shared += 1;
        break;
      }
    }
  }
  return shared / (a.length + b.length - shared);
}
