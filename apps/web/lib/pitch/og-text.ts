/**
 * Visual word order for OG images (Satori lays text out left-to-right with no
 * bidi). Unlike lib/og/rtl.ts this handles mixed lines: Hebrew words are
 * reversed letter by letter, while Latin words, numbers and dashes keep their
 * own order ("OS", "15", "—"). Render the tokens left to right in a flex row,
 * one line per element. Pure.
 */

const HEBREW = /[֐-׿]/;

export interface VisualToken {
  text: string;
  /** Index of the word in the logical (reading) order, for styling a range. */
  index: number;
}

/** "בונים בית OS" -> [{ text: 'OS', index: 2 }, { text: 'תיב', index: 1 }, { text: 'םינוב', index: 0 }] */
export function visualTokens(line: string): VisualToken[] {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => ({ text: HEBREW.test(word) ? Array.from(word).reverse().join('') : word, index }))
    .reverse();
}

/** Every character a set of lines draws (to subset the font request). */
export function glyphsOf(lines: readonly string[]): string {
  return Array.from(new Set(Array.from(lines.join('')))).join('');
}
