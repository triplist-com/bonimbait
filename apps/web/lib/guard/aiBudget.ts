import 'server-only';

/**
 * Daily AI budget: "AI cost is capped and visible".
 *
 *   const budget = await checkAiBudget({ estimateUsd: 0.03 });
 *   if (!budget.ok) return degraded(budget.message);   // friendly Hebrew, never a crash
 *   ...call the model...
 *   await recordAiUsage({ route: 'answer_stream', model, usage: usageFromAnthropic(msg.usage) });
 *
 * - The cap is AI_DAILY_BUDGET_USD (default $3) per UTC day, across every
 *   route and model, demo traffic included (it is real money). 0 = AI off.
 * - The FLAG_AI_ANSWERS=false kill switch refuses the same way.
 * - Spend lives in public.ai_usage (one row per day/route/model/demo flag).
 *   Each instance caches the day's total for 15s and adds its own recordings,
 *   so a DB outage still caps this instance's spend.
 * - assertAiBudget() throws AiBudgetExceededError for code that prefers it.
 */
import { isEnabled } from '@/lib/flags';
import { isPlatformDbConfigured, platformAdminDb, withTimeout } from '@/lib/platform/db';
import { estimateCostUsd, pricingFor, type TokenUsage } from './aiPricing';

export const DEFAULT_AI_DAILY_BUDGET_USD = 3;

/** Shown instead of an AI answer when AI is over budget or switched off. */
export const AI_UNAVAILABLE_MESSAGE =
  'התשובה הכתובה לא זמינה כרגע. בינתיים ריכזנו לכם את הרגעים בסרטונים ואת המאמרים שהכי מתאימים לשאלה. נסו לשאול שוב בעוד כמה דקות.';
/** Shown when one visitor asks too much too fast (lib/guard/rateLimit.ts). */
export const AI_RATE_LIMITED_MESSAGE = 'שאלתם הרבה שאלות בזמן קצר. נסו שוב בעוד כמה דקות.';

export type AiBudgetStatus = {
  ok: boolean;
  /** Why it refused: over the cap, or AI switched off (flag or a $0 budget). */
  reason?: 'budget' | 'disabled';
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  /** Hebrew, user-facing, set when ok is false. */
  message?: string;
};

export class AiBudgetExceededError extends Error {
  readonly status: AiBudgetStatus;
  readonly userMessage: string;
  constructor(status: AiBudgetStatus) {
    super(`AI budget refused (${status.reason}): spent $${status.spentUsd.toFixed(4)} of $${status.budgetUsd}`);
    this.name = 'AiBudgetExceededError';
    this.status = status;
    this.userMessage = status.message ?? AI_UNAVAILABLE_MESSAGE;
  }
}

/** AI_DAILY_BUDGET_USD, or the default when unset/invalid. 0 turns AI off. */
export function dailyBudgetUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AI_DAILY_BUDGET_USD?.trim();
  if (!raw) return DEFAULT_AI_DAILY_BUDGET_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_AI_DAILY_BUDGET_USD;
}

/** Pure decision: may a call that costs about `estimateUsd` go ahead? */
export function evaluateBudget(spentUsd: number, budgetUsd: number, estimateUsd = 0): { ok: boolean; remainingUsd: number } {
  const remainingUsd = Math.max(0, round6(budgetUsd - spentUsd));
  const ok = budgetUsd > 0 && spentUsd < budgetUsd && spentUsd + Math.max(0, estimateUsd) <= budgetUsd;
  return { ok, remainingUsd };
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Spend cache (per server instance)
// ---------------------------------------------------------------------------

const SPEND_TTL_MS = 15_000;
const DB_TIMEOUT_MS = 1500;

type SpendCache = { day: string; dbSpent: number; local: number; syncedAt: number };
let cache: SpendCache | null = null;

/** Test helper. */
export function resetAiBudgetCache(): void {
  cache = null;
}

async function fetchDbSpend(day: string): Promise<number | null> {
  if (!isPlatformDbConfigured()) return null;
  try {
    const { data, error } = await withTimeout(platformAdminDb().rpc('ai_spend_for_day', { p_day: day }), DB_TIMEOUT_MS, 'ai_spend_for_day');
    if (error) {
      console.error(`[aiBudget] spend lookup failed: ${error.message}`);
      return null;
    }
    return data == null ? 0 : Number(data);
  } catch (err) {
    console.error(`[aiBudget] spend lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Today's estimated spend (USD), all routes, demo included. */
export async function getAiSpendToday(now = Date.now()): Promise<number> {
  const day = utcDay(now);
  const fresh = cache && cache.day === day && now - cache.syncedAt < SPEND_TTL_MS;
  if (!fresh) {
    const fromDb = await fetchDbSpend(day);
    const sameDay = cache?.day === day ? cache : null;
    cache =
      fromDb != null
        ? { day, dbSpent: fromDb, local: 0, syncedAt: now }
        : // DB unavailable: keep the last known total plus this instance's spend; retry after the TTL.
          { day, dbSpent: sameDay?.dbSpent ?? 0, local: sameDay?.local ?? 0, syncedAt: now };
  }
  return round6(cache!.dbSpent + cache!.local);
}

let lastRefusalLog = 0;

export async function checkAiBudget(opts: { estimateUsd?: number; now?: number } = {}): Promise<AiBudgetStatus> {
  const budgetUsd = dailyBudgetUsd();
  if (!isEnabled('aiAnswers') || budgetUsd === 0) {
    return { ok: false, reason: 'disabled', spentUsd: 0, budgetUsd, remainingUsd: 0, message: AI_UNAVAILABLE_MESSAGE };
  }
  const spentUsd = await getAiSpendToday(opts.now);
  const { ok, remainingUsd } = evaluateBudget(spentUsd, budgetUsd, opts.estimateUsd);
  if (ok) return { ok, spentUsd, budgetUsd, remainingUsd };
  const now = opts.now ?? Date.now();
  if (now - lastRefusalLog > 60_000) {
    lastRefusalLog = now;
    console.warn(`[aiBudget] daily AI budget reached: $${spentUsd.toFixed(4)} of $${budgetUsd} (AI_DAILY_BUDGET_USD)`);
  }
  return { ok, reason: 'budget', spentUsd, budgetUsd, remainingUsd, message: AI_UNAVAILABLE_MESSAGE };
}

/** Like checkAiBudget, but throws AiBudgetExceededError when refused. */
export async function assertAiBudget(opts: { estimateUsd?: number; now?: number } = {}): Promise<AiBudgetStatus> {
  const status = await checkAiBudget(opts);
  if (!status.ok) throw new AiBudgetExceededError(status);
  return status;
}

export type RecordAiUsageInput = {
  /** Stable route id, e.g. 'answer_stream', 'pros_classifier', 'advisor_chat'. */
  route: string;
  model: string;
  usage: TokenUsage;
  isDemo?: boolean;
  now?: number;
};

/**
 * Add one call's usage to today's bucket. Never throws. Returns the call's
 * estimated cost and today's total after it.
 */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<{ costUsd: number; spentTodayUsd: number }> {
  const now = input.now ?? Date.now();
  const day = utcDay(now);
  const costUsd = estimateCostUsd(input.model, input.usage);
  if (!pricingFor(input.model).known) {
    console.warn(`[aiBudget] no price for model "${input.model}": billed at the highest known rate (lib/guard/aiPricing.ts)`);
  }
  if (!cache || cache.day !== day) cache = { day, dbSpent: 0, local: 0, syncedAt: 0 };
  cache.local = round6(cache.local + costUsd);

  if (isPlatformDbConfigured()) {
    try {
      const { data, error } = await withTimeout(
        platformAdminDb().rpc('record_ai_usage', {
          p_route: input.route,
          p_model: input.model,
          p_input_tokens: Math.round(input.usage.inputTokens || 0),
          p_output_tokens: Math.round(input.usage.outputTokens || 0),
          p_cache_read_tokens: Math.round(input.usage.cacheReadTokens || 0),
          p_cache_write_tokens: Math.round((input.usage.cacheWriteTokens || 0) + (input.usage.cacheWrite1hTokens || 0)),
          p_cost_usd: costUsd,
          p_is_demo: Boolean(input.isDemo),
          p_day: day,
        }),
        2000,
        'record_ai_usage',
      );
      if (error) console.error(`[aiBudget] record failed: ${error.message}`);
      else if (data != null) cache = { day, dbSpent: Number(data), local: 0, syncedAt: now };
    } catch (err) {
      console.error(`[aiBudget] record failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { costUsd, spentTodayUsd: round6(cache.dbSpent + cache.local) };
}
