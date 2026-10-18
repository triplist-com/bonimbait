import { describe, expect, it } from 'vitest';
import { buildCommandCenter } from '@/lib/command/build';
import { buildLeadsAnalytics } from '@/lib/command/analytics';
import { commandDemo, commandDemoInputs, DEMO_DAYS, DEMO_PARTNERS } from '@/lib/demo/fixtures/command';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { createDemoGenerator } from '@/lib/demo/generator';
import { DEMO_FIXTURES } from '@/lib/demo/fixtures';
import { DEMO_VIEWS } from '@/lib/demo/views';

const TODAY = '2026-10-15';

function fresh() {
  return commandDemo.build({ gen: createDemoGenerator(commandDemo.seed, { today: TODAY }), today: TODAY, seed: commandDemo.seed });
}

describe('command demo fixture', () => {
  const data = loadDemoFixture(commandDemo, { today: TODAY });
  const d30 = buildCommandCenter(commandDemoInputs(data, 30), { isDemo: true, leadHref: () => null });

  it('is deterministic: the same day builds the same data', () => {
    expect(JSON.stringify(fresh())).toBe(JSON.stringify(data));
    expect(loadDemoFixture(commandDemo, { today: TODAY })).toBe(data); // memoized
    // A later day keeps the past: yesterday's leads are unchanged when today moves on.
    const next = loadDemoFixture(commandDemo, { today: '2026-10-16' });
    const sameDay = (l: { createdAt: string }) => l.createdAt.startsWith('2026-10-10');
    expect(next.leads.filter(sameDay).map((l) => l.id)).toEqual(data.leads.filter(sameDay).map((l) => l.id));
  }, 30_000); // builds two full 180-day fixtures; slow under a busy CPU

  it('covers 180 days so a 90-day view has a full previous period', () => {
    expect(data.days).toHaveLength(DEMO_DAYS);
    expect(data.days[data.days.length - 1]).toBe(TODAY);
    expect(new Set(data.leads.map((l) => l.ref)).size).toBe(data.leads.length);
    expect(data.leads.every((l) => /^BB-26-\d{6}$/.test(l.ref))).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/@|05\d-•••/); // no contact details in the fixture's raw leads
  });

  it('tells the owner story on the default 30-day view', () => {
    // Pipeline around ₪1.4M.
    expect(d30.pipeline.openAgorot).toBeGreaterThan(130_000_000);
    expect(d30.pipeline.openAgorot).toBeLessThan(150_000_000);
    // 46 questions this month without a good answer, led by the floating-floor and sloped-basement topics.
    expect(d30.unanswered.totalAsks).toBe(46);
    expect(d30.unanswered.items.slice(0, 2).map((i) => i.label)).toEqual(['רצפה צפה: עלות ובידוד', 'מרתף בשטח משופע']);
    // Leads with refs and scores; hot leads first.
    expect(d30.hotLeads).toHaveLength(8);
    expect(d30.hotLeads[0].score).toBeGreaterThanOrEqual(85);
    expect(d30.topLeads.usesScores).toBe(true);
    // AI cost capped and visible: today under the cap, a spike day 41 days ago hit it.
    expect(d30.ai.capStatus).toBe('ok');
    expect(d30.ai.budgetUsd).toBe(3);
    expect(buildCommandCenter(commandDemoInputs(data, 90)).ai.daysAtCap).toBe(1);
    // Six fictional partners at different paces.
    expect(d30.partners.rows).toHaveLength(DEMO_PARTNERS.length);
    expect(d30.partners.atRisk).toBeGreaterThanOrEqual(1);
    expect(d30.partners.behind).toBeGreaterThanOrEqual(1);
    expect(d30.partners.rows.find((r) => r.name === 'חלונות הגליל')?.status).toBe('on_track');
    expect(d30.consults.booked.current).toBeGreaterThan(100);
    expect(d30.sparse).toBe(false);
  });

  it('feeds the leads analytics and every period', () => {
    for (const days of [7, 30, 90] as const) {
      const view = buildCommandCenter(commandDemoInputs(data, days));
      expect(view.period.days).toBe(days);
      expect(view.leads.daily).toHaveLength(days);
      expect(view.leads.total.pct).not.toBeNull();
    }
    const inputs = commandDemoInputs(data, 30);
    const analytics = buildLeadsAnalytics({ now: inputs.now, periodDays: 30, leads: inputs.leads, expectedValues: inputs.expectedValues, regionNames: inputs.regionNames });
    expect(analytics.speed.measured).toBeGreaterThan(100);
    expect(analytics.speed.medianMinutes).toBeGreaterThan(30);
    expect(analytics.byStage.filter((s) => s.count > 0).length).toBeGreaterThanOrEqual(5);
    expect(analytics.bySource[0].count).toBeGreaterThan(0);
  });

  it('is registered and its view is ready', () => {
    expect(DEMO_FIXTURES.command).toBe(commandDemo);
    expect(DEMO_VIEWS.find((v) => v.slug === 'command')).toMatchObject({ status: 'ready', title: 'חדר הבקרה' });
  });

  it('reports its headline numbers', () => {
    // Printed for the report and for tuning; the assertions above are the contract.
    console.log(
      JSON.stringify({
        leads30: d30.leads.total.current,
        openPipelineNis: Math.round(d30.pipeline.openAgorot / 100),
        createdNis: Math.round(d30.pipeline.createdAgorot / 100),
        consults: d30.consults.booked.current,
        hot: d30.topLeads.hotCount.current,
        aiToday: d30.ai.spentTodayUsd,
        aiPeriod: d30.ai.cost.current,
        partners: d30.partners.rows.map((r) => `${r.name}:${r.status}:${r.leads}`),
      }),
    );
  });
});
