import { describe, expect, it } from 'vitest';
import { REGIONS } from '@/lib/constants/community';
import { CITIES_BY_REGION } from '@/lib/demo/data';
import { DEMO_FIXTURES } from '@/lib/demo/fixtures';
import { defineDemoFixture, loadDemoFixture } from '@/lib/demo/fixtures/define';
import { foundationDemo } from '@/lib/demo/fixtures/foundation';
import { agoHe, changePercent } from '@/lib/demo/format';
import { addDays, createDemoGenerator, demoToday, seriesTotal, weekdayOf } from '@/lib/demo/generator';
import { createRandom, hashSeed, mulberry32 } from '@/lib/demo/random';
import { DEMO_VIEWS, demoViewHref } from '@/lib/demo/views';

const TODAY = '2026-10-14'; // a Wednesday

describe('seeded randomness', () => {
  it('is a pure function of the seed (pinned values: changing them changes every demo)', () => {
    expect(hashSeed('bonimbait')).toMatchInlineSnapshot(`689711822`);
    const next = mulberry32(42);
    expect([next(), next(), next()].map((v) => v.toFixed(6))).toMatchInlineSnapshot(`
      [
        "0.601104",
        "0.448291",
        "0.852466",
      ]
    `);
    const r = createRandom('pinned');
    expect([r.int(1, 100), r.pick(['א', 'ב', 'ג']), r.uuid()]).toMatchInlineSnapshot(`
      [
        91,
        "ג",
        "f6a8de2c-b85b-466f-a476-457218bab5b9",
      ]
    `);
  });

  it('repeats exactly for the same seed and differs for another', () => {
    const a = createRandom('x');
    const b = createRandom('x');
    const c = createRandom('y');
    const draw = (r: ReturnType<typeof createRandom>) => Array.from({ length: 20 }, () => r.next());
    const da = draw(a);
    expect(draw(b)).toEqual(da);
    expect(draw(c)).not.toEqual(da);
  });

  it('forks are independent of how much the parent consumed', () => {
    const a = createRandom('root');
    const b = createRandom('root');
    for (let i = 0; i < 50; i++) b.next();
    expect(a.fork('leads').next()).toBe(b.fork('leads').next());
  });

  it('produces valid v4-shaped uuids and in-range ints', () => {
    const r = createRandom('shape');
    for (let i = 0; i < 200; i++) {
      expect(r.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});

describe('demo generator', () => {
  it('is stable: same seed and day give identical data (pinned sample)', () => {
    const a = createDemoGenerator('stable', { today: TODAY });
    const b = createDemoGenerator('stable', { today: TODAY });
    expect(a.leads(5)).toEqual(b.leads(5));
    expect(a.timeSeries({ days: 14, base: 100, weeklyGrowth: 0.05 })).toEqual(b.timeSeries({ days: 14, base: 100, weeklyGrowth: 0.05 }));

    const g = createDemoGenerator('pinned', { today: TODAY });
    const p = g.person();
    expect({ name: p.fullName, phone: p.phone, email: p.email }).toMatchInlineSnapshot(`
      {
        "email": "builder2764@example.com",
        "name": "משה כהן",
        "phone": "054-•••-0356",
      }
    `);
    expect(g.place()).toMatchInlineSnapshot(`
      {
        "city": "כפר סבא",
        "regionName": "אזור השרון",
        "regionSlug": "sharon",
      }
    `);
    expect(g.business('aluminium').name).toMatchInlineSnapshot(`"וקנין אלומיניום"`);
    expect(g.timeSeries({ days: 7, base: 100 }).map((x) => x.value)).toMatchInlineSnapshot(`
      [
        99,
        76,
        66,
        114,
        112,
        89,
        91,
      ]
    `);
  });

  it('keys streams by call kind: adding draws elsewhere never shifts a value', () => {
    const plain = createDemoGenerator('kinds', { today: TODAY });
    const busy = createDemoGenerator('kinds', { today: TODAY });
    busy.leads(10);
    busy.questions(5);
    busy.timeSeries({ days: 30, base: 5 });
    expect(busy.person()).toEqual(plain.person());
  });

  it('maps every town to one of the 13 member regions', () => {
    const memberSlugs = new Set(REGIONS.filter((r) => !r.isNationwide).map((r) => r.slug));
    expect(new Set(Object.keys(CITIES_BY_REGION))).toEqual(memberSlugs);
    const g = createDemoGenerator('places', { today: TODAY });
    for (let i = 0; i < 100; i++) {
      const place = g.place();
      expect(memberSlugs.has(place.regionSlug)).toBe(true);
      expect(CITIES_BY_REGION[place.regionSlug]).toContain(place.city);
      expect(place.regionName).toBe(REGIONS.find((r) => r.slug === place.regionSlug)!.name);
    }
    expect(g.place('golan').regionSlug).toBe('golan');
  });

  it('generates plausible, privacy-safe leads', () => {
    const leads = createDemoGenerator('leads', { today: TODAY }).leads(50, { withinMinutes: 2 * 24 * 60 });
    expect(leads.map((l) => l.minutesAgo)).toEqual([...leads.map((l) => l.minutesAgo)].sort((a, b) => a - b));
    for (const l of leads) {
      expect(l.person.phone).toMatch(/^05\d-•••-\d{4}$/); // masked: never a dialable number
      expect(l.person.email).toMatch(/@example\.com$/);
      expect(l.ref).toMatch(/^BB-26-\d{6}$/);
      expect(l.score).toBeGreaterThanOrEqual(35);
      expect(l.score).toBeLessThanOrEqual(98);
      expect(l.minutesAgo).toBeLessThanOrEqual(2 * 24 * 60);
      expect(l.sizeSqm % 10).toBe(0);
    }
  });

  it('time series have weekly seasonality (quiet Fri/Sat) and growth', () => {
    const series = createDemoGenerator('season', { today: TODAY }).timeSeries({ days: 84, base: 500, weeklyGrowth: 0.04, noise: 0.05 });
    expect(series).toHaveLength(84);
    expect(series.at(-1)!.date).toBe(TODAY);
    expect(series[0].date).toBe(addDays(TODAY, -83));
    const avg = (days: number[]) => {
      const vals = series.filter((p) => days.includes(weekdayOf(p.date))).map((p) => p.value);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    expect(avg([5, 6])).toBeLessThan(avg([0, 1, 2]) * 0.8); // weekend dip
    expect(seriesTotal(series, 28)).toBeGreaterThan(seriesTotal(series.slice(0, 28)) * 1.25); // ~4%/week compounding
    for (const p of series) expect(Number.isInteger(p.value)).toBe(true);
  });

  it('questions are distinct and ordered by how often they are asked', () => {
    const qs = createDemoGenerator('q', { today: TODAY }).questions(8);
    expect(new Set(qs.map((q) => q.text)).size).toBe(8);
    for (let i = 1; i < qs.length; i++) expect(qs[i].asks).toBeLessThanOrEqual(qs[i - 1].asks * 1.25);
    for (const q of qs) expect(q.answered).toBe(q.confidence >= 0.5);
  });

  it('dates: Israel day, UTC-safe arithmetic, Sunday-first weekdays', () => {
    expect(demoToday(new Date('2026-10-14T22:30:00Z'))).toBe('2026-10-15'); // already the 15th in Israel
    expect(addDays('2026-03-27', 3)).toBe('2026-03-30'); // across the DST change
    expect(weekdayOf('2026-10-14')).toBe(3);
    expect(() => createDemoGenerator('x', { today: '14/10/2026' })).toThrow();
  });
});

describe('fixtures and the view registry', () => {
  it('loads fixtures deterministically and memoizes per day', () => {
    const a = loadDemoFixture(foundationDemo, { today: TODAY });
    expect(loadDemoFixture(foundationDemo, { today: TODAY })).toBe(a);
    const fresh = foundationDemo.build({ gen: createDemoGenerator(foundationDemo.seed, { today: TODAY }), today: TODAY, seed: foundationDemo.seed });
    expect(fresh).toEqual(a);
    expect(a.visitors).toHaveLength(56);
    expect(a.byRegion.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a); // plain JSON: safe for Client Components
  });

  it('keeps fixtures of the same squad apart', () => {
    const one = defineDemoFixture('hub', ({ gen }) => gen.person().fullName);
    const two = defineDemoFixture('hub', ({ gen }) => gen.region().slug);
    expect(typeof loadDemoFixture(one, { today: TODAY })).toBe('string');
    expect(REGIONS.some((r) => r.slug === loadDemoFixture(two, { today: TODAY }))).toBe(true);
  });

  it('registers every fixture and demo view once', () => {
    expect(DEMO_FIXTURES.foundation).toBe(foundationDemo);
    const slugs = DEMO_VIEWS.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const v of DEMO_VIEWS) expect(demoViewHref(v)).toMatch(/^\/platform\/demo\/[a-z-]+\/$/);
    expect(DEMO_VIEWS.find((v) => v.slug === 'foundation')?.status).toBe('ready');
  });

  it('formats Hebrew relative times and changes', () => {
    expect(agoHe(0)).toBe('ממש עכשיו');
    expect(agoHe(1)).toBe('לפני דקה');
    expect(agoHe(45)).toBe('לפני 45 דקות');
    expect(agoHe(125)).toBe('לפני שעתיים');
    expect(agoHe(60 * 30)).toBe('אתמול');
    expect(agoHe(60 * 24 * 3)).toBe('לפני 3 ימים');
    expect(changePercent(120, 100)).toBe(20);
    expect(changePercent(5, 0)).toBe(100);
  });
});
