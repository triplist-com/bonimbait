import { describe, expect, it } from 'vitest';
import { focusForQuery } from '@/lib/knowledge/moments';
import { cleanSpokenText, momentFinder, quoteAround } from '@/lib/advisor/moments';

// Shaped like the Ep. 109 row in data/search-index.json: "<title>\n<body>", caption marks.
const TITLE = 'פודקאסט פרק 109 - עלויות בניה בשנת 2026';
const BODY =
  'אם אני מסכם את השלד והפיתוח, תיקח 1000 תקציבים אחורה, ממוצעים של שלדים >> ביחס לעלות. ' +
  '>> כן. אז ביחס לשנתיים האחרונות השלדים א נמצאים באזור של ה בממוצע 800,000 שק. ' +
  'זה יכול להיות כמובן קצת יותר זול, אבל זה גם יכול להיות יותר יקר משמעותית.';
const AT_800 = BODY.indexOf('800,000');
const SEGMENT = {
  text: `${TITLE}\n${BODY}`,
  start_time: 1608,
  marks: [
    [0, 1608],
    [AT_800 - 40, 1700],
    [AT_800 - 5, 1714],
    [AT_800 + 60, 1722],
  ] as Array<[number, number]>,
};
const QUESTION = 'כמה עולה שלד לבית של 200 מ״ר ב-2026?';

describe('momentFinder', () => {
  it('plays a cost question from the second the price is said', () => {
    const m = momentFinder(QUESTION)(SEGMENT, TITLE);
    expect(m.second).toBe(1714);
    expect(m.text).toContain('800,000');
    expect(m.quote).toContain('בממוצע 800,000 שק');
  });

  it('text and second are exactly what the knowledge hook returns', () => {
    const ours = momentFinder(QUESTION)(SEGMENT, TITLE);
    const theirs = focusForQuery(QUESTION)(SEGMENT, TITLE);
    expect({ text: ours.text, second: ours.second }).toEqual(theirs);
  });

  it('without marks, falls back to the segment start', () => {
    const m = momentFinder(QUESTION)({ text: SEGMENT.text, start_time: 1608 }, TITLE);
    expect(m.second).toBe(1608);
  });
});

describe('quote cleanup', () => {
  it('removes ASR noise but never shortens words', () => {
    expect(cleanSpokenText('השלדים א נמצאים באזור של ה בממוצע >> כן [מוזיקה] אה טוב')).toBe('השלדים נמצאים באזור של בממוצע כן טוב');
    expect(cleanSpokenText('אמא אהבה הבית')).toBe('אמא אהבה הבית');
  });

  it('cuts on word boundaries with ellipses', () => {
    const q = quoteAround(BODY, AT_800, 30, 40);
    expect(q.startsWith('…')).toBe(true);
    expect(q.endsWith('…')).toBe(true);
    expect(q).toContain('800,000');
    // No partial first or last word.
    const words = q.replace(/…/g, '').split(' ');
    for (const w of [words[0], words[words.length - 1]]) expect(BODY.split(/\s+/)).toContain(w);
  });
});
