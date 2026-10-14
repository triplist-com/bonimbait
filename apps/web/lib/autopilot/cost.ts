/**
 * Cost gate for Content Autopilot's paid calls (embeddings, the Claude
 * summary, optional audio transcription).
 *
 * Minimal on purpose: the `foundation` squad is building the shared AI budget
 * guard (lib/guard/aiBudget.ts). The pipeline only depends on the
 * `AutopilotBudgetGuard` interface below and gets its instance from
 * `getBudgetGuard()`, so swapping in the shared guard is a one-function change.
 */
import { formatUsd, usdToMicros } from './pricing';

export interface SpendEstimate {
  /** What is about to be paid for, e.g. "summarize EeMos4VM2oU". */
  label: string;
  /** Upper bound for the call(s), in micro-USD. */
  usdMicros: number;
}

export type BudgetDecision = { ok: true } | { ok: false; reason: string };

export interface AutopilotBudgetGuard {
  /** May this spend happen now? Never throws for budget reasons. */
  check(estimate: SpendEstimate): Promise<BudgetDecision>;
  /** Report what was actually spent (the pipeline also stores it on the source row). */
  record(spend: { label: string; usdMicros: number; sourceId?: string }): Promise<void>;
}

export interface BudgetLimits {
  /** Hard cap for one video's processing. */
  perVideoMicros: number;
  /** Rolling 30-day cap across all autopilot processing. */
  monthlyMicros: number;
}

function envUsd(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** AUTOPILOT_MAX_USD_PER_VIDEO (default $0.10) and AUTOPILOT_MONTHLY_BUDGET_USD (default $2). */
export function budgetLimitsFromEnv(): BudgetLimits {
  return {
    perVideoMicros: usdToMicros(envUsd('AUTOPILOT_MAX_USD_PER_VIDEO', 0.1)),
    monthlyMicros: usdToMicros(envUsd('AUTOPILOT_MONTHLY_BUDGET_USD', 2)),
  };
}

/** Pure decision, shared by the implementations and tests. */
export function decide(estimate: SpendEstimate, spentLast30dMicros: number, limits: BudgetLimits): BudgetDecision {
  if (estimate.usdMicros > limits.perVideoMicros) {
    return {
      ok: false,
      reason: `העלות המשוערת (${formatUsd(estimate.usdMicros)}) גבוהה מהתקרה לסרטון (${formatUsd(limits.perVideoMicros)}).`,
    };
  }
  if (spentLast30dMicros + estimate.usdMicros > limits.monthlyMicros) {
    return {
      ok: false,
      reason: `תקציב העיבוד החודשי נוצל (${formatUsd(spentLast30dMicros)} מתוך ${formatUsd(limits.monthlyMicros)}).`,
    };
  }
  return { ok: true };
}

/**
 * Default guard: caps per video and per rolling 30 days, where the 30-day
 * spend is the sum of knowledge_sources.cost_usd_micros of rows processed in
 * that window (read through `spentLast30d`, so no DB coupling here).
 */
export function createBudgetGuard(
  spentLast30d: () => Promise<number>,
  limits: BudgetLimits = budgetLimitsFromEnv(),
): AutopilotBudgetGuard {
  return {
    async check(estimate) {
      let spent = 0;
      try {
        spent = await spentLast30d();
      } catch (err) {
        // Fail closed: without the ledger we cannot prove there is budget left.
        return { ok: false, reason: `לא ניתן לבדוק את התקציב: ${(err as Error)?.message ?? err}` };
      }
      return decide(estimate, spent, limits);
    },
    async record(spend) {
      console.info(`[autopilot] spend ${spend.label}: ${formatUsd(spend.usdMicros)}${spend.sourceId ? ` (source ${spend.sourceId})` : ''}`);
    },
  };
}

/** The swap point for the shared lib/guard/aiBudget.ts guard. */
export function getBudgetGuard(spentLast30d: () => Promise<number>): AutopilotBudgetGuard {
  return createBudgetGuard(spentLast30d);
}
