import { describe, expect, it } from 'vitest';
import { niceCeil } from '@/components/platform/demo/DailyColumns';

describe('niceCeil (chart axis maximum)', () => {
  it('rounds up to a clean value close to the peak', () => {
    expect(niceCeil(580)).toBe(600);
    expect(niceCeil(479)).toBe(500);
    expect(niceCeil(1000)).toBe(1000);
    expect(niceCeil(1010)).toBe(1200);
    expect(niceCeil(13)).toBe(15);
    expect(niceCeil(0.7)).toBe(0.8);
    expect(niceCeil(0)).toBe(1);
  });

  it('never leaves more than ~25% of the plot empty', () => {
    for (let v = 1; v < 100_000; v = Math.ceil(v * 1.37)) {
      const top = niceCeil(v);
      expect(top).toBeGreaterThanOrEqual(v);
      expect(v / top).toBeGreaterThan(0.74);
    }
  });
});
