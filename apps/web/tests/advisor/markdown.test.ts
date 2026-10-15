import { describe, expect, it } from 'vitest';
import { inlineText, parseInline, parseMarkdown, splitNumbers, type Block } from '@/lib/advisor/markdown';

const opts = { maxCite: 5 };

describe('parseMarkdown: blocks', () => {
  it('parses a typical answer: lead paragraph, heading, list, table', () => {
    const md = [
      'שלד לבית של 200 מ״ר עולה **כ-800,000 ₪** בממוצע [1].',
      '',
      '### ממה זה מורכב',
      '- יציקות ובטון [1]',
      '- מרתף מייקר משמעותית [2]',
      '',
      '| רכיב | מחיר |',
      '|---|---|',
      '| שלד | 800,000 ₪ [1] |',
      '| פיתוח | 150,000 ₪ |',
    ].join('\n');
    const blocks = parseMarkdown(md, opts);
    expect(blocks.map((b) => b.t)).toEqual(['p', 'h', 'ul', 'table']);
    const [p, h, ul, table] = blocks as [Extract<Block, { t: 'p' }>, Extract<Block, { t: 'h' }>, Extract<Block, { t: 'ul' }>, Extract<Block, { t: 'table' }>];
    expect(p.c).toEqual([
      { t: 'text', v: 'שלד לבית של 200 מ״ר עולה ' },
      { t: 'strong', c: [{ t: 'text', v: 'כ-800,000 ₪' }] },
      { t: 'text', v: ' בממוצע ' },
      { t: 'cite', ns: [1] },
      { t: 'text', v: '.' },
    ]);
    expect(h).toMatchObject({ level: 3 });
    expect(ul.items).toHaveLength(2);
    expect(table.head.map(inlineText)).toEqual(['רכיב', 'מחיר']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][1]).toEqual([{ t: 'text', v: '800,000 ₪ ' }, { t: 'cite', ns: [1] }]);
  });

  it('ordered lists keep their start; quotes and rules parse', () => {
    const blocks = parseMarkdown('3. שלישי\n4. רביעי\n\n> "תבדקו את הקבלן"\n\n---', opts);
    expect(blocks).toEqual([
      { t: 'ol', start: 3, items: [[{ t: 'text', v: 'שלישי' }], [{ t: 'text', v: 'רביעי' }]] },
      { t: 'quote', c: [{ t: 'text', v: '"תבדקו את הקבלן"' }] },
      { t: 'hr' },
    ]);
  });

  it('single newlines inside a paragraph are line breaks; #### is a small heading', () => {
    expect(parseMarkdown('שורה אחת\nשורה שתיים', opts)).toEqual([
      { t: 'p', c: [{ t: 'text', v: 'שורה אחת' }, { t: 'br' }, { t: 'text', v: 'שורה שתיים' }] },
    ]);
    expect(parseMarkdown('#### קטן', opts)[0]).toMatchObject({ t: 'h', level: 4 });
  });

  it('accepts a pipe table without a separator row', () => {
    const blocks = parseMarkdown('| א | ב |\n| 1 | 2 |', opts);
    expect(blocks[0]).toMatchObject({ t: 'table' });
  });
});

describe('parseMarkdown: safety', () => {
  it('keeps HTML as literal text', () => {
    const blocks = parseMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>', opts);
    expect(blocks).toEqual([{ t: 'p', c: [{ t: 'text', v: '<script>alert(1)</script> <img src=x onerror=alert(1)>' }] }]);
  });

  it('links and images keep only their label', () => {
    expect(inlineText(parseInline('[לחצו כאן](javascript:alert(1)) ו-![תמונה](http://x.test/a.png)', opts))).toBe('לחצו כאן ו-תמונה');
  });

  it('only <br> becomes an element', () => {
    expect(parseInline('א<br>ב<br/>ג', opts)).toEqual([
      { t: 'text', v: 'א' },
      { t: 'br' },
      { t: 'text', v: 'ב' },
      { t: 'br' },
      { t: 'text', v: 'ג' },
    ]);
  });
});

describe('parseMarkdown: streaming', () => {
  it('hides an unclosed bold marker instead of showing asterisks', () => {
    expect(parseMarkdown('המחיר הוא **800 אל', { ...opts, streaming: true })).toEqual([
      { t: 'p', c: [{ t: 'text', v: 'המחיר הוא 800 אל' }] },
    ]);
  });

  it('hides a citation that is still arriving', () => {
    expect(inlineText((parseMarkdown('המחיר [1', { ...opts, streaming: true })[0] as Extract<Block, { t: 'p' }>).c)).toBe('המחיר');
  });

  it('waits for a table header row that has no separator yet', () => {
    expect(parseMarkdown('פתיח\n\n| רכיב | מחיר |', { ...opts, streaming: true })).toEqual([{ t: 'p', c: [{ t: 'text', v: 'פתיח' }] }]);
  });

  it('a finished text with a stray "**" drops the marker', () => {
    expect(parseMarkdown('מחיר **800', opts)).toEqual([{ t: 'p', c: [{ t: 'text', v: 'מחיר 800' }] }]);
  });
});

describe('inline emphasis', () => {
  it('parses *em* and nested emphasis inside bold', () => {
    expect(parseInline('**שלד *כולל* מרתף**', opts)).toEqual([
      { t: 'strong', c: [{ t: 'text', v: 'שלד ' }, { t: 'em', c: [{ t: 'text', v: 'כולל' }] }, { t: 'text', v: ' מרתף' }] },
    ]);
  });

  it('does not treat a lone asterisk or snake_case as emphasis', () => {
    expect(inlineText(parseInline('5 * 3 = 15 ו-file_name_x', opts))).toBe('5 * 3 = 15 ו-file_name_x');
  });
});

describe('splitNumbers', () => {
  it('isolates prices, ranges, percentages and times', () => {
    const nums = (s: string) => splitNumbers(s).filter((x) => x.num).map((x) => x.v);
    expect(nums('בין 2,500–3,500 ₪ למ״ר')).toEqual(['2,500–3,500 ₪']);
    expect(nums('כ-800,000 ₪ ב-2026')).toEqual(['800,000 ₪', '2026']);
    expect(nums('חריגה של 10%-15% מהתקציב')).toEqual(['10%-15%']);
    expect(nums('צפו מ-28:34')).toEqual(['28:34']);
    expect(nums('₪1.3 מיליון')).toEqual(['₪1.3']);
  });

  it('keeps Hebrew words out of the LTR run', () => {
    expect(splitNumbers('200 מ״ר')).toEqual([
      { num: true, v: '200' },
      { num: false, v: ' מ״ר' },
    ]);
  });
});
