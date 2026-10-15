/**
 * A small, safe markdown dialect for advisor answers: short headings, bold
 * and italic, bullet and numbered lists, quotes, cost tables, rules and [n]
 * citations. It parses to a plain AST that components/advisor/AnswerMarkdown
 * renders as React text nodes, so nothing the model writes can become HTML:
 * tags stay literal text, links keep their label only.
 *
 * Streaming-aware: an unclosed "**", a citation that is still arriving
 * ("[1") and a table row without its separator yet are hidden or tolerated
 * instead of flickering raw syntax. Pure and client-safe.
 */
import { partialCitationTail, splitCitations } from './citations';

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'cite'; ns: number[] }
  | { t: 'br' };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 3 | 4; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; start: number; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

export interface ParseOptions {
  /** Highest valid citation number (the number of sources). */
  maxCite: number;
  /** The text is still arriving: hide half-written syntax at the end. */
  streaming?: boolean;
}

const HR = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const UL = /^\s*[-*•+]\s+(.*)$/;
const OL = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function isTableRow(line: string): boolean {
  const s = line.trim();
  return s.startsWith('|') && (s.match(/\|/g)?.length ?? 0) >= 2;
}

/** Cells of a table row; "\|" is a literal pipe. (No regex lookbehind: older Safari can't parse it.) */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '\\' && s[k + 1] === '|') {
      cell += '|';
      k += 1;
    } else if (s[k] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += s[k];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function startsBlock(line: string, next: string | undefined): boolean {
  return HR.test(line) || HEADING.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line) || (isTableRow(line) && (next === undefined || TABLE_SEP.test(next) || isTableRow(next)));
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

/** Links keep their label; inline code loses its backticks; escapes resolve. */
function preprocessInline(src: string): string {
  return src
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^()\s]*\))+\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1');
}

function textNodes(value: string, opts: ParseOptions): Inline[] {
  if (!value) return [];
  const out: Inline[] = [];
  // <br> inside table cells and lists: a line break we create ourselves.
  const parts = value.split(/<br\s*\/?>/i);
  parts.forEach((part, i) => {
    if (i > 0) out.push({ t: 'br' });
    for (const seg of splitCitations(part.replace(/\\([*_\\[\]|#>`-])/g, '$1'), opts.maxCite)) {
      if (seg.type === 'cite') out.push({ t: 'cite', ns: seg.ns });
      else if (seg.value) out.push({ t: 'text', v: seg.value });
    }
  });
  return out;
}

/** Index of the closing `marker` for an opening at `from`, or -1. */
function findClose(src: string, marker: string, from: number): number {
  let i = from;
  while (i < src.length) {
    const at = src.indexOf(marker, i);
    if (at === -1) return -1;
    if (src[at - 1] !== '\\' && at > from) {
      if (marker.length === 1 && src[at + 1] === marker) {
        i = at + 2; // "**" is not a single "*" close
        continue;
      }
      return at;
    }
    i = at + marker.length;
  }
  return -1;
}

function parseInlineRaw(src: string, opts: ParseOptions): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    out.push(...textNodes(buf, opts));
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if ((two === '**' || two === '__') && src[i - 1] !== '\\') {
      const close = findClose(src, two, i + 2);
      if (close !== -1 && close > i + 2) {
        flush();
        out.push({ t: 'strong', c: parseInlineRaw(src.slice(i + 2, close), opts) });
        i = close + 2;
        continue;
      }
      // Unmatched (still streaming, or a model slip): drop the marker, keep the text.
      i += 2;
      continue;
    }
    const ch = src[i];
    if ((ch === '*' || ch === '_') && src[i - 1] !== '\\') {
      const nextCh = src[i + 1];
      const prevCh = src[i - 1];
      // Emphasis opens before a non-space; "_" only between word boundaries.
      const canOpen = nextCh !== undefined && !/\s/.test(nextCh) && (ch === '*' || !prevCh || /[\s(]/.test(prevCh));
      if (canOpen) {
        const close = findClose(src, ch, i + 1);
        if (close !== -1 && !/\s/.test(src[close - 1])) {
          flush();
          out.push({ t: 'em', c: parseInlineRaw(src.slice(i + 1, close), opts) });
          i = close + 1;
          continue;
        }
      }
      if (canOpen && opts.streaming) {
        i += 1; // probably an emphasis still arriving
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return mergeText(out);
}

function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.t === 'text' && last?.t === 'text') last.v += n.v;
    else out.push(n);
  }
  return out;
}

export function parseInline(src: string, opts: ParseOptions): Inline[] {
  return parseInlineRaw(preprocessInline(src), opts);
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export function parseMarkdown(source: string, opts: ParseOptions): Block[] {
  let src = (source ?? '').replace(/\r\n?/g, '\n');
  if (opts.streaming) {
    const tail = partialCitationTail(src);
    if (tail > 0) src = src.slice(0, src.length - tail);
  }
  const lines = src.split('\n');
  const blocks: Block[] = [];
  const inline = (s: string) => parseInline(s, opts);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ t: 'hr' });
      i += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const c = inline(heading[2]);
      if (c.length > 0) blocks.push({ t: 'h', level: heading[1].length <= 3 ? 3 : 4, c });
      i += 1;
      continue;
    }

    if (isTableRow(line)) {
      const rows: string[] = [];
      let sawSeparator = false;
      while (i < lines.length && (isTableRow(lines[i]) || TABLE_SEP.test(lines[i]))) {
        if (TABLE_SEP.test(lines[i])) sawSeparator = true;
        else rows.push(lines[i]);
        i += 1;
      }
      const atEnd = i >= lines.length;
      // A lone header row at the end of a stream is a table still arriving: wait for it.
      if (rows.length === 1 && !sawSeparator && atEnd && opts.streaming) continue;
      if (rows.length >= 2 || sawSeparator) {
        const [head, ...body] = rows.map(splitRow);
        const width = head.length;
        blocks.push({
          t: 'table',
          head: head.map(inline),
          rows: body.map((r) => Array.from({ length: width }, (_, k) => inline(r[k] ?? ''))),
        });
        continue;
      }
      blocks.push({ t: 'p', c: inline(rows[0].replace(/\|/g, ' ').trim()) });
      continue;
    }

    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line) && !UL.test(line);
      const items: string[] = [];
      const start = ordered ? Number(line.match(OL)![1]) : 1;
      while (i < lines.length) {
        const l = lines[i];
        const m = ordered ? l.match(OL) : l.match(UL);
        if (m) {
          items.push(ordered ? m[2] : m[1]);
          i += 1;
          continue;
        }
        // Indented continuation of the previous item.
        if (l.trim() && /^\s{2,}/.test(l) && items.length > 0 && !startsBlock(l, lines[i + 1])) {
          items[items.length - 1] += `\n${l.trim()}`;
          i += 1;
          continue;
        }
        break;
      }
      const parsed = items.map((it) => inlineLines(it, opts)).filter((c) => c.length > 0);
      if (parsed.length > 0) blocks.push(ordered ? { t: 'ol', start, items: parsed } : { t: 'ul', items: parsed });
      continue;
    }

    if (QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        parts.push(lines[i].match(QUOTE)![1]);
        i += 1;
      }
      const c = inlineLines(parts.join('\n'), opts);
      if (c.length > 0) blocks.push({ t: 'quote', c });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i], lines[i + 1]))) {
      para.push(lines[i].trim());
      i += 1;
    }
    const c = inlineLines(para.join('\n'), opts);
    if (c.length > 0) blocks.push({ t: 'p', c });
  }
  return blocks;
}

/** Inline content where single newlines are line breaks. */
function inlineLines(text: string, opts: ParseOptions): Inline[] {
  const out: Inline[] = [];
  text.split('\n').forEach((line, k) => {
    if (k > 0) out.push({ t: 'br' });
    out.push(...parseInline(line, opts));
  });
  // Drop breaks at the edges and empty results.
  while (out[0]?.t === 'br') out.shift();
  while (out[out.length - 1]?.t === 'br') out.pop();
  return out.some((n) => n.t !== 'br') ? out : [];
}

// ---------------------------------------------------------------------------
// Numbers inside Hebrew: render LTR so ranges and prices never flip
// ---------------------------------------------------------------------------

const AMOUNT = String.raw`(?:[₪$€]\s?)?\d+(?:[.,:]\d+)*(?:\s?(?:%|[KkM₪$€])(?![A-Za-z֐-׿]))?`;
const NUMBER_RE = new RegExp(String.raw`${AMOUNT}(?:\s?[-–—]\s?${AMOUNT})?`, 'g');

export type NumberSegment = { num: boolean; v: string };

/** Split text into plain runs and numeric expressions ("2,500–3,500 ₪", "12:34", "15%"). */
export function splitNumbers(text: string): NumberSegment[] {
  const out: NumberSegment[] = [];
  const re = new RegExp(NUMBER_RE.source, 'g');
  let at = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (m.index > at) out.push({ num: false, v: text.slice(at, m.index) });
    out.push({ num: true, v: m[0] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ num: false, v: text.slice(at) });
  return out;
}

/** Plain text of inline nodes (aria labels, share text, tests). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.t === 'text') return n.v;
      if (n.t === 'br') return '\n';
      if (n.t === 'cite') return '';
      return inlineText(n.c);
    })
    .join('');
}
