/**
 * Exact video moments for the advisor, on top of the knowledge squad's
 * primitives (lib/knowledge/moments.ts): the passage of a 3-minute segment
 * that matches the question (sent to the model), the second to play from
 * (from the row's caption `marks`, else the segment start) and a short,
 * readable quote of what is said there (shown on the source card).
 *
 * `text` and `second` are exactly what focusSegment() returns; this module
 * only adds the quote. Pure, but keep it out of client bundles:
 * lib/knowledge/moments.ts uses a regex lookbehind that Safari < 16.4 can't parse.
 */
import { focusWindow, queryTerms, secondAt, wantsNumbers, type MomentSegment } from '@/lib/knowledge/moments';
import { segmentBody } from '@/lib/knowledge/segment-text';

export interface ResolvedMoment {
  /** The matching passage, for the model's context. */
  text: string;
  /** Second to play from. */
  second: number;
  /** What is said at that second, cleaned for display. */
  quote: string;
}

/** Characters of context sent to the model per passage. */
export const PASSAGE_CHARS = 800;
const QUOTE_BEFORE = 70;
const QUOTE_AFTER = 190;

/**
 * Figures that speech recognition glued to a stray letter ("575,000ל שק",
 * "10ה חודשים"): the letter goes, the figure stays.
 *
 * Left as they are, because the digits alone would be a different figure:
 * - a single digit fused to letters, the tail of a spoken number: "2ח סנטימטר"
 *   is "two and a half", "8ן" is "eighty";
 * - any figure followed by "ח"/"וח", the start of "וחצי" (and a half).
 * The model reads those in context.
 */
export function scrubAsrNumbers(text: string): string {
  return text.replace(/(^|[\s(])(\d{2,}(?:[.,]\d+)*|\d(?:[.,]\d+)+)(?!ו?ח(?=[\s.,!?)]|$))[א-ת]{1,2}(?=[\s.,!?)]|$)/g, '$1$2');
}

/**
 * ASR leftovers that only add noise to a displayed quote: speaker-change marks
 * (">>"), bracketed sound tags ("[מוזיקה]") and stand-alone hesitation tokens
 * ("א", "אה", "אמ"). A stand-alone "ה" is never a Hebrew word, so it is a
 * hesitation too. Words are never shortened.
 */
export function cleanSpokenText(text: string): string {
  return scrubAsrNumbers(text)
    .replace(/>>/g, ' ')
    .replace(/\[[^\]]{1,20}\]/g, ' ')
    .replace(/(^|\s)(?:א|אה|אמ|אממ|הממ|ה)(?=\s|[.,!?]|$)/g, '$1')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** A word-bounded excerpt around `anchor`, with ellipses where it was cut. */
export function quoteAround(body: string, anchor: number, before = QUOTE_BEFORE, after = QUOTE_AFTER): string {
  let start = Math.max(0, anchor - before);
  let end = Math.min(body.length, anchor + after);
  if (start > 0) {
    const space = body.indexOf(' ', start);
    start = space !== -1 && space < anchor ? space + 1 : start;
  }
  if (end < body.length) {
    const space = body.lastIndexOf(' ', end);
    end = space > anchor ? space : end;
  }
  const core = cleanSpokenText(body.slice(start, end));
  if (!core) return '';
  return `${start > 0 ? '…' : ''}${core}${end < body.length ? '…' : ''}`;
}

/**
 * The moment resolver for one question. Same term and amount rules as the
 * knowledge squad's focusForQuery(): a cost question anchors on the first
 * price figure in the best window.
 */
export function momentFinder(query: string): (seg: MomentSegment, title: string | undefined) => ResolvedMoment {
  const terms = queryTerms(query);
  const numeric = wantsNumbers(query);
  return (seg, title) => {
    const body = segmentBody(seg.text, title);
    const { start, end, anchor } = focusWindow(body, terms, PASSAGE_CHARS, numeric);
    return {
      // Offsets and the second come from the raw body; only the text the model reads is scrubbed.
      text: scrubAsrNumbers(body.slice(start, end)),
      second: secondAt(seg.marks, anchor, seg.start_time),
      quote: quoteAround(body, anchor),
    };
  };
}
