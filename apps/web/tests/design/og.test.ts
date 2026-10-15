import { describe, expect, it } from 'vitest';
import { visualHebrew, visualWords } from '@/lib/og/rtl';

describe('Satori RTL helpers', () => {
  it('pre-orders a Hebrew line for an LTR renderer', () => {
    expect(visualHebrew('בונים בית')).toBe('תיב םינוב');
    expect(visualHebrew(visualHebrew('אתכם עד המפתח'))).toBe('אתכם עד המפתח');
  });

  it('returns words in visual left-to-right order', () => {
    expect(visualWords('אתכם עד המפתח')).toEqual(['חתפמה', 'דע', 'םכתא']);
    expect(visualWords('  שתי   מילים ')).toEqual(['םילימ', 'יתש']);
  });
});
