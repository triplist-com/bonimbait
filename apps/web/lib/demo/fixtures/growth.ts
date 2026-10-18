/**
 * Growth demo (/platform/demo/growth/): the budget planner from both sides.
 * The builder is the tour's fictional family ("משפחת לוי": 220 m² in the Sharon,
 * at the permit stage, a ₪2.6M budget, the same family as the hub and consult
 * queue demos); the owner sees 8 weeks of planner use and the latest estimates.
 * Estimates run through the real engine on the seeded price book.
 */
import { defineDemoFixture } from './define';
import { seriesTotal } from '../generator';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { estimateBudget } from '@/lib/planner/engine';
import type { ExtraId, FinishLevelId, Floors, PlannerInput } from '@/lib/planner/types';

export const growthDemo = defineDemoFixture('growth', ({ gen, today }) => {
  const family = {
    name: 'משפחת לוי',
    input: { sizeM2: 220, floors: 2, regionSlug: 'sharon', finishLevel: 'standard', extras: [] } satisfies PlannerInput,
    // The budget they set in the hub onboarding (bb.hub.draft).
    budgetRangeNis: [2_400_000, 2_800_000] as [number, number],
    stage: 'permit' as const,
  };

  // 8 weeks: planner starts grow ~4%/week; about two thirds reach the result.
  const started = gen.fork('started').timeSeries({ days: 56, base: 38, weeklyGrowth: 0.04, noise: 0.12 });
  const rate = gen.fork('rate');
  const completed = started.map((p) => ({ date: p.date, value: Math.round(p.value * rate.rng.float(0.62, 0.72)) }));
  const consults = completed.map((p) => ({ date: p.date, value: Math.round(p.value * rate.rng.float(0.13, 0.2)) }));
  const saved = completed.map((p) => ({ date: p.date, value: Math.round(p.value * rate.rng.float(0.2, 0.3)) }));
  const last = (s: typeof started) => seriesTotal(s, 28);
  const prev = (s: typeof started) => seriesTotal(s.slice(0, -28), 28);

  const r = gen.fork('recent');
  const recent = Array.from({ length: 6 }, (_, i) => {
    const place = r.place();
    const input: PlannerInput = {
      sizeM2: r.rng.pick([160, 180, 200, 210, 220, 240, 260, 300]),
      floors: r.rng.weighted<Floors>([[1, 2], [2, 6], [3, 1]]),
      regionSlug: place.regionSlug,
      finishLevel: r.rng.weighted<FinishLevelId>([['basic', 1], ['standard', 5], ['high', 2], ['luxury', 1]]),
      extras: r.rng.bool(0.3) ? (['basement'] as ExtraId[]) : r.rng.bool(0.2) ? (['pool'] as ExtraId[]) : [],
    };
    const e = estimateBudget(input, DEFAULT_PRICE_BOOK);
    return {
      id: e.estimateId,
      city: place.city,
      regionName: place.regionName,
      input,
      totalMin: e.total.min,
      totalMax: e.total.max,
      minutesAgo: 9 + i * 70 + r.rng.int(0, 40),
      consult: r.rng.bool(0.3),
    };
  });

  return {
    today,
    family,
    series: { started: started.slice(-28), completed: completed.slice(-28) },
    kpis: {
      started: { value: last(started), previous: prev(started) },
      completed: { value: last(completed), previous: prev(completed) },
      consults: { value: last(consults), previous: prev(consults) },
      saved: { value: last(saved), previous: prev(saved) },
    },
    recent,
  };
});
