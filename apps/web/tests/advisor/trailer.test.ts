import { describe, expect, it } from 'vitest';
import { FOLLOWUPS_MARKER, TrailerSplitter, cleanAnswerTail, heldTailLength, parseFollowups } from '@/lib/advisor/trailer';

/** Stream `text` through a splitter in pieces of `size` characters. */
function streamThrough(text: string, size: number) {
  const s = new TrailerSplitter();
  let shown = '';
  for (let i = 0; i < text.length; i += size) shown += s.push(text.slice(i, i + size));
  shown += s.end();
  return { s, shown };
}

const ANSWER = 'שלד לבית של 200 מ״ר עולה **כ-800,000 ₪** [1].\n\n- תלוי במרתף [2]';
const FULL = `${ANSWER}\n\n${FOLLOWUPS_MARKER}\nכמה עולה שלד לבית של 300 מ״ר?\n- איך בוחרים קבלן שלד?\n3. מה כולל מחיר השלד?\n`;

describe('TrailerSplitter', () => {
  it.each([1, 2, 3, 5, 7, 13, 1000])('never shows the trailer (chunks of %i)', (size) => {
    const { s, shown } = streamThrough(FULL, size);
    expect(shown).not.toContain('@@');
    expect(shown).not.toContain('300');
    expect(s.answer).toBe(ANSWER);
    expect(s.hasTrailer).toBe(true);
    expect(s.followups()).toEqual(['כמה עולה שלד לבית של 300 מ״ר?', 'איך בוחרים קבלן שלד?', 'מה כולל מחיר השלד?']);
  });

  it('holds back a marker split across chunks, then releases plain "@" text', () => {
    const s = new TrailerSplitter();
    expect(s.push('מייל: info@')).toBe('מייל: info');
    expect(s.push('bonimbayit.co.il')).toBe('@bonimbayit.co.il');
    expect(s.push(' סוף @@FOL')).toBe(' סוף');
    expect(s.push('LOWUPS@@\nשאלה אחת?')).toBe('');
    expect(s.end()).toBe('');
    expect(s.followups()).toEqual(['שאלה אחת?']);
  });

  it('tolerates spacing, case and a bold-wrapped marker; streams exactly the clean answer', () => {
    for (const size of [1, 4, 9, 100]) {
      const { s, shown } = streamThrough('תשובה קצרה.\n\n**@@ followups @@**\nשאלה ראשונה?\n', size);
      expect(shown).toBe('תשובה קצרה.');
      expect(s.answer).toBe('תשובה קצרה.');
      expect(s.followups()).toEqual(['שאלה ראשונה?']);
    }
  });

  it('releases held spaces and markup once text follows', () => {
    const s = new TrailerSplitter();
    expect(s.push('מחיר **')).toBe('מחיר');
    expect(s.push('800 אלף** ו-')).toBe(' **800 אלף** ו');
    expect(s.push('עוד')).toBe('-עוד');
    expect(s.push('\n- ')).toBe('');
    expect(s.end()).toBe('\n- ');
  });

  it('without a marker, everything is answer and there are no follow-ups', () => {
    const { s, shown } = streamThrough('תשובה בלי שאלות המשך @ סוף', 3);
    expect(shown).toBe('תשובה בלי שאלות המשך @ סוף');
    expect(s.hasTrailer).toBe(false);
    expect(s.followups()).toEqual([]);
  });

  it('reads the out-of-scope flag and never shows it as a follow-up', () => {
    const { s, shown } = streamThrough('אני עונה על שאלות על בניית בית.\n\n@@FOLLOWUPS@@\nOUT_OF_SCOPE\nכמה עולה שלד?\nאיך בוחרים קבלן?', 6);
    expect(shown).toBe('אני עונה על שאלות על בניית בית.');
    expect(s.outOfScope).toBe(true);
    expect(s.followups()).toEqual(['כמה עולה שלד?', 'איך בוחרים קבלן?']);
    expect(streamThrough(FULL, 5).s.outOfScope).toBe(false);
  });

  it('heldTailLength only holds what can still become the marker', () => {
    expect(heldTailLength('טקסט @')).toBe(1);
    expect(heldTailLength('טקסט @@ fo')).toBe(5);
    expect(heldTailLength('טקסט @x')).toBe(0);
    expect(heldTailLength('טקסט')).toBe(0);
  });
});

describe('cleanAnswerTail', () => {
  it('drops a trailing rule, empty heading and dangling bold', () => {
    expect(cleanAnswerTail('תשובה.\n\n---\n')).toBe('תשובה.');
    expect(cleanAnswerTail('תשובה.\n\n###')).toBe('תשובה.');
    expect(cleanAnswerTail('תשובה.\n\n**')).toBe('תשובה.');
  });

  it('keeps a real closing bold', () => {
    expect(cleanAnswerTail('המחיר: **800 אלף ₪**')).toBe('המחיר: **800 אלף ₪**');
    expect(cleanAnswerTail('**שלד** ועוד **')).toBe('**שלד** ועוד');
  });
});

describe('parseFollowups', () => {
  it('cleans bullets, numbering, quotes and bold; dedupes; caps at 3', () => {
    const trailer = '\n1. "כמה עולה שלד?"\n* **איך בוחרים קבלן?**\n• כמה עולה שלד?\nמה עם מרתף?\nשאלה רביעית?\n';
    expect(parseFollowups(trailer)).toEqual(['כמה עולה שלד?', 'איך בוחרים קבלן?', 'מה עם מרתף?']);
  });

  it('skips the question that was just asked, non-Hebrew lines and noise', () => {
    const trailer = 'Follow-up questions:\nכמה עולה שלד לבית של 200 מ"ר?\n?\nאיך חוסכים בשלד?';
    expect(parseFollowups(trailer, 'כמה עולה שלד לבית של 200 מ״ר')).toEqual(['איך חוסכים בשלד?']);
  });
});
