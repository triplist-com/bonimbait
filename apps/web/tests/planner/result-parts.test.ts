import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { estimateBudget } from '@/lib/planner/engine';
import {
  amountText,
  asOfBadge,
  compactRange,
  isolateRanges,
  monthYear,
  monthYearAfter,
  monthsText,
  perM2Text,
  rangeText,
  shortDate,
  stripIsolates,
} from '@/lib/planner/format';
import { plannerSnapshot } from '@/lib/planner/storage';
import { reportHref, shareUrl, whatsappShareHref, whatsappShareText } from '@/lib/planner/share';
import { OVERRUN_WARNINGS, momentClock, momentHref, selectOverrunWarnings } from '@/lib/planner/warnings';
import { whatIfVariants } from '@/lib/planner/variants';
import type { PlannerInput } from '@/lib/planner/types';

const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const base: PlannerInput = { sizeM2: 200, floors: 2, regionSlug: 'center', finishLevel: 'standard', extras: [] };
const plain = (s: string) => stripIsolates(s);

describe('formatting (numbers in Hebrew text)', () => {
  it('picks one unit per range', () => {
    expect(plain(compactRange(2_210_000, 2_990_000).value)).toBe('2.21–2.99');
    expect(compactRange(2_210_000, 2_990_000).unit).toBe('מיליון');
    expect(plain(compactRange(690_000, 930_000).value)).toBe('690–930');
    expect(compactRange(690_000, 930_000).unit).toBe('אלף');
    expect(plain(rangeText({ min: 850_000, max: 1_150_000 }))).toBe('₪0.85–1.15 מיליון');
    expect(plain(amountText(750_000))).toBe('₪750 אלף');
    expect(plain(perM2Text({ min: 11_100, max: 15_000 }))).toBe('₪11,100–15,000 למ״ר');
    expect(plain(monthsText([4, 5]))).toBe('4–5 חודשים');
    expect(monthsText([1, 1])).toBe('חודש');
  });

  it('isolates the digits so RTL text never reverses a range', () => {
    expect(rangeText({ min: 2_210_000, max: 2_990_000 }).startsWith(LRI)).toBe(true);
    const iso = isolateRanges('מס רכישה של 5%-6% ועוד 200-250 אלף, ₪700-800 ו-12,000–14,000');
    expect(iso.split(LRI).length - 1).toBe(4);
    expect(iso.split(PDI).length - 1).toBe(4);
    expect(plain(iso)).toBe('מס רכישה של 5%-6% ועוד 200-250 אלף, ₪700-800 ו-12,000–14,000');
    expect(isolateRanges(iso)).toBe(iso); // idempotent
    expect(isolateRanges('בלי מספרים')).toBe('בלי מספרים');
  });

  it('dates', () => {
    expect(shortDate('2026-07-16')).toBe('16.7.2026');
    expect(monthYear('2026-07-16')).toBe('יולי 2026');
    expect(asOfBadge('2026-07-16')).toBe('נכון ל-2026');
    expect(monthYearAfter(new Date(Date.UTC(2026, 9, 15)), 21)).toBe('יולי 2028');
  });
});

describe('bb.planner.last (PROGRAM.md §6 plannerEstimate)', () => {
  it('has exactly { totalMin, totalMax, at, inputs } in whole shekels, ex-VAT', () => {
    const e = estimateBudget({ ...base, extras: ['basement'] });
    const s = plannerSnapshot(e, new Date('2026-10-15T09:00:00Z'));
    expect(Object.keys(s).sort()).toEqual(['at', 'inputs', 'totalMax', 'totalMin']);
    expect(s).toMatchObject({ totalMin: e.total.min, totalMax: e.total.max, at: '2026-10-15T09:00:00.000Z' });
    expect(s.inputs).toEqual({
      sizeM2: 200,
      floors: 2,
      regionSlug: 'center',
      finishLevel: 'standard',
      extras: ['basement'],
      perM2Min: e.perM2.min,
      perM2Max: e.perM2.max,
      vat: 'excluded',
      priceBookAsOf: '2026-07-16',
      estimateId: e.estimateId,
    });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('"פה הכי קל לחרוג" warnings', () => {
  it('pins real moments in the two 2026 cost episodes', () => {
    for (const w of OVERRUN_WARNINGS) {
      expect(['X78Yo_sJgIM', 'vluNH7GTkU4']).toContain(w.moment.youtubeId);
      expect(w.moment.start).toBeGreaterThan(0);
      expect(w.moment.start).toBeLessThan(3600);
      expect(DEFAULT_PRICE_BOOK.sources.map((s) => s.id)).toContain(w.sourceId);
    }
    expect(momentHref({ youtubeId: 'X78Yo_sJgIM', start: 1523.6 })).toBe('/video/X78Yo_sJgIM/?t=1523');
    expect(momentClock(1523)).toBe('25:23');
    expect(momentClock(3725)).toBe('1:02:05');
  });

  it('shows exactly three, the relevant ones first', () => {
    const ids = (input: PlannerInput) => selectOverrunWarnings(input).map((w) => w.id);
    expect(ids(base)).toEqual(['fees', 'development', 'railings']);
    expect(ids({ ...base, extras: ['basement'] })).toEqual(['fees', 'basement', 'development']);
    expect(ids({ ...base, extras: ['basement', 'pool', 'vrf'] })).toEqual(['fees', 'basement', 'pool']);
    expect(ids({ ...base, extras: ['slope'] })).toEqual(['fees', 'railings', 'contractor_meter']);
    expect(ids({ ...base, finishLevel: 'luxury' })).toEqual(['fees', 'vrf', 'development']);
  });

  it('sizes the fees risk for the house', () => {
    const fees = OVERRUN_WARNINGS.find((w) => w.id === 'fees')!;
    expect(plain(fees.impact(estimateBudget(base)))).toContain('₪170 אלף בבית של 200 מ״ר');
  });
});

describe('share and report links', () => {
  it('builds the report and WhatsApp links from the answers', () => {
    const e = estimateBudget(base);
    expect(reportHref(base)).toBe('/calculator/report/?m2=200&floors=2&region=center&finish=standard');
    expect(shareUrl(base)).toMatch(/\/calculator\/\?m2=200&floors=2&region=center&finish=standard&utm_source=whatsapp&utm_medium=share&utm_campaign=planner$/);
    const text = plain(whatsappShareText(e));
    expect(text).toContain('₪2.21–2.99 מיליון לתכנון ובנייה, לפני מע״מ');
    expect(text).toContain('נכון ל-2026');
    expect(whatsappShareHref(e).startsWith('https://wa.me/?text=')).toBe(true);
  });
});

describe('what-if variants (scenario pages)', () => {
  it('changes one thing at a time', () => {
    const v = whatIfVariants(base);
    expect(v.map((x) => x.id)).toEqual(['one-floor', 'basement', 'high']);
    for (const x of v) {
      const changed = (Object.keys(base) as Array<keyof PlannerInput>).filter((k) => JSON.stringify(base[k]) !== JSON.stringify(x.input[k]));
      expect(changed).toHaveLength(1);
    }
    expect(whatIfVariants({ ...base, floors: 1, extras: ['basement'], finishLevel: 'luxury' }).map((x) => x.id)).toEqual([
      'two-floors',
      'no-basement',
      'standard',
    ]);
  });
});
