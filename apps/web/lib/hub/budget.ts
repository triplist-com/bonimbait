/**
 * The hub budget: categories (how quotes and payments really arrive), their
 * stage and their typical share of a planning-plus-build budget, and the
 * budget-vs-estimate summary the dashboard and P7 (Bonim.Os) show.
 *
 * Planned amounts come from a budget version (hub_budget_versions + its
 * 'planned' items); quotes and actuals are facts that don't belong to a
 * version. Shares are a typical split (נכון ל-2026) for an estimate, not a
 * quote: the shell is about a third of the budget, as the owner says
 * (≈ ₪800K of ≈ ₪2.6M for 200 m²). Land is never part of it. Client-safe.
 */
import type { HubBudgetItemView, StageId } from './types';

export type BudgetCategoryId =
  | 'design'
  | 'fees'
  | 'frame'
  | 'systems'
  | 'envelope'
  | 'windows'
  | 'plaster'
  | 'flooring'
  | 'carpentry'
  | 'sanitary'
  | 'outdoor'
  | 'moving'
  | 'other';

export interface BudgetCategory {
  id: BudgetCategoryId;
  label: string;
  /** What usually goes here. */
  examples: string;
  /** The stage it is paid in; null for "other". */
  stage: StageId | null;
  /** Typical share of the planning-plus-build budget, in percent. */
  share: number;
}

/** Same ids as the hub_budget_items.category CHECK constraint. */
export const BUDGET_CATEGORIES: readonly BudgetCategory[] = [
  { id: 'design', label: 'תכנון, יועצים ופיקוח', examples: 'אדריכל, קונסטרוקטור, יועצים, מודד ומפקח', stage: 'planning', share: 7 },
  { id: 'fees', label: 'אגרות, היטלים וביטוח', examples: 'אגרות בנייה, היטלי פיתוח וביטוח קבלני', stage: 'permit', share: 5 },
  { id: 'frame', label: 'שלד', examples: 'עבודות עפר, יסודות, בטון, ברזל ובלוקים', stage: 'frame', share: 31 },
  { id: 'systems', label: 'חשמל, אינסטלציה ומיזוג', examples: 'חשמל ומתח נמוך, צנרת, ביוב ומיזוג', stage: 'infrastructure', share: 12 },
  { id: 'envelope', label: 'איטום, בידוד וגג', examples: 'איטום יסודות, חדרים רטובים וגג, בידוד ורעפים', stage: 'infrastructure', share: 5 },
  { id: 'windows', label: 'אלומיניום וזכוכית', examples: 'חלונות, ויטרינות, תריסים ומעקות', stage: 'finishing', share: 8 },
  { id: 'plaster', label: 'טיח, צבע וגבס', examples: 'טיח פנים וחוץ, שפכטל, צבע ותקרות גבס', stage: 'finishing', share: 6 },
  { id: 'flooring', label: 'ריצוף, חיפוי ושיש', examples: 'ריצוף, חיפוי קירות, אדנים ומדרגות', stage: 'finishing', share: 9 },
  { id: 'carpentry', label: 'מטבח, נגרות ודלתות', examples: 'מטבח, ארונות, דלתות פנים ודלת כניסה', stage: 'finishing', share: 8 },
  { id: 'sanitary', label: 'כלים סניטריים וברזים', examples: 'אסלות, כיורים, ברזים ומקלחונים', stage: 'finishing', share: 2 },
  { id: 'outdoor', label: 'פיתוח חוץ, גדרות וחניה', examples: 'גדרות, חניה, שבילים, ניקוז וגינה', stage: 'moving-in', share: 6 },
  { id: 'moving', label: 'חיבורים, בדק בית ומסירה', examples: 'חיבורי חשמל ומים, בדק בית וניקיון', stage: 'moving-in', share: 1 },
  { id: 'other', label: 'אחר ובלת״מ', examples: 'כל מה שלא נכנס לקטגוריה אחרת', stage: null, share: 0 },
] as const;

const BY_ID = new Map(BUDGET_CATEGORIES.map((c) => [c.id, c]));

export function isBudgetCategoryId(value: unknown): value is BudgetCategoryId {
  return typeof value === 'string' && BY_ID.has(value as BudgetCategoryId);
}

export function budgetCategory(id: string): BudgetCategory | undefined {
  return BY_ID.get(id as BudgetCategoryId);
}

/** Typical share of the budget spent in a stage (sum of its categories), in percent. */
export function stageBudgetShare(stage: StageId): number {
  return BUDGET_CATEGORIES.filter((c) => c.stage === stage).reduce((sum, c) => sum + c.share, 0);
}

/** Round to the nearest 1,000 ₪ (estimates never pretend to be exact). */
export function roundThousands(n: number): number {
  return Math.round(n / 1000) * 1000;
}

/**
 * Planned amount per category from an estimate range: its midpoint split by
 * the typical shares, in whole shekels rounded to 1,000.
 */
export function plannedFromEstimate(totalMin: number, totalMax: number): Record<BudgetCategoryId, number> {
  const mid = (Math.max(0, totalMin) + Math.max(0, totalMax)) / 2;
  const out = {} as Record<BudgetCategoryId, number>;
  for (const c of BUDGET_CATEGORIES) out[c.id] = roundThousands((mid * c.share) / 100);
  return out;
}

/** Below this share of the plan, a difference counts as "on budget". */
export const ON_BUDGET_TOLERANCE = 0.02;

export type VarianceStatus = 'none' | 'under' | 'on' | 'over';

export interface CategorySummary {
  id: BudgetCategoryId;
  label: string;
  stage: StageId | null;
  planned: number;
  actual: number;
  /** Sum of accepted quotes (a commitment). */
  committed: number;
  openQuotes: number;
  lowestOpenQuote: number | null;
  /** Best guess of the final cost: committed/paid, else the lowest open quote, else the plan. */
  forecast: number;
  /** What the forecast is based on. */
  forecastBasis: 'actual' | 'committed' | 'quote' | 'plan';
  /** forecast - planned (0 when there is no real data yet). */
  variance: number;
  status: VarianceStatus;
}

export interface StageBudgetSummary {
  stage: StageId | null;
  planned: number;
  actual: number;
  forecast: number;
  variance: number;
}

export interface BudgetSummary {
  planned: number;
  actual: number;
  committed: number;
  forecast: number;
  variance: number;
  /** actual / planned, 0..1+ (0 when nothing is planned). */
  paidShare: number;
  openQuotes: number;
  categories: CategorySummary[];
  byStage: StageBudgetSummary[];
  /** True when any quote or payment was recorded. */
  hasData: boolean;
}

export function varianceStatus(variance: number, planned: number, hasData: boolean): VarianceStatus {
  if (!hasData) return 'none';
  const tolerance = Math.max(1000, Math.abs(planned) * ON_BUDGET_TOLERANCE);
  if (variance > tolerance) return 'over';
  if (variance < -tolerance) return 'under';
  return 'on';
}

/**
 * Budget vs plan by category and stage. `planned` is whole shekels per
 * category (a version's planned lines, or plannedFromEstimate()); items are
 * quotes and actuals in whole shekels.
 */
export function summarizeBudget(
  planned: Partial<Record<string, number>>,
  items: ReadonlyArray<Pick<HubBudgetItemView, 'kind' | 'category' | 'amount' | 'status'>>,
): BudgetSummary {
  const categories: CategorySummary[] = BUDGET_CATEGORIES.map((c) => {
    const mine = items.filter((i) => i.category === c.id);
    const actual = sum(mine.filter((i) => i.kind === 'actual').map((i) => i.amount));
    const committed = sum(mine.filter((i) => i.kind === 'quote' && i.status === 'accepted').map((i) => i.amount));
    const open = mine.filter((i) => i.kind === 'quote' && (i.status === 'open' || i.status == null));
    const lowestOpenQuote = open.length ? Math.min(...open.map((i) => i.amount)) : null;
    const plan = Math.max(0, Math.round(planned[c.id] ?? 0));

    let forecast = plan;
    let forecastBasis: CategorySummary['forecastBasis'] = 'plan';
    if (actual > 0 || committed > 0) {
      forecast = Math.max(actual, committed);
      forecastBasis = actual >= committed ? 'actual' : 'committed';
    } else if (lowestOpenQuote != null) {
      forecast = lowestOpenQuote;
      forecastBasis = 'quote';
    }
    const hasData = forecastBasis !== 'plan';
    const variance = hasData ? forecast - plan : 0;

    return {
      id: c.id,
      label: c.label,
      stage: c.stage,
      planned: plan,
      actual,
      committed,
      openQuotes: open.length,
      lowestOpenQuote,
      forecast,
      forecastBasis,
      variance,
      status: varianceStatus(variance, plan, hasData),
    };
  });

  const byStageMap = new Map<StageId | null, StageBudgetSummary>();
  for (const c of categories) {
    const row = byStageMap.get(c.stage) ?? { stage: c.stage, planned: 0, actual: 0, forecast: 0, variance: 0 };
    row.planned += c.planned;
    row.actual += c.actual;
    row.forecast += c.forecast;
    row.variance += c.variance;
    byStageMap.set(c.stage, row);
  }

  const totals = {
    planned: sum(categories.map((c) => c.planned)),
    actual: sum(categories.map((c) => c.actual)),
    committed: sum(categories.map((c) => c.committed)),
    forecast: sum(categories.map((c) => c.forecast)),
    variance: sum(categories.map((c) => c.variance)),
    openQuotes: sum(categories.map((c) => c.openQuotes)),
  };

  return {
    ...totals,
    paidShare: totals.planned > 0 ? totals.actual / totals.planned : 0,
    categories,
    byStage: Array.from(byStageMap.values()),
    hasData: items.some((i) => i.kind === 'quote' || i.kind === 'actual'),
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * How the member's own budget compares with the estimate: a gentle nudge
 * when the budget is clearly below it (a consult moment), never a verdict.
 */
export function budgetGap(
  budgetRangeNis: [number, number] | null | undefined,
  estimate: { totalMin: number; totalMax: number } | null | undefined,
): { kind: 'below' | 'within' | 'above'; amount: number } | null {
  if (!budgetRangeNis || !estimate) return null;
  const budgetMax = budgetRangeNis[1];
  const budgetMin = budgetRangeNis[0];
  if (budgetMax < estimate.totalMin) return { kind: 'below', amount: roundThousands(estimate.totalMin - budgetMax) };
  if (budgetMin > estimate.totalMax) return { kind: 'above', amount: roundThousands(budgetMin - estimate.totalMax) };
  return { kind: 'within', amount: 0 };
}
