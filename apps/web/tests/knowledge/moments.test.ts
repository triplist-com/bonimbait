import { describe, expect, it } from 'vitest';
import { focusSegment, focusWindow, secondAt, wantsNumbers, type Mark } from '@/lib/knowledge/moments';

// Distinct filler words without digits (digits would count as price figures).
const LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';
const filler = (n: number) => Array.from({ length: n }, (_, i) => `מילה${LETTERS[i % 22]}${LETTERS[Math.floor(i / 22) % 22]}`).join(' ');

describe('secondAt', () => {
  const marks: Mark[] = [
    [0, 1608],
    [120, 1620],
    [400, 1640],
  ];
  it('uses the last mark at or before the offset', () => {
    expect(secondAt(marks, 0, 1608)).toBe(1608);
    expect(secondAt(marks, 399, 1608)).toBe(1620);
    expect(secondAt(marks, 5000, 1608)).toBe(1640);
  });
  it('falls back to the segment start without marks', () => {
    expect(secondAt(undefined, 300, 1608.7)).toBe(1608);
  });
});

describe('focusWindow', () => {
  it('returns the whole body when it is short', () => {
    expect(focusWindow('קצר', ['שלד'], 800)).toEqual({ start: 0, end: 3, anchor: 0 });
  });

  it('starts at the beginning when no term matches', () => {
    expect(focusWindow(filler(400), ['שלד'], 800)).toEqual({ start: 0, end: 800, anchor: 0 });
  });

  it('moves to the passage with the most distinct terms', () => {
    const body = `${filler(150)} השלדים בממוצע 800,000 שקל לבית של 200 מטר ${filler(150)}`;
    const { start, end } = focusWindow(body, ['שלד', 'לבית'], 800);
    const shown = body.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(shown).toContain('800,000');
    expect(end - start).toBe(800);
    expect(body[start - 1]).toBe(' '); // starts on a word boundary
  });

  it('matches the sofit form and the single-letter prefix like semantic.ts', () => {
    const body = `${filler(150)} בניתי ביתן קטן ${filler(150)}`;
    expect(focusWindow(body, ['ביתנ'], 800).start).toBeGreaterThan(0); // ן == נ
    const prefixed = `${filler(150)} עלות הבית כולו ${filler(150)}`;
    expect(focusWindow(prefixed, ['לבית'], 800).start).toBeGreaterThan(0); // לבית -> בית
  });
});

describe('wantsNumbers', () => {
  it('detects amount questions', () => {
    expect(wantsNumbers('כמה עולה שלד לבית של 200 מ״ר ב-2026?')).toBe(true);
    expect(wantsNumbers('מה העלות של חימום תת רצפתי?')).toBe(true);
    expect(wantsNumbers('איך מאטמים מרתף נכון?')).toBe(false);
  });
});

describe('numeric focus', () => {
  // The early cluster has more plain hits (4 vs 3); only the later one has prices.
  const early = `שלד ${filler(10)} בית ${filler(10)} שלד ${filler(10)} בית`;
  const late = `שלד ${filler(10)} השלדים בממוצע 800,000 שק לבית של 200 מטר ${filler(10)} 850 אלף`;
  const body = `${filler(40)} ${early} ${filler(60)} ${late} ${filler(60)}`;

  it('prefers the passage with price figures for amount questions', () => {
    const plain = focusWindow(body, ['שלד', 'לבית'], 400);
    const numeric = focusWindow(body, ['שלד', 'לבית'], 400, true);
    expect(body.slice(plain.start, plain.end)).not.toContain('800,000');
    expect(body.slice(numeric.start, numeric.end)).toContain('800,000');
    expect(numeric.anchor).toBe(body.indexOf('800,000'));
  });

  it('plays from a formatted amount rather than a bare number before it', () => {
    const text = `${filler(40)} תיקח 1000 תקציבים אחורה, השלדים בממוצע 800,000 שק לבית ${filler(80)}`;
    const w = focusWindow(text, ['שלד', 'לבית'], 400, true);
    expect(w.anchor).toBe(text.indexOf('800,000'));
  });

  it('does not treat years as prices', () => {
    const years = `${filler(40)} בשנת 2026 שלד ${filler(80)}`;
    const w = focusWindow(years, ['שלד'], 300, true);
    expect(w.anchor).toBe(years.indexOf('שלד'));
  });
});

describe('focusSegment', () => {
  it('drops the title line, shows the matching part and plays from its first hit', () => {
    const body = `${filler(150)} השלדים בממוצע 800,000 שקל ${filler(150)}`;
    const offset = body.indexOf('השלדים');
    const marks: Mark[] = [
      [0, 1608],
      [offset - 200, 1700],
      [offset + 50, 1717],
    ];
    const out = focusSegment({ text: `פרק 109\n${body}`, start_time: 1608, marks }, 'פרק 109', ['שלד']);
    expect(out.text).toContain('800,000');
    expect(out.text.startsWith('פרק 109')).toBe(false);
    expect(out.second).toBe(1700);
  });

  it('plays from the price for an amount question', () => {
    const body = `${filler(150)} השלדים בממוצע 800,000 שקל ${filler(150)}`;
    const price = body.indexOf('800,000');
    const marks: Mark[] = [
      [0, 1608],
      [price - 30, 1712],
      [price + 200, 1730],
    ];
    const out = focusSegment({ text: body, start_time: 1608, marks }, undefined, ['שלד'], { numeric: true });
    expect(out.second).toBe(1712);
  });
});
