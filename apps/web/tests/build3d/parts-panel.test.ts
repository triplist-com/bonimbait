import { describe, expect, it } from 'vitest';
import { house } from '@/lib/build3d/house';
import { getTimeline } from '@/lib/build3d/engine/timeline';
import { METHOD_IDS } from '@/lib/build3d/methods';
import { partKind, shortName } from '@/components/build3d/viewer/PartsPanel';

const kind = (nameHe: string, unitHe = 'יח׳') => partKind({ nameHe, qty: 1, unitHe }).id;

describe('parts panel kinds (viewer step card)', () => {
  it('maps the main material families of every method', () => {
    expect(kind('ברזל זיון לקירות (רשת כפולה)', 'טון')).toBe('rebar');
    expect(kind('בטון ב-30 לתקרה', 'מ״ק')).toBe('concrete');
    expect(kind('בלוקים 20×20×40')).toBe('block');
    expect(kind('לוחות תקרה חלולים 20 ס״מ')).toBe('hollowcore');
    expect(kind('פאנלי קיר טרומיים עם פתחים יצוקים')).toBe('panel');
    expect(kind('צינורות מים (חמים וקרים)', 'מ׳')).toBe('pipe');
    expect(kind('לוחות בידוד XPS בעובי 6 ס״מ')).toBe('insulation');
    expect(kind('מקלחונים עם זכוכית מחוסמת')).toBe('sanitary');
    expect(kind('פסי תאורה מתחת לארונות')).toBe('lighting');
    expect(kind('תבניות דו-צדדיות לקירות', 'מ״ר')).toBe('board');
    expect(kind('שטח תקרה', 'מ״ר')).toBe('measure');
    expect(kind('מנוף נייד 120 טון עם מפעיל ומסנר')).toBe('crane');
    expect(kind('משהו חדש לגמרי')).toBe('generic');
  });

  it('gives most bill-of-materials lines a specific icon in every method', () => {
    for (const m of METHOD_IDS) {
      const lines = getTimeline(house, m).steps.flatMap((s) => s.materials);
      const generic = lines.filter((l) => partKind(l).id === 'generic');
      expect(generic.length / Math.max(1, lines.length), `${m}: ${generic.map((l) => l.nameHe).join(', ')}`).toBeLessThan(0.1);
    }
  });

  it('shortens names without their parenthesized details', () => {
    expect(shortName('ברזל זיון (קוטר 16 + ספירלה 8)')).toBe('ברזל זיון');
    expect(shortName('(רק סוגריים)')).toBe('(רק סוגריים)');
  });
});
