/**
 * "Your numbers" model behind the pitch site's calculator (/platform/#roi).
 *
 * Pure and client-safe. From a handful of funnel assumptions it returns the
 * owner's extra consults, plans and shekels per year. It deliberately has no
 * notion of what the platform costs: the page shows the owner's upside only,
 * as an illustration he replaces with his own numbers (the same format as his
 * own "כמה שווה לכם הקהל שלנו?" calculator on /strategic-partners/).
 *
 * The defaults are the base case of the sales strategy: 20,000 sessions a
 * month, 0.8% of them identified (advisor, hub, planner) plus 30 builders a
 * month from owned channels, 20% qualified, 20% of those book a consult, and
 * 30.5% of consults buy a plan (82% budget, 13% Plus, 5% turnkey).
 */

/** Plan prices in whole shekels, ex-VAT. Turnkey is the average of its size tiers. */
export interface PlanPricesNis {
  budget: number;
  plus: number;
  turnkey: number;
}

export type PlanKey = keyof PlanPricesNis;
export const PLAN_KEYS: readonly PlanKey[] = ['budget', 'plus', 'turnkey'];

/** Every rate is a percentage (0.8 means 0.8%), the unit the sliders use. */
export interface RoiInputs {
  /** Site sessions per month. */
  monthlySessions: number;
  /** % of sessions that become identified builders (advisor, hub or planner). */
  identifiedPct: number;
  /** Identified builders per month from owned channels (WhatsApp, newsletter, YouTube links). */
  ownedChannelBuilders: number;
  /** % of identified builders who qualify (self-build, early stage, a real budget). */
  qualifiedPct: number;
  /** % of qualified builders who book a consult. */
  bookingPct: number;
  /** % of these extra consults that buy a plan. */
  conversionPct: number;
  /** Plan mix: % of the plans sold that are Plus. */
  mixPlusPct: number;
  /** Plan mix: % of the plans sold that are turnkey. The budget plan takes the rest. */
  mixTurnkeyPct: number;
  /** Extra partner revenue per month (upgrades, renewals, new partners), in shekels. */
  partnerMrrUplift: number;
}

export type PlanNumbers = Record<PlanKey, number> & { total: number };

export interface RoiResult {
  identifiedPerYear: number;
  qualifiedPerYear: number;
  consultsPerYear: number;
  consultsPerWeek: number;
  /** Shares of the plans sold (0..1), after normalising the mix. */
  mix: Record<PlanKey, number>;
  plans: PlanNumbers;
  planRevenue: PlanNumbers;
  partnerRevenue: number;
  /** Plan revenue plus partner revenue, per year. */
  totalRevenue: number;
}

/** The strategy's base case (see the module comment). */
export const BASE_CASE: Readonly<RoiInputs> = {
  monthlySessions: 20_000,
  identifiedPct: 0.8,
  ownedChannelBuilders: 30,
  qualifiedPct: 20,
  bookingPct: 20,
  conversionPct: 30.5,
  mixPlusPct: 13,
  mixTurnkeyPct: 5,
  partnerMrrUplift: 6_000,
};

/**
 * The owner's public plan prices (bonimbayit.co.il/membership-tiers/, ex-VAT,
 * October 2026). Used only when the service_plans table can't be read.
 */
export const PUBLIC_PLAN_PRICES: Readonly<PlanPricesNis> = {
  budget: 6_900,
  plus: 29_000,
  turnkey: (133_000 + 149_000) / 2,
};

const WEEKS_PER_YEAR = 52;

function clampNumber(value: number, min: number, max = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Plan mix shares that always sum to 1, whatever the sliders say. */
export function normaliseMix(plusPct: number, turnkeyPct: number): Record<PlanKey, number> {
  let plus = clampNumber(plusPct, 0, 100);
  let turnkey = clampNumber(turnkeyPct, 0, 100);
  if (plus + turnkey > 100) {
    const scale = 100 / (plus + turnkey);
    plus *= scale;
    turnkey *= scale;
  }
  // max(0, …): scaling can leave a float residue like -7e-17.
  return { budget: Math.max(0, 100 - plus - turnkey) / 100, plus: plus / 100, turnkey: turnkey / 100 };
}

function sumPlans(values: Record<PlanKey, number>): PlanNumbers {
  return { ...values, total: values.budget + values.plus + values.turnkey };
}

export function computeRoi(inputs: RoiInputs, prices: PlanPricesNis): RoiResult {
  const sessions = clampNumber(inputs.monthlySessions, 0);
  const pct = (v: number) => clampNumber(v, 0, 100) / 100;

  const identifiedPerMonth = sessions * pct(inputs.identifiedPct) + clampNumber(inputs.ownedChannelBuilders, 0);
  const identifiedPerYear = 12 * identifiedPerMonth;
  const qualifiedPerYear = identifiedPerYear * pct(inputs.qualifiedPct);
  const consultsPerYear = qualifiedPerYear * pct(inputs.bookingPct);
  const plansSold = consultsPerYear * pct(inputs.conversionPct);
  const mix = normaliseMix(inputs.mixPlusPct, inputs.mixTurnkeyPct);

  const plans = sumPlans({
    budget: plansSold * mix.budget,
    plus: plansSold * mix.plus,
    turnkey: plansSold * mix.turnkey,
  });
  const planRevenue = sumPlans({
    budget: plans.budget * clampNumber(prices.budget, 0),
    plus: plans.plus * clampNumber(prices.plus, 0),
    turnkey: plans.turnkey * clampNumber(prices.turnkey, 0),
  });
  const partnerRevenue = 12 * clampNumber(inputs.partnerMrrUplift, 0);

  return {
    identifiedPerYear,
    qualifiedPerYear,
    consultsPerYear,
    consultsPerWeek: consultsPerYear / WEEKS_PER_YEAR,
    mix,
    plans,
    planRevenue,
    partnerRevenue,
    totalRevenue: planRevenue.total + partnerRevenue,
  };
}

/* ------------------------------------------------------------------ */
/* Sliders                                                             */
/* ------------------------------------------------------------------ */

export type RoiField = keyof RoiInputs;

export interface RoiFieldDef {
  key: RoiField;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit: 'count' | 'pct' | 'nis';
  group: 'traffic' | 'funnel' | 'mix' | 'partners';
}

/** Slider definitions, in display order. Every default sits inside its range, on a step. */
export const ROI_FIELDS: readonly RoiFieldDef[] = [
  {
    key: 'monthlySessions',
    label: 'כניסות לאתר בחודש',
    hint: 'מה GA4 שלכם מראה בחודש רגיל',
    min: 2_000,
    max: 60_000,
    step: 1_000,
    unit: 'count',
    group: 'traffic',
  },
  {
    key: 'identifiedPct',
    label: 'מהם מזדהים',
    hint: 'שואלים את היועץ, פותחים את הבית שלי או בונים תקציב',
    min: 0.2,
    max: 2,
    step: 0.1,
    unit: 'pct',
    group: 'traffic',
  },
  {
    key: 'ownedChannelBuilders',
    label: 'מזדהים מהערוצים שלכם בחודש',
    hint: 'וואטסאפ, ניוזלטר וקישורים מיוטיוב',
    min: 0,
    max: 150,
    step: 5,
    unit: 'count',
    group: 'traffic',
  },
  {
    key: 'qualifiedPct',
    label: 'מתאימים לליווי',
    hint: 'בנייה עצמית, לפני מכרז, תקציב אמיתי',
    min: 5,
    max: 50,
    step: 1,
    unit: 'pct',
    group: 'funnel',
  },
  {
    key: 'bookingPct',
    label: 'קובעים פגישת ייעוץ',
    hint: 'מתוך המתאימים',
    min: 5,
    max: 50,
    step: 1,
    unit: 'pct',
    group: 'funnel',
  },
  {
    key: 'conversionPct',
    label: 'נסגרים לתוכנית',
    hint: 'מתוך פגישות הייעוץ הנוספות',
    min: 5,
    max: 60,
    step: 0.5,
    unit: 'pct',
    group: 'funnel',
  },
  {
    key: 'mixPlusPct',
    label: 'מהסגירות: בונים בית פלוס',
    hint: 'השאר בונים תקציב',
    min: 0,
    max: 40,
    step: 1,
    unit: 'pct',
    group: 'mix',
  },
  {
    key: 'mixTurnkeyPct',
    label: 'מהסגירות: עד מפתח',
    hint: 'השאר בונים תקציב',
    min: 0,
    max: 20,
    step: 1,
    unit: 'pct',
    group: 'mix',
  },
  {
    key: 'partnerMrrUplift',
    label: 'תוספת משותפים בחודש',
    hint: 'שדרוגי מסלול, חידושים ושותפים חדשים',
    min: 0,
    max: 30_000,
    step: 500,
    unit: 'nis',
    group: 'partners',
  },
];

/* ------------------------------------------------------------------ */
/* Formatting (Hebrew)                                                 */
/* ------------------------------------------------------------------ */

const NIS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const INT = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });

/** Shekels rounded to the nearest thousand: 458347 -> "‏458,000 ₪". */
export function formatNisRounded(value: number): string {
  return NIS.format(Math.round(value / 1_000) * 1_000);
}

/** Whole shekels: 6900 -> "‏6,900 ₪". */
export function formatNis(value: number): string {
  return NIS.format(Math.round(value));
}

/** Counts: one decimal below 10 ("1.4", "3.6"), whole numbers above ("91", "2,280"). */
export function formatCount(value: number): string {
  return value < 10 ? ONE_DECIMAL.format(value) : INT.format(value);
}

/** A slider value with its unit: "0.8%", "20,000", "‏6,000 ₪". */
export function formatFieldValue(def: Pick<RoiFieldDef, 'unit'>, value: number): string {
  if (def.unit === 'pct') return `${ONE_DECIMAL.format(value)}%`;
  if (def.unit === 'nis') return formatNis(value);
  return INT.format(value);
}
