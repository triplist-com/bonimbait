import { describe, expect, it } from 'vitest';
import { citedNumbers, parseCiteBody, partialCitationTail, splitCitations, stripCitations } from '@/lib/advisor/citations';

describe('splitCitations', () => {
  it('maps [n] to source numbers', () => {
    expect(splitCitations('שלד עולה כ-800 אלף ₪ [1].', 5)).toEqual([
      { type: 'text', value: 'שלד עולה כ-800 אלף ₪ ' },
      { type: 'cite', ns: [1] },
      { type: 'text', value: '.' },
    ]);
  });

  it('merges adjacent citations and reads lists, ranges and "מקור"', () => {
    expect(splitCitations('א [1][3] ב [2, 4] ג [1-3] ד [מקור 2]', 5)).toEqual([
      { type: 'text', value: 'א ' },
      { type: 'cite', ns: [1, 3] },
      { type: 'text', value: ' ב ' },
      { type: 'cite', ns: [2, 4] },
      { type: 'text', value: ' ג ' },
      { type: 'cite', ns: [1, 2, 3] },
      { type: 'text', value: ' ד ' },
      { type: 'cite', ns: [2] },
    ]);
    expect(splitCitations('[1] [2]', 3)).toEqual([{ type: 'cite', ns: [1, 2] }]);
  });

  it('drops numbers that are not sources, and a citation left empty with its space', () => {
    expect(splitCitations('מחיר [9].', 3)).toEqual([{ type: 'text', value: 'מחיר.' }]);
    expect(splitCitations('מחיר [2, 9]', 3)).toEqual([
      { type: 'text', value: 'מחיר ' },
      { type: 'cite', ns: [2] },
    ]);
    expect(splitCitations('[0]', 3)).toEqual([]);
  });

  it('leaves ordinary brackets alone', () => {
    expect(splitCitations('ראו [כאן] ו-[x]', 3)).toEqual([{ type: 'text', value: 'ראו [כאן] ו-[x]' }]);
  });
});

describe('citedNumbers / parseCiteBody / stripCitations', () => {
  it('collects valid numbers in order', () => {
    expect(citedNumbers('א [3] ב [1][3] ג [7]', 5)).toEqual([1, 3]);
  });

  it('refuses huge ranges', () => {
    expect(parseCiteBody('1-40', 50)).toEqual([]);
    expect(parseCiteBody('2 – 4', 5)).toEqual([2, 3, 4]);
  });

  it('strips citations for share text', () => {
    expect(stripCitations('שלד עולה 800 אלף ₪ [1]. מרתף מייקר [2][3].')).toBe('שלד עולה 800 אלף ₪. מרתף מייקר.');
  });
});

describe('partialCitationTail', () => {
  it('finds a citation that is still arriving', () => {
    expect(partialCitationTail('מחיר [')).toBe(1);
    expect(partialCitationTail('מחיר [1')).toBe(2);
    expect(partialCitationTail('מחיר [1, ')).toBe(4);
    expect(partialCitationTail('מחיר [מקו')).toBe(4);
  });

  it('ignores finished citations and other brackets', () => {
    expect(partialCitationTail('מחיר [1]')).toBe(0);
    expect(partialCitationTail('ראו [כאן')).toBe(0);
    expect(partialCitationTail('מחיר')).toBe(0);
  });
});
