import { describe, expect, it } from 'vitest';
import { focusForQuery } from '@/lib/knowledge/moments';
import { cleanSpokenText, momentFinder, quoteAround, scrubAsrNumbers } from '@/lib/advisor/moments';

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

  it('second is exactly what the knowledge hook returns, and so is the text when it has no ASR artifacts', () => {
    const ours = momentFinder(QUESTION)(SEGMENT, TITLE);
    const theirs = focusForQuery(QUESTION)(SEGMENT, TITLE);
    expect({ text: ours.text, second: ours.second }).toEqual(theirs);
  });

  it('frees figures from stray letters in the passage the model reads, and never changes a figure', () => {
    const seg = { text: 'צריך כיסוי של 2ח סנטימטר בין הרשת לבטון, והשלד עלה 575,000ל שק', start_time: 0 };
    const m = momentFinder('מה בודקים לפני יציקה?')(seg, undefined);
    expect(m.text).toContain('575,000 שק');
    // "2ח" is "two and a half": "2" (or nothing) would be a different figure.
    expect(m.text).toContain('2ח סנטימטר');
  });

  it('without marks, falls back to the segment start', () => {
    const m = momentFinder(QUESTION)({ text: SEGMENT.text, start_time: 1608 }, TITLE);
    expect(m.second).toBe(1608);
  });
});

describe('scrubAsrNumbers', () => {
  it('frees real figures from stray letters', () => {
    expect(scrubAsrNumbers('עלה 575,000ל שק')).toBe('עלה 575,000 שק');
    expect(scrubAsrNumbers('בערך 10ה חודשים, 1,500ב.')).toBe('בערך 10 חודשים, 1,500.');
  });

  it('leaves alone what the digits alone would misstate', () => {
    // A single digit fused to letters is the tail of a spoken number.
    expect(scrubAsrNumbers('כיסוי של 2ח סנטימטר 2 2ח סנטימטר')).toBe('כיסוי של 2ח סנטימטר 2 2ח סנטימטר');
    expect(scrubAsrNumbers('זה 8ן מהמקרים, (7בע ליטר)')).toBe('זה 8ן מהמקרים, (7בע ליטר)');
    // "ח"/"וח" opens "וחצי": 10ח is ten and a half.
    expect(scrubAsrNumbers('עוד 10ח מטר ועוד 12וח')).toBe('עוד 10ח מטר ועוד 12וח');
  });

  it('never touches clean text', () => {
    const clean = 'בממוצע 800,000 שק, ב-2026, 3D, 35% מעוגת הביצוע, 1.7 מיליון';
    expect(scrubAsrNumbers(clean)).toBe(clean);
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
