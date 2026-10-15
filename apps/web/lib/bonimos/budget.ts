/**
 * Budget vs actual for managed projects, on top of the hub's budget model
 * (lib/hub/budget.ts: categories, summarizeBudget). Adds what a project
 * manager needs:
 *
 *   diffPlans / versionHistory   what changed between approved versions, by
 *                                category and by stage (the change log)
 *   budgetHealth                 forecast vs the approved budget, in ₪ and %
 *   plannedFromStageRows         a baseline from growth's planner stage rows
 *                                (estimateFromProfile), split into the hub's
 *                                categories
 *
 * Whole shekels throughout. Pure and client-safe.
 */
import {
  BUDGET_CATEGORIES,
  ON_BUDGET_TOLERANCE,
  roundThousands,
  summarizeBudget,
  type BudgetCategoryId,
  type BudgetSummary,
  type VarianceStatus,
} from '@/lib/hub/budget';
import type { HubBudgetItemView, StageId } from '@/lib/hub/types';
import type { BudgetVersionPlan } from './types';

export type PlanMap = Partial<Record<BudgetCategoryId | string, number>>;

/** Sum of a plan's categories. */
export function planTotal(plan: PlanMap | null | undefined): number {
  if (!plan) return 0;
  return Object.values(plan).reduce<number>((a, b) => a + (typeof b === 'number' && Number.isFinite(b) ? b : 0), 0);
}

export interface CategoryChange {
  category: BudgetCategoryId;
  label: string;
  stage: StageId | null;
  before: number;
  after: number;
  delta: number;
}

export interface StageChange {
  stage: StageId | null;
  before: number;
  after: number;
  delta: number;
}

export interface PlanDiff {
  before: number;
  after: number;
  delta: number;
  /** delta / before, e.g. 0.021; null when there was no plan before. */
  deltaPct: number | null;
  /** Categories that changed, largest change first. */
  changes: CategoryChange[];
  /** Stages that changed, in the owner's stage order (null = "אחר" last). */
  byStage: StageChange[];
}

const STAGE_ORDER: readonly (StageId | null)[] = [
  'purchase',
  'planning',
  'permit',
  'frame',
  'infrastructure',
  'finishing',
  'moving-in',
  null,
];

/** What changed from one plan to the next. A missing `before` is a first version. */
export function diffPlans(before: PlanMap | null | undefined, after: PlanMap): PlanDiff {
  const changes: CategoryChange[] = [];
  for (const c of BUDGET_CATEGORIES) {
    const b = Math.round(before?.[c.id] ?? 0);
    const a = Math.round(after[c.id] ?? 0);
    if (a !== b) changes.push({ category: c.id, label: c.label, stage: c.stage, before: b, after: a, delta: a - b });
  }
  changes.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.category.localeCompare(y.category));

  const byStage: StageChange[] = [];
  for (const stage of STAGE_ORDER) {
    const mine = changes.filter((c) => c.stage === stage);
    if (!mine.length) continue;
    const b = mine.reduce((s, c) => s + c.before, 0);
    const a = mine.reduce((s, c) => s + c.after, 0);
    if (a !== b) byStage.push({ stage, before: b, after: a, delta: a - b });
  }

  const totalBefore = before ? Math.round(planTotal(before)) : 0;
  const totalAfter = Math.round(planTotal(after));
  return {
    before: totalBefore,
    after: totalAfter,
    delta: totalAfter - totalBefore,
    deltaPct: before && totalBefore > 0 ? (totalAfter - totalBefore) / totalBefore : null,
    changes,
    byStage,
  };
}

export interface VersionChange {
  version: BudgetVersionPlan;
  /** The version it replaced (null for v1). */
  previous: BudgetVersionPlan | null;
  diff: PlanDiff;
}

/** Every version against the one before it, newest first (the change log). */
export function versionHistory(versions: readonly BudgetVersionPlan[]): VersionChange[] {
  const ordered = [...versions].sort((a, b) => a.versionNo - b.versionNo);
  return ordered
    .map((version, i) => {
      const previous = i > 0 ? ordered[i - 1] : null;
      return { version, previous, diff: diffPlans(previous?.planned ?? null, version.planned) };
    })
    .reverse();
}

/** The version the project is measured against: the current one, else the newest. */
export function currentVersion(versions: readonly BudgetVersionPlan[]): BudgetVersionPlan | null {
  if (!versions.length) return null;
  return versions.find((v) => v.isCurrent) ?? [...versions].sort((a, b) => b.versionNo - a.versionNo)[0];
}

/** Is it a manager-approved budget (rather than a calculator or planner estimate)? */
export function isApprovedVersion(v: Pick<BudgetVersionPlan, 'basis'>): boolean {
  return v.basis === 'manual' || v.basis === 'quotes';
}

export interface BudgetHealth {
  /** The plan being measured against. */
  approved: number;
  forecast: number;
  actual: number;
  committed: number;
  variance: number;
  /** variance / approved (0.021 = +2.1%); null without a plan. */
  variancePct: number | null;
  status: VarianceStatus;
  /** actual / approved, 0..1+. */
  paidShare: number;
}

/**
 * Forecast against the approved budget. Within ±2% (the hub's tolerance) is
 * "on budget"; a budget with no quotes or payments yet has status 'none'.
 */
export function budgetHealth(summary: BudgetSummary): BudgetHealth {
  const approved = summary.planned;
  const variance = summary.hasData ? summary.forecast - approved : 0;
  const variancePct = approved > 0 && summary.hasData ? variance / approved : null;
  let status: VarianceStatus = 'none';
  if (summary.hasData) {
    const tolerance = Math.max(1000, approved * ON_BUDGET_TOLERANCE);
    status = variance > tolerance ? 'over' : variance < -tolerance ? 'under' : 'on';
  }
  return {
    approved,
    forecast: summary.forecast,
    actual: summary.actual,
    committed: summary.committed,
    variance,
    variancePct,
    status,
    paidShare: summary.paidShare,
  };
}

/** Summary and health of a project's current version and items, in one call. */
export function projectBudget(
  versions: readonly BudgetVersionPlan[],
  items: ReadonlyArray<Pick<HubBudgetItemView, 'kind' | 'category' | 'amount' | 'status'>>,
): { version: BudgetVersionPlan | null; summary: BudgetSummary; health: BudgetHealth } {
  const version = currentVersion(versions);
  const summary = summarizeBudget(version?.planned ?? {}, items);
  return { version, summary, health: budgetHealth(summary) };
}

/** "+2.1%" / "−0.4%" / "0%" (one decimal, a real minus sign). */
export function formatPct(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  const v = Math.round(ratio * 100 * 10 ** digits) / 10 ** digits;
  if (v === 0) return '0%';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits).replace(/\.0+$/, '')}%`;
}

export interface StageVarianceRow {
  stage: StageId | null;
  planned: number;
  actual: number;
  forecast: number;
  variance: number;
  variancePct: number | null;
  status: VarianceStatus;
  /** Any quote or payment recorded in the stage. */
  hasData: boolean;
}

/** Variance by the 7 stages ("אחר" last), from a budget summary. */
export function stageVariance(summary: BudgetSummary): StageVarianceRow[] {
  return STAGE_ORDER.flatMap((stage) => {
    const cats = summary.categories.filter((c) => c.stage === stage);
    if (!cats.length) return [];
    const planned = cats.reduce((s, c) => s + c.planned, 0);
    const actual = cats.reduce((s, c) => s + c.actual, 0);
    const forecast = cats.reduce((s, c) => s + c.forecast, 0);
    const variance = cats.reduce((s, c) => s + c.variance, 0);
    const hasData = cats.some((c) => c.forecastBasis !== 'plan');
    if (planned === 0 && !hasData) return [];
    const tolerance = Math.max(1000, planned * ON_BUDGET_TOLERANCE);
    const status: VarianceStatus = !hasData ? 'none' : variance > tolerance ? 'over' : variance < -tolerance ? 'under' : 'on';
    return [{ stage, planned, actual, forecast, variance, variancePct: planned > 0 && hasData ? variance / planned : null, status, hasData }];
  });
}

/**
 * A category plan from growth's planner stage rows (estimateFromProfile():
 * `stages[].mid`): each stage's amount split across its hub categories by
 * their typical shares, rounded to 1,000 ₪. Categories of stages the planner
 * leaves out (purchase, moving-in) stay empty.
 */
export function plannedFromStageRows(stages: ReadonlyArray<{ id: StageId; mid: number; included?: boolean }>): Record<BudgetCategoryId, number> {
  const out = Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.id, 0])) as Record<BudgetCategoryId, number>;
  for (const s of stages) {
    if (s.included === false || !(s.mid > 0)) continue;
    const cats = BUDGET_CATEGORIES.filter((c) => c.stage === s.id && c.share > 0);
    const shareSum = cats.reduce((a, c) => a + c.share, 0);
    if (!cats.length || shareSum <= 0) continue;
    for (const c of cats) out[c.id] = roundThousands((s.mid * c.share) / shareSum);
  }
  return out;
}

/** Clean a client-submitted plan: known categories only, whole shekels, 0..1B. */
export function normalizePlan(input: unknown): Record<BudgetCategoryId, number> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const out = {} as Record<BudgetCategoryId, number>;
  let total = 0;
  for (const c of BUDGET_CATEGORIES) {
    const v = raw[c.id];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[,\s₪]/g, '')) : 0;
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return null;
    out[c.id] = Math.round(n);
    total += out[c.id];
  }
  return total > 0 ? out : null;
}
