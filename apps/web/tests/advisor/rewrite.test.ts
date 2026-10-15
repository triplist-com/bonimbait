import { describe, expect, it } from 'vitest';
import { acceptRewrite, heuristicStandalone, needsRewrite, previousStandalone, topicTerms } from '@/lib/advisor/rewrite';

const history = [{ q: 'כמה עולה שלד לבית של 200 מ״ר ב-2026?', a: 'כ-800 אלף ₪ [1].', sq: 'כמה עולה שלד לבית של 200 מ״ר ב-2026?' }];

describe('needsRewrite', () => {
  it('a first question is never rewritten', () => {
    expect(needsRewrite('ומה לגבי 300 מ״ר?', [])).toBe(false);
    expect(needsRewrite('ומה לגבי 300 מ״ר?', undefined)).toBe(false);
  });

  it.each([
    'ומה לגבי 300 מ״ר?',
    'וכמה זה עולה בצפון?',
    'מה עם מרתף?',
    'ואם יש מרתף?',
    'כמה זה עולה?',
    'למה?',
    'ואיך בודקים אותו?',
  ])('rewrites the elliptical follow-up "%s"', (q) => {
    expect(needsRewrite(q, history)).toBe(true);
  });

  it.each([
    'איך בוחרים קבלן שלד בלי להיכוות?',
    'כמה עולה ריצוף למ״ר בבית פרטי?',
    'מה חייבים לבדוק לפני יציקת בטון?',
    'כמה זמן לוקח לקבל היתר בנייה?',
  ])('keeps the standalone question "%s"', (q) => {
    expect(needsRewrite(q, history)).toBe(false);
  });

  it('never strips one-letter prefixes from topic terms', () => {
    // "לבית" stays "לבית" and "בבטון" stays "בבטון" (sofit-normalised only).
    expect(topicTerms('כמה עולה שלד לבית בבטון')).toEqual(['שלד', 'לבית', 'בבטונ']);
  });
});

describe('heuristicStandalone', () => {
  it('prefixes the previous standalone question', () => {
    expect(heuristicStandalone('ומה לגבי 300 מ״ר?', history)).toBe('כמה עולה שלד לבית של 200 מ״ר ב-2026? ומה לגבי 300 מ״ר?');
  });

  it('falls back to the previous question when there is no standalone one', () => {
    expect(previousStandalone([{ q: 'איך בוחרים קבלן?', a: '...' }])).toBe('איך בוחרים קבלן?');
  });

  it('caps the length and keeps the follow-up whole', () => {
    const long = [{ q: 'א'.repeat(400), a: '' }];
    const out = heuristicStandalone('ומה עם מרתף?', long);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith('ומה עם מרתף?')).toBe(true);
  });
});

describe('acceptRewrite', () => {
  it('accepts short Hebrew queries, trimmed and unquoted', () => {
    expect(acceptRewrite('  "כמה עולה שלד לבית של 300 מ״ר?"  ')).toBe('כמה עולה שלד לבית של 300 מ״ר?');
  });

  it('rejects empty, non-Hebrew and runaway output', () => {
    expect(acceptRewrite('')).toBeNull();
    expect(acceptRewrite(null)).toBeNull();
    expect(acceptRewrite('How much does a frame cost?')).toBeNull();
    expect(acceptRewrite('ש'.repeat(300))).toBeNull();
  });
});
