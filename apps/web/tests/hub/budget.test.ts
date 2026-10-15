import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_CATEGORIES,
  budgetGap,
  plannedFromEstimate,
  stageBudgetShare,
  summarizeBudget,
  varianceStatus,
} from '@/lib/hub/budget';
import type { HubBudgetItemView } from '@/lib/hub/types';
import { STAGE_IDS } from '@/lib/hub/types';

const CORE_SQL = readFileSync(
  fileURLToPath(new URL('../../../../supabase/migrations/20261014121000_hub_core.sql', import.meta.url)),
  'utf8',
);

type Item = Pick<HubBudgetItemView, 'kind' | 'category' | 'amount' | 'status'>;
const quote = (category: string, amount: number, status: Item['status'] = 'open'): Item => ({ kind: 'quote', category, amount, status });
const paid = (category: string, amount: number): Item => ({ kind: 'actual', category, amount, status: 'paid' });

describe('budget categories', () => {
  it('splits 100% of a planning-plus-build budget', () => {
    expect(BUDGET_CATEGORIES.reduce((s, c) => s + c.share, 0)).toBe(100);
  });

  it('puts the shell at about a third, as the owner says', () => {
    expect(stageBudgetShare('frame')).toBe(31);
    expect(stageBudgetShare('purchase')).toBe(0); // land is never part of the build budget
    expect(STAGE_IDS.reduce((s, id) => s + stageBudgetShare(id), 0)).toBe(100);
  });

  it('matches the hub_budget_items.category CHECK constraint', () => {
    const check = /category\s+text not null check \(category in \(([^)]+)\)\)/.exec(CORE_SQL.replace(/\s+/g, ' '));
    expect(check).not.toBeNull();
    const sqlIds = check![1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(sqlIds).toEqual(BUDGET_CATEGORIES.map((c) => c.id));
  });

  it('plans each category from the estimate midpoint, rounded to 1,000', () => {
    const planned = plannedFromEstimate(2_400_000, 2_800_000);
    expect(planned.frame).toBe(806_000);
    expect(planned.design).toBe(182_000);
    expect(planned.other).toBe(0);
    expect(Object.values(planned).every((v) => v % 1000 === 0)).toBe(true);
  });
});

describe('summarizeBudget', () => {
  const planned = plannedFromEstimate(2_400_000, 2_800_000);

  it('has no variance before any quote or payment', () => {
    const s = summarizeBudget(planned, []);
    expect(s.hasData).toBe(false);
    expect(s.variance).toBe(0);
    expect(s.forecast).toBe(s.planned);
    expect(s.categories.every((c) => c.status === 'none' && c.forecastBasis === 'plan')).toBe(true);
  });

  it('forecasts from the lowest open quote while tendering', () => {
    const s = summarizeBudget(planned, [quote('frame', 845_000), quote('frame', 780_000), quote('frame', 910_000)]);
    const frame = s.categories.find((c) => c.id === 'frame')!;
    expect(frame.openQuotes).toBe(3);
    expect(frame.lowestOpenQuote).toBe(780_000);
    expect(frame.forecast).toBe(780_000);
    expect(frame.forecastBasis).toBe('quote');
    expect(frame.variance).toBe(780_000 - 806_000);
    expect(frame.status).toBe('under');
    expect(s.openQuotes).toBe(3);
  });

  it('prefers the accepted quote, and payments once they pass it', () => {
    const accepted = summarizeBudget(planned, [quote('frame', 780_000, 'rejected'), quote('frame', 845_000, 'accepted'), paid('frame', 200_000)]);
    const a = accepted.categories.find((c) => c.id === 'frame')!;
    expect(a.forecast).toBe(845_000);
    expect(a.forecastBasis).toBe('committed');
    expect(a.status).toBe('over');

    const extras = summarizeBudget(planned, [quote('frame', 845_000, 'accepted'), paid('frame', 900_000)]);
    const e = extras.categories.find((c) => c.id === 'frame')!;
    expect(e.forecast).toBe(900_000);
    expect(e.forecastBasis).toBe('actual');
    expect(e.variance).toBe(94_000);
  });

  it('keeps the plan while payments are in progress, and flags them once they pass it', () => {
    const inProgress = summarizeBudget(planned, [paid('design', 95_000)]).categories.find((c) => c.id === 'design')!;
    expect(inProgress.forecast).toBe(planned.design);
    expect(inProgress.forecastBasis).toBe('actual');
    expect(inProgress.variance).toBe(0);
    expect(inProgress.status).toBe('on');
    const beyond = summarizeBudget(planned, [paid('fees', 151_800)]).categories.find((c) => c.id === 'fees')!;
    expect(beyond.forecast).toBe(151_800);
    expect(beyond.variance).toBe(151_800 - planned.fees);
    expect(beyond.status).toBe('over');
  });

  it('rolls categories up by stage and totals', () => {
    const s = summarizeBudget(planned, [paid('design', 95_000), paid('fees', 160_000), quote('frame', 780_000)]);
    const permit = s.byStage.find((r) => r.stage === 'permit')!;
    expect(permit.actual).toBe(160_000);
    expect(permit.variance).toBe(160_000 - planned.fees);
    expect(s.byStage.find((r) => r.stage === 'planning')!.variance).toBe(0);
    expect(s.actual).toBe(255_000);
    expect(s.paidShare).toBeCloseTo(255_000 / s.planned, 6);
    expect(s.hasData).toBe(true);
    // "other" has no plan: any payment there is a real overrun.
    const other = summarizeBudget(planned, [paid('other', 12_000)]).categories.find((c) => c.id === 'other')!;
    expect(other.variance).toBe(12_000);
    expect(other.status).toBe('over');
  });

  it('treats small differences as on budget', () => {
    expect(varianceStatus(10_000, 806_000, true)).toBe('on');
    expect(varianceStatus(-30_000, 806_000, true)).toBe('under');
    expect(varianceStatus(30_000, 806_000, true)).toBe('over');
    expect(varianceStatus(500, 0, true)).toBe('on');
    expect(varianceStatus(50_000, 806_000, false)).toBe('none');
  });
});

describe('budgetGap', () => {
  const estimate = { totalMin: 2_500_000, totalMax: 2_900_000 };
  it('flags a budget below the estimate (a consult moment)', () => {
    expect(budgetGap([1_500_000, 2_000_000], estimate)).toEqual({ kind: 'below', amount: 500_000 });
  });
  it('is within when the ranges meet', () => {
    expect(budgetGap([2_400_000, 2_800_000], estimate)).toEqual({ kind: 'within', amount: 0 });
  });
  it('notes room above the estimate', () => {
    expect(budgetGap([3_000_000, 4_000_000], estimate)).toEqual({ kind: 'above', amount: 100_000 });
  });
  it('needs both sides', () => {
    expect(budgetGap(null, estimate)).toBeNull();
    expect(budgetGap([1, 2], null)).toBeNull();
  });
});
