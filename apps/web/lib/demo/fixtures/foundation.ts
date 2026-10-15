/**
 * Reference fixture for /platform/demo/foundation/: a small "owner snapshot"
 * that exercises every part of the generator. Copy this file's shape for your
 * squad's fixture (see docs/platform/FOUNDATION.md#demo-views).
 */
import { changePercent } from '../format';
import { seriesTotal } from '../generator';
import { defineDemoFixture } from './define';

export const foundationDemo = defineDemoFixture('foundation', ({ gen }) => {
  // Each section forks its own stream: editing one never shifts another.
  const visitors = gen.fork('visitors').timeSeries({ days: 56, base: 380, weeklyGrowth: 0.035, noise: 0.08 });
  const leadsDaily = gen.fork('leads-daily').timeSeries({ days: 56, base: 7, weeklyGrowth: 0.05, noise: 0.3 });
  const recentLeads = gen.fork('recent-leads').leads(6, { withinMinutes: 36 * 60 });
  const questions = gen.fork('questions').questions(6);

  // Where last month's leads came from, by region (a bigger sample, counted).
  const regionCounts = new Map<string, { name: string; leads: number }>();
  for (const lead of gen.fork('region-mix').leads(180, { withinMinutes: 28 * 24 * 60 })) {
    const row = regionCounts.get(lead.place.regionSlug) ?? { name: lead.place.regionName, leads: 0 };
    row.leads += 1;
    regionCounts.set(lead.place.regionSlug, row);
  }
  const byRegion = Array.from(regionCounts, ([slug, row]) => ({ slug, ...row }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 6);

  const visitors28 = seriesTotal(visitors, 28);
  const visitorsPrev28 = seriesTotal(visitors.slice(0, 28));
  const leads28 = seriesTotal(leadsDaily, 28);
  const leadsPrev28 = seriesTotal(leadsDaily.slice(0, 28));
  const conversion = visitors28 > 0 ? (leads28 / visitors28) * 100 : 0;
  const conversionPrev = visitorsPrev28 > 0 ? (leadsPrev28 / visitorsPrev28) * 100 : 0;

  return {
    kpis: {
      visitors: { value: visitors28, change: changePercent(visitors28, visitorsPrev28) },
      leads: { value: leads28, change: changePercent(leads28, leadsPrev28) },
      conversion: { value: Math.round(conversion * 100) / 100, change: changePercent(conversion, conversionPrev) },
      answered: {
        value: Math.round((questions.filter((q) => q.answered).length / Math.max(1, questions.length)) * 100),
        change: 0,
      },
    },
    visitors,
    recentLeads,
    questions,
    byRegion,
  };
});

export type FoundationDemoData = ReturnType<typeof foundationDemo.build>;
