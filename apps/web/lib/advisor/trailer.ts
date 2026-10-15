/**
 * Follow-up questions come from the same model call as the answer, as a
 * trailer after a marker line:
 *
 *   ...the answer in markdown...
 *
 *   @@FOLLOWUPS@@
 *   כמה עולה שלד לבית של 300 מ״ר?
 *   איך בוחרים קבלן שלד?
 *
 * TrailerSplitter sits on the token stream: it passes answer text through and
 * holds back anything that could be the start of the marker, so the trailer
 * never reaches the visitor. Pure and client-safe.
 */

export const FOLLOWUPS_MARKER = '@@FOLLOWUPS@@';
/** First trailer line when the question is outside home building (the model's own judgement). */
export const OUT_OF_SCOPE_FLAG = 'OUT_OF_SCOPE';
export const MAX_FOLLOWUPS = 3;

/** Did the model mark the question as outside home building? */
export function isOutOfScope(trailer: string): boolean {
  return /(^|\n)\s*OUT[_\s-]?OF[_\s-]?SCOPE\b/i.test(trailer);
}

// Tolerant: "@@ FOLLOWUPS @@", "@@FOLLOW-UPS@@", any case.
const MARKER_RE = /@@\s*follow[-\s]?ups\s*@@/i;
const MARKER_KEY = 'FOLLOWUPS';

/** Normalised form of a possible marker start, for prefix checks ("@@ Follow" -> "@@FOLLOW"). */
function squash(s: string): string {
  return s.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Length of the buffer's tail that could still grow into the marker
 * (0 when nothing needs holding back).
 */
export function heldTailLength(buffer: string): number {
  const from = Math.max(0, buffer.length - 24);
  for (let i = from; i < buffer.length; i++) {
    if (buffer[i] !== '@') continue;
    const tail = squash(buffer.slice(i));
    const full = `@@${MARKER_KEY}@@`;
    if (tail.length <= full.length && full.startsWith(tail)) return buffer.length - i;
  }
  return 0;
}

export class TrailerSplitter {
  private pending = '';
  private visible = '';
  private trailer: string | null = null;

  /** Feed a text delta; returns the part that is safe to show now. */
  push(delta: string): string {
    if (!delta) return '';
    if (this.trailer !== null) {
      this.trailer += delta;
      return '';
    }
    this.pending += delta;
    const m = MARKER_RE.exec(this.pending);
    if (m) {
      const before = this.pending.slice(0, m.index);
      this.trailer = this.pending.slice(m.index + m[0].length);
      this.pending = '';
      // What leads into the marker (blank lines, a rule, "**") is never shown.
      const full = cleanAnswerTail(this.visible + before);
      return this.show(full.length > this.visible.length ? full.slice(this.visible.length) : '');
    }
    let cut = this.pending.length - heldTailLength(this.pending);
    // Also hold trailing spaces and markup until real text follows: if the marker comes
    // next they are dropped, otherwise they go out with the next delta.
    while (cut > 0 && /[\s*#_-]/.test(this.pending[cut - 1])) cut -= 1;
    const out = this.pending.slice(0, cut);
    this.pending = this.pending.slice(cut);
    return this.show(out);
  }

  /** End of stream: whatever was held back and is not a marker becomes visible. */
  end(): string {
    if (this.trailer !== null) return '';
    const rest = this.pending;
    this.pending = '';
    return this.show(rest);
  }

  /** True once the marker was seen. */
  get hasTrailer(): boolean {
    return this.trailer !== null;
  }

  /** The visible answer so far, without the trailer and its leftovers. */
  get answer(): string {
    return cleanAnswerTail(this.visible);
  }

  /** Raw text after the marker. */
  get trailerText(): string {
    return this.trailer ?? '';
  }

  followups(question?: string): string[] {
    return parseFollowups(this.trailerText, question);
  }

  get outOfScope(): boolean {
    return isOutOfScope(this.trailerText);
  }

  private show(text: string): string {
    this.visible += text;
    return text;
  }
}

/** True when `text` ends with `mark` and that mark has no partner (odd count). */
function endsWithDangling(text: string, mark: string): boolean {
  return text.endsWith(mark) && (text.split(mark).length - 1) % 2 === 1;
}

/**
 * Drop what a model leaves right before the marker: blank lines, a horizontal
 * rule, an empty heading, or an unmatched "**" from a bold-wrapped marker.
 * A real closing "**" (bold that ends the answer) is kept.
 */
export function cleanAnswerTail(text: string): string {
  let out = text.replace(/\s+$/, '');
  for (let i = 0; i < 5; i++) {
    let next = out
      .replace(/(?:^|\n)[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/, '')
      .replace(/(?:^|\n)[ \t]*#{1,6}[ \t]*$/, '')
      .replace(/\s+$/, '');
    for (const mark of ['**', '__']) {
      if (endsWithDangling(next, mark)) next = next.slice(0, -mark.length).replace(/\s+$/, '');
    }
    if (next === out) break;
    out = next;
  }
  return out;
}

const HEBREW = /[֐-׿]/;

function normaliseQuestion(s: string): string {
  return s
    .replace(/[״"׳'?!.,:;()\s-]/g, '')
    .replace(/[ךםןףץ]/g, (c) => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })[c] ?? c);
}

/**
 * Follow-up questions from the trailer text: one per line, bullets, numbers,
 * quotes and bold marks removed, Hebrew only, deduplicated, at most 3, never
 * the question that was just asked.
 */
export function parseFollowups(trailer: string, question?: string, max = MAX_FOLLOWUPS): string[] {
  const asked = question ? normaliseQuestion(question) : null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of trailer.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw
      .replace(/@@[^@]*@@/g, '')
      .replace(/^\s*(?:[-*•–]|\d{1,2}[.)]|[א-ת][.)])\s*/, '')
      .replace(/\*\*|__/g, '')
      .replace(/^["״'“”«»\s]+|["״'“”«»\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (line.length < 4 || line.length > 140 || !HEBREW.test(line)) continue;
    const key = normaliseQuestion(line);
    if (!key || seen.has(key) || key === asked) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}
