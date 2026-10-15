import { describe, expect, it } from 'vitest';
import { summarizeBudget } from '@/lib/hub/budget';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { estimateFromProfile } from '@/lib/planner/engine';
import {
  budgetHealth,
  currentVersion,
  diffPlans,
  formatPct,
  isApprovedVersion,
  normalizePlan,
  planTotal,
  plannedFromStageRows,
  projectBudget,
  stageVariance,
  versionHistory,
} from '@/lib/bonimos/budget';
import type { BudgetVersionPlan } from '@/lib/bonimos/types';

function version(no: number, planned: BudgetVersionPlan['planned'], over: Partial<BudgetVersionPlan> = {}): BudgetVersionPlan {
  const total = planTotal(planned);
  return {
    id: `v${no}`,
    versionNo: no,
    label: no === 1 ? 'הערכה ראשונית' : 'תקציב מאושר',
    basis: no === 1 ? 'planner' : 'manual',
    note: null,
    createdAt: `2026-0${no}-01T09:00:00.000Z`,
    createdBy: 'manager-1',
    isCurrent: false,
    totalMin: total,
    totalMax: total,
    planned,
    ...over,
  };
}

describe('budget version diffs (the change log)', () => {
  const v1 = { design: 150_000, fees: 95_000, frame: 725_000, systems: 240_000, windows: 190_000 };
  const v2 = { design: 150_000, fees: 112_000, frame: 768_000, systems: 228_000, windows: 190_000, outdoor: 60_000 };

  it('lists what changed, largest first, and leaves the rest out', () => {
    const d = diffPlans(v1, v2);
    expect(d.changes.map((c) => [c.category, c.delta])).toEqual([
      ['outdoor', 60_000],
      ['frame', 43_000],
      ['fees', 17_000],
      ['systems', -12_000],
    ]);
    expect(d.changes.find((c) => c.category === 'frame')).toMatchObject({ before: 725_000, after: 768_000, stage: 'frame', label: 'שלד' });
    expect(d.before).toBe(1_400_000);
    expect(d.after).toBe(1_508_000);
    expect(d.delta).toBe(108_000);
    expect(d.deltaPct).toBeCloseTo(108_000 / 1_400_000, 10);
  });

  it('adds the changes up by stage, in the owner\'s stage order', () => {
    const d = diffPlans(v1, v2);
    expect(d.byStage).toEqual([
      { stage: 'permit', before: 95_000, after: 112_000, delta: 17_000 },
      { stage: 'frame', before: 725_000, after: 768_000, delta: 43_000 },
      { stage: 'infrastructure', before: 240_000, after: 228_000, delta: -12_000 },
      { stage: 'moving-in', before: 0, after: 60_000, delta: 60_000 },
    ]);
  });

  it('a first version has no "before", and an identical one has no changes', () => {
    const first = diffPlans(null, v1);
    expect(first.deltaPct).toBeNull();
    expect(first.before).toBe(0);
    expect(first.changes).toHaveLength(5);
    expect(diffPlans(v1, { ...v1 })).toMatchObject({ delta: 0, changes: [], byStage: [] });
  });

  it('shifts between categories of one stage cancel out at the stage level', () => {
    const d = diffPlans({ windows: 100_000, flooring: 100_000 }, { windows: 130_000, flooring: 70_000 });
    expect(d.changes).toHaveLength(2);
    expect(d.byStage).toEqual([]);
    expect(d.delta).toBe(0);
  });

  it('versionHistory is newest first, each against the one before it', () => {
    const history = versionHistory([version(2, v2, { isCurrent: true, note: 'אחרי מכרז הקבלנים' }), version(1, v1)]);
    expect(history.map((h) => [h.version.versionNo, h.previous?.versionNo ?? null])).toEqual([
      [2, 1],
      [1, null],
    ]);
    expect(history[0].diff.delta).toBe(108_000);
    expect(history[1].diff.deltaPct).toBeNull();
    expect(currentVersion([version(1, v1), version(2, v2, { isCurrent: true })])?.versionNo).toBe(2);
    expect(currentVersion([version(1, v1), version(3, v2)])?.versionNo).toBe(3);
    expect(currentVersion([])).toBeNull();
    expect(isApprovedVersion(version(2, v2))).toBe(true);
    expect(isApprovedVersion(version(1, v1))).toBe(false);
  });
});

describe('budget health (forecast against the approved budget)', () => {
  const plan = { frame: 768_000, systems: 228_000, design: 150_000 };

  it('reads +2.1% when the known costs run 2.1% over', () => {
    const items = [
      { kind: 'quote' as const, category: 'frame', amount: 792_000, status: 'accepted' as const },
      { kind: 'actual' as const, category: 'design', amount: 150_000, status: 'paid' as const },
    ];
    const h = budgetHealth(summarizeBudget(plan, items));
    expect(h.approved).toBe(1_146_000);
    expect(h.forecast).toBe(1_170_000);
    expect(h.variance).toBe(24_000);
    expect(formatPct(h.variancePct)).toBe('+2.1%');
    expect(h.status).toBe('over');
    expect(h.paidShare).toBeCloseTo(150_000 / 1_146_000, 10);
  });

  it('within 2% is on budget, below it is under, and no data is "none"', () => {
    const on = budgetHealth(summarizeBudget(plan, [{ kind: 'quote', category: 'frame', amount: 780_000, status: 'accepted' }]));
    expect(on.status).toBe('on');
    const under = budgetHealth(summarizeBudget(plan, [{ kind: 'quote', category: 'frame', amount: 700_000, status: 'accepted' }]));
    expect(under.status).toBe('under');
    expect(formatPct(under.variancePct)).toBe('−5.9%');
    const none = budgetHealth(summarizeBudget(plan, []));
    expect(none).toMatchObject({ status: 'none', variance: 0, variancePct: null });
  });

  it('projectBudget measures against the current version', () => {
    const { version: v, health } = projectBudget(
      [version(1, { frame: 700_000 }), version(2, plan, { isCurrent: true })],
      [{ kind: 'actual', category: 'frame', amount: 100_000, status: 'paid' }],
    );
    expect(v?.versionNo).toBe(2);
    expect(health.approved).toBe(1_146_000);
    expect(health.actual).toBe(100_000);
  });

  it('formats percentages with one decimal and a real minus sign', () => {
    expect(formatPct(0.021)).toBe('+2.1%');
    expect(formatPct(-0.004)).toBe('−0.4%');
    expect(formatPct(0.1)).toBe('+10%');
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(0.00004)).toBe('0%');
    expect(formatPct(null)).toBe('—');
    expect(formatPct(Number.NaN)).toBe('—');
  });

  it('variance by stage sums its categories and skips empty stages', () => {
    const summary = summarizeBudget(
      { frame: 768_000, systems: 228_000, envelope: 90_000, windows: 190_000 },
      [
        { kind: 'quote', category: 'frame', amount: 792_000, status: 'accepted' },
        { kind: 'quote', category: 'systems', amount: 210_000, status: 'open' },
      ],
    );
    const rows = stageVariance(summary);
    expect(rows.map((r) => r.stage)).toEqual(['frame', 'infrastructure', 'finishing']);
    expect(rows[0]).toMatchObject({ planned: 768_000, forecast: 792_000, variance: 24_000, status: 'over', hasData: true });
    expect(rows[1]).toMatchObject({ planned: 318_000, forecast: 300_000, variance: -18_000, status: 'under' });
    expect(rows[2]).toMatchObject({ planned: 190_000, status: 'none', hasData: false, variancePct: null });
  });
});

describe('the baseline from growth\'s planner (estimateFromProfile)', () => {
  it('splits each stage row across its categories, by their typical shares', () => {
    const plan = plannedFromStageRows([
      { id: 'frame', mid: 725_400 },
      { id: 'finishing', mid: 1_029_600 },
      { id: 'purchase', mid: 0, included: false },
    ]);
    expect(plan.frame).toBe(725_000);
    // finishing: windows 8, plaster 6, flooring 9, carpentry 8, sanitary 2 (of 33)
    expect(plan.windows).toBe(250_000);
    expect(plan.flooring).toBe(281_000);
    expect(plan.sanitary).toBe(62_000);
    expect(plan.design).toBe(0);
    expect(plan.moving).toBe(0);
  });

  it('matches the planner total for 180 m² in the Shfela (within rounding)', () => {
    const estimate = estimateFromProfile({ sizeM2: 180, regionSlug: 'shfela' }, DEFAULT_PRICE_BOOK);
    const plan = plannedFromStageRows(estimate.stages);
    const included = estimate.stages.filter((s) => s.included).reduce((a, s) => a + s.mid, 0);
    expect(Math.abs(planTotal(plan) - included)).toBeLessThanOrEqual(13 * 500);
    expect(plan.frame).toBeGreaterThan(0);
    expect(plan.outdoor).toBe(0); // moving-in is outside the planner's planning-plus-build total
  });

  it('cleans a submitted plan (known categories, whole shekels)', () => {
    expect(normalizePlan({ frame: '768,000', systems: 228000.4, bogus: 5 })).toMatchObject({ frame: 768_000, systems: 228_000, design: 0 });
    expect(normalizePlan({ frame: -1 })).toBeNull();
    expect(normalizePlan({ frame: 'abc' })).toBeNull();
    expect(normalizePlan({})).toBeNull();
    expect(normalizePlan(null)).toBeNull();
    expect(normalizePlan([1, 2])).toBeNull();
  });
});
