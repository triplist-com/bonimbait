import { describe, expect, it } from 'vitest';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { DEMO_FIXTURES } from '@/lib/demo/fixtures';
import { DEMO_TIERS, revenueDemo } from '@/lib/demo/fixtures/revenue';
import { DEMO_VIEWS } from '@/lib/demo/views';
import { createDemoGenerator } from '@/lib/demo/generator';
import { budgetMidpoint } from '@/lib/project-file/format';

const TODAY = '2026-10-15';

describe('revenue demo fixtures', () => {
  const data = loadDemoFixture(revenueDemo, { today: TODAY });

  it('puts the promised top lead first in Tzuri\'s queue, scored by the real scorer', () => {
    const top = data.queue.queue[0];
    expect(top.score).toMatchObject({ score: 82, band: 'hot' });
    expect(top.file).toMatchObject({ stage: 'permit', regionSlug: 'sharon', sizeM2: 220 });
    expect(budgetMidpoint(top.file.budgetRangeNis)).toBe(2_600_000);
    expect(top.file.questions).toHaveLength(4);
    expect(top.score?.reasons.find((r) => r.code === 'pro_questions')?.label).toBe('4 שאלות על אלומיניום');
    // Everyone else scores lower, and every tab is sorted by score.
    for (const list of Object.values(data.queue)) {
      const scores = list.map((l) => l.score?.score ?? -1);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    }
    expect(data.queue.queue.slice(1).every((l) => (l.score?.score ?? 0) < 82)).toBe(true);
  });

  it('tells the "חלונות הגליל" story: 3,940 -> 112 -> 37 -> 9 deals, x6', () => {
    const r = data.partner.report;
    const step = (key: string) => r.funnel.find((s) => s.key === key)?.value;
    expect([step('exposures'), step('askers'), step('quotes'), step('deals')]).toEqual([3940, 112, 37, 9]);
    expect(r.roi.multiple).toBe(6);
    expect(r.partner.name).toBe('חלונות הגליל');
    expect(data.partner.leads.filter((l) => l.deal)).toHaveLength(5);
    // Last month's report lists last month's leads, newest first.
    expect(r.month).toBe('2026-09');
    expect(data.partner.leads.every((l) => l.createdAt.slice(0, 7) === r.month)).toBe(true);
    const times = data.partner.leads.map((l) => Date.parse(l.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('gives the shell contractor a believable portal', () => {
    const pro = data.pro;
    expect(pro.business.specialty).toBe('קבלני שלד');
    expect(pro.kpis.views.value).toBe(pro.views.reduce((s, p) => s + p.value, 0));
    expect(pro.kpis.views.pct).toBeGreaterThan(0);
    expect(pro.completeness.score).toBeLessThan(100);
    expect(pro.completeness.next).not.toBeNull();
    expect(pro.tiers).toEqual(DEMO_TIERS);
    expect(pro.subscription?.tierSlug).toBe('members');
  });

  it('is deterministic for a seed and a day', () => {
    const fresh = () => revenueDemo.build({ gen: createDemoGenerator(revenueDemo.seed, { today: TODAY }), today: TODAY, seed: revenueDemo.seed });
    expect(fresh()).toEqual(fresh());
    expect(fresh()).toEqual(data);
  });
});

describe('registration', () => {
  it('registers the fixture and three ready views', () => {
    expect(DEMO_FIXTURES.revenue).toBe(revenueDemo);
    const views = DEMO_VIEWS.filter((v) => v.squad === 'revenue');
    expect(views.map((v) => [v.slug, v.status])).toEqual([
      ['consult-queue', 'ready'],
      ['partner', 'ready'],
      ['pro', 'ready'],
    ]);
    const data = loadDemoFixture(revenueDemo, { today: TODAY });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(loadDemoFixture(revenueDemo, { today: TODAY })).toBe(data);
  });
});
