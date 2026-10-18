/**
 * Keyword matching in hybrid search (app/api/_lib/semantic.ts): spelling
 * variants meet at match time, acronyms with gershayim stay whole, and
 * single-letter prefixes are never stripped from query tokens.
 */
import { describe, expect, it } from 'vitest';
import { extractContentTerms, normalizeForMatch } from '@/app/api/_lib/semantic';

describe('normalizeForMatch', () => {
  it('collapses doubled ו/י so ktiv male and haser meet', () => {
    expect(normalizeForMatch('בנייה')).toBe(normalizeForMatch('בניה'));
    expect(normalizeForMatch('ווילון')).toBe('וילונ');
    expect(normalizeForMatch('ייעוץ')).toBe('יעוצ');
  });

  it('unifies gershayim/geresh with ASCII quotes, and final letters', () => {
    expect(normalizeForMatch('תב״ע')).toBe('תב"ע');
    expect(normalizeForMatch('צ׳קליסט')).toBe("צ'קליסט");
    expect(normalizeForMatch('מרתף')).toBe('מרתפ');
  });
});

describe('extractContentTerms', () => {
  it('keeps acronyms with gershayim whole', () => {
    expect(extractContentTerms('מה זה תב״ע ואיך בודקים אותה?')).toContain('תב"ע');
    expect(extractContentTerms('תמ"א 38 בבית פרטי')).toContain('תמ"א');
    expect(extractContentTerms('מה זה תב״ע')).not.toContain('תב');
  });

  it('treats quotes around a word as punctuation', () => {
    expect(extractContentTerms('"שלד" או "גמר"')).toEqual(['שלד', 'גמר']);
  });

  it('drops unit and currency acronyms (no topic, and transcripts say "מטר")', () => {
    expect(extractContentTerms('כמה עולה שלד לבית של 200 מ״ר?')).toEqual(['עולה', 'שלד', 'לבית']);
    expect(extractContentTerms('מחיר בש"ח כולל מע"מ')).toEqual(['מחיר', 'בש"ח', 'כולל']);
  });

  it('normalises spelling but never strips a one-letter prefix', () => {
    expect(extractContentTerms('האם צריך מפקח בנייה')).toEqual(['מפקח', 'בניה']);
    expect(extractContentTerms('כמה עולה לבנות כיריים')).toEqual(['עולה', 'לבנות', 'כירימ']);
  });
});
