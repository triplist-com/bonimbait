/**
 * Citations. The model cites the numbered sources of its context as [1],
 * [1][3], [1, 3], [1-2] and sometimes [מקור 2]. One number is one source card
 * (a video or an article), so a citation maps straight to a card.
 *
 * Numbers outside 1..maxN are dropped; a citation left with no valid number
 * disappears together with the space before it. Pure and client-safe.
 */

export type CiteSegment = { type: 'text'; value: string } | { type: 'cite'; ns: number[] };

const NUM = String.raw`(?:מקור\s*)?\d{1,2}`;
const SEP = String.raw`\s*(?:[,،;]|[-–—])\s*`;
const CITE_SOURCE = String.raw`\[\s*(${NUM}(?:${SEP}${NUM})*)\s*\]`;
const MAX_RANGE = 6;

function citeRe(): RegExp {
  return new RegExp(CITE_SOURCE, 'g');
}

/** Numbers inside one citation's brackets ("1, 3" / "1-3" / "מקור 2"). */
export function parseCiteBody(body: string, maxN: number): number[] {
  const out = new Set<number>();
  const parts = body.replace(/מקור\s*/g, '').split(/\s*[,،;]\s*/);
  for (const part of parts) {
    const range = part.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (b >= a && b - a < MAX_RANGE) for (let n = a; n <= b; n++) out.add(n);
      continue;
    }
    const n = Number(part.trim());
    if (Number.isInteger(n)) out.add(n);
  }
  return Array.from(out)
    .filter((n) => n >= 1 && n <= maxN)
    .sort((a, b) => a - b);
}

/**
 * Split a run of text into plain text and citations. Adjacent citations
 * ("[1][3]", "[1] [3]") merge into one.
 */
export function splitCitations(text: string, maxN: number): CiteSegment[] {
  const out: CiteSegment[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (last?.type === 'text') last.value += value;
    else out.push({ type: 'text', value });
  };
  const re = citeRe();
  let at = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const before = text.slice(at, m.index);
    at = m.index + m[0].length;
    const ns = parseCiteBody(m[1], maxN);
    const last = out[out.length - 1];
    if (ns.length === 0) {
      // Drop the citation and the space it leaned on ("word [9]." -> "word.").
      pushText(before.replace(/[ \t]+$/, ''));
      continue;
    }
    if (last?.type === 'cite' && /^\s*$/.test(before)) {
      last.ns = Array.from(new Set([...last.ns, ...ns])).sort((a, b) => a - b);
      continue;
    }
    pushText(before);
    out.push({ type: 'cite', ns });
  }
  pushText(text.slice(at));
  return out;
}

/** Every valid source number the text cites, ascending. */
export function citedNumbers(text: string, maxN: number): number[] {
  const out = new Set<number>();
  const re = citeRe();
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    for (const n of parseCiteBody(m[1], maxN)) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** The text without citations (WhatsApp and share previews). */
export function stripCitations(text: string): string {
  return text
    .replace(citeRe(), '')
    .replace(/[ \t]+([.,;:!?)])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/**
 * While streaming, a citation can arrive in pieces ("[1" then "]"). This is
 * the length of an unfinished citation at the very end, to hide until it closes.
 */
export function partialCitationTail(text: string): number {
  const m = text.match(/\[\s*(?:מ(?:ק(?:ו(?:ר)?)?)?\s*)?(?:\d{1,2}(?:\s*(?:[,،;]|[-–—])?\s*(?:מקור\s*)?\d{0,2})*)?\s*$/);
  return m ? m[0].length : 0;
}
