import { describe, expect, it } from 'vitest';
import { isTitleOnly, segmentBody } from '@/lib/knowledge/segment-text';

describe('isTitleOnly', () => {
  it('flags title-level rows of videos without captions', () => {
    expect(isTitleOnly({ kind: 'video', text: 'כותרת', title_only: true })).toBe(true);
    expect(isTitleOnly({ kind: 'video', text: 'כותרת\nתמליל' })).toBe(false);
  });
});

describe('segmentBody', () => {
  it('drops the leading title line of a video index row', () => {
    expect(segmentBody('פודקאסט פרק 109\nהשלדים בממוצע 800,000', 'פודקאסט פרק 109')).toBe('השלדים בממוצע 800,000');
  });

  it('keeps rows in the 2026-03 format (no title line) as they are', () => {
    expect(segmentBody('השלדים בממוצע 800,000', 'פודקאסט פרק 109')).toBe('השלדים בממוצע 800,000');
  });

  it('only strips a whole first line equal to the title', () => {
    expect(segmentBody('פודקאסט פרק 1090\nטקסט', 'פודקאסט פרק 109')).toBe('פודקאסט פרק 1090\nטקסט');
    expect(segmentBody('טקסט', undefined)).toBe('טקסט');
  });
});
