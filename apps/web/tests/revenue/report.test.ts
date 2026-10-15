import { describe, expect, it } from 'vitest';
import { EMPTY_METRICS } from '@/lib/revenue/portal';
import { buildPartnerReport, monthLabel, nextMonth, partnerHealthStatus, previousMonth } from '@/lib/revenue/report';
import type { BusinessMetrics } from '@/lib/revenue/types';

const partner = { id: 'p1', name: 'חלונות הגליל', topicTitle: 'חלונות ואלומיניום', tierName: 'שגרירים', monthlyCostAgorot: 299_000 };
const metrics = (over: Partial<BusinessMetrics>): BusinessMetrics => ({ ...EMPTY_METRICS, daily: [], ...over });

describe('buildPartnerReport', () => {
  const m = metrics({ impressions: 3940, reach: 2610, clicks: 156, category_askers: 112, quote_requests: 37, leads: 41, assisted_leads: 6 });

  it('walks the funnel from exposures to deals with step rates', () => {
    const r = buildPartnerReport({ month: '2026-09', partner, metrics: m, deals: Array.from({ length: 9 }, () => ({ valueAgorot: 2_000_000 })) });
    expect(r.funnel.map((s) => [s.key, s.value])).toEqual([
      ['exposures', 3940],
      ['clicks', 156],
      ['askers', 112],
      ['quotes', 37],
      ['leads', 41],
      ['deals', 9],
    ]);
    expect(r.funnel[0].rate).toBeNull();
    expect(r.funnel[3].rate).toBeCloseTo(37 / 112);
    expect(r.funnel[2].label).toBe('בונים ששאלו על חלונות ואלומיניום');
    expect(r.monthLabel).toBe('ספטמבר 2026');
  });

  it('estimates ROI as 10% gross margin on reported deals over the monthly cost: x6 for the demo', () => {
    const r = buildPartnerReport({ month: '2026-09', partner, metrics: m, deals: Array.from({ length: 9 }, () => ({ valueAgorot: 2_000_000 })) });
    expect(r.deals).toEqual({ count: 9, withValue: 9, reportedAgorot: 18_000_000, estimatedAgorot: 18_000_000 });
    expect(r.roi).toEqual({ marginAgorot: 1_800_000, costAgorot: 299_000, multiple: 6, marginRate: 0.1, missing: null });
    expect(r.highlights.at(-1)).toBe('כל שקל ששילמתם החזיר בערך 6 שקלים ברווח גולמי.');
  });

  it('fills deals without a value with the month average, and explains a missing ROI', () => {
    const mixed = buildPartnerReport({ month: '2026-09', partner, metrics: m, deals: [{ valueAgorot: 3_000_000 }, { valueAgorot: null }] });
    expect(mixed.deals.estimatedAgorot).toBe(6_000_000);
    expect(mixed.roi.multiple).toBe(2);
    expect(buildPartnerReport({ month: '2026-09', partner, metrics: m, deals: [{ valueAgorot: null }] }).roi).toMatchObject({
      multiple: null,
      missing: 'סמנו סכום לעסקאות כדי לחשב את ההחזר.',
    });
    expect(buildPartnerReport({ month: '2026-09', partner, metrics: m, deals: [] }).roi.missing).toBe('עוד לא דווחו עסקאות החודש.');
    expect(buildPartnerReport({ month: '2026-09', partner: { ...partner, monthlyCostAgorot: null }, metrics: m, deals: [{ valueAgorot: 1 }] }).roi.missing).toBe(
      'העסק לא במסלול שותפות בתשלום החודש.',
    );
  });

  it('compares with the previous month', () => {
    const r = buildPartnerReport({
      month: '2026-09',
      partner,
      metrics: m,
      previous: metrics({ impressions: 3000, leads: 41, deals: 6 }),
      deals: Array.from({ length: 9 }, () => ({ valueAgorot: null })),
    });
    expect(r.change).toEqual({ exposures: 31, leads: 0, deals: 50 });
    expect(buildPartnerReport({ month: '2026-09', partner, metrics: m, deals: [] }).change.exposures).toBeNull();
  });
});

describe('months', () => {
  it('steps across year boundaries', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(nextMonth('2026-09')).toBe('2026-10');
    expect(monthLabel('2027-02')).toBe('פברואר 2027');
  });
});

describe('partnerHealthStatus', () => {
  it('judges by ROI once deals are in, else by pace and leads', () => {
    expect(partnerHealthStatus({ onTier: false, roiMultiple: 9, leads: 9, pace: 2 })).toBe('no_tier');
    expect(partnerHealthStatus({ onTier: true, roiMultiple: 3, leads: 0, pace: 0 })).toBe('healthy');
    expect(partnerHealthStatus({ onTier: true, roiMultiple: 1.4, leads: 5, pace: 1 })).toBe('watch');
    expect(partnerHealthStatus({ onTier: true, roiMultiple: 0.5, leads: 5, pace: 1 })).toBe('at_risk');
    expect(partnerHealthStatus({ onTier: true, roiMultiple: null, leads: 0, pace: 0.3 })).toBe('at_risk');
    expect(partnerHealthStatus({ onTier: true, roiMultiple: null, leads: 4, pace: 1.1 })).toBe('healthy');
    expect(partnerHealthStatus({ onTier: true, roiMultiple: null, leads: 2, pace: 0.7 })).toBe('watch');
  });
});
