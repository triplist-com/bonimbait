import { describe, expect, it } from 'vitest';
import { glyphsOf, visualTokens } from '@/lib/pitch/og-text';
import { ltr, stripIsolates } from '@/lib/pitch/text';

const visual = (line: string) => visualTokens(line).map((t) => t.text).join(' ');

describe('visualTokens (Satori has no bidi)', () => {
  it('reverses Hebrew words and their order', () => {
    expect(visual('כל שאלה של בונה')).toBe('הנוב לש הלאש לכ');
  });

  it('keeps Latin words, numbers and dashes as they are', () => {
    expect(visual('בונים בית OS — מהשאלה')).toBe('הלאשהמ — OS תיב םינוב');
    expect(visual('הסיור: 15 דקות')).toBe('תוקד 15 :רויסה');
  });

  it('keeps the logical index for styling a range', () => {
    const tokens = visualTokens('לקוח שלכם.');
    expect(tokens.map((t) => t.index)).toEqual([1, 0]);
    expect(tokens[0].text).toBe('.םכלש');
  });

  it('lists each glyph once for the font subset', () => {
    expect(glyphsOf(['אבא', 'בב'])).toBe('אב');
  });
});

describe('ltr isolates', () => {
  it('wraps a token in LRI…PDI and strips it again', () => {
    expect(ltr('2.4–2.8')).toBe('⁦2.4–2.8⁩');
    expect(stripIsolates(`טווח ${ltr('2.4–2.8')} מיליון`)).toBe('טווח 2.4–2.8 מיליון');
  });
});
