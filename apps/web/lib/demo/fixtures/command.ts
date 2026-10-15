/**
 * Demo fixture for /platform/demo/command/ (P4, חדר הבקרה) and the admin's
 * "הצג נתוני הדגמה" toggle.
 *
 * It generates RAW inputs, not a finished dashboard: 180 days of leads (so a
 * 90-day view has its previous 90 days to compare with), daily event counts,
 * AI spend, partner exposure and one insight run. commandDemoInputs() then
 * feeds them through the same buildCommandCenter() as real data.
 *
 * Shape of the story (default 30-day view): a pipeline of about ₪1.4M, steady
 * growth, AI spend well under its $3 cap (one TV-spike day 41 days ago hit
 * the cap and degraded gracefully), six fictional partners at different
 * paces, and 46 questions this month on topics the library doesn't answer
 * yet, led by "רצפה צפה" and "מרתף בשטח משופע".
 *
 * Everything is fictional and deterministic (seeded per day, anchored to
 * Israel's today at 11:00). Videos and articles named as nearest content are
 * the owner's real ones.
 */
import { REGIONS } from '@/lib/constants/community';
import type { LeadStatus, LeadType } from '@/lib/db/types';
import { stageKey } from '@/lib/command/dimensions';
import { defaultExpectedValues } from '@/lib/command/pipeline';
import { addDays, inRange, israelMidnight, periodWindow } from '@/lib/command/period';
import type {
  AiUsageDay,
  CommandInputs,
  DailyEventCount,
  InsightTopic,
  LeadFact,
  LeadSource,
  OrderFact,
  PartnerFact,
  PartnerTierId,
  PeriodDays,
  PlanFact,
} from '@/lib/command/types';
import { ISRAELI_WEEK } from '../data';
import { weekdayOf, type DemoGenerator } from '../generator';
import { defineDemoFixture, type DemoFixtureData } from './define';

export const DEMO_DAYS = 180;
const MINUTE = 60_000;
const DAY_MS = 86_400_000;

export const DEMO_PLANS: PlanFact[] = [
  { slug: 'bonim-budget', name: 'בונים תקציב', priceAgorot: 690_000, sortOrder: 1 },
  { slug: 'bonim-bait-plus', name: 'בונים בית פלוס', priceAgorot: 2_900_000, sortOrder: 2 },
  { slug: 'bonim-bait-turnkey', name: 'בונים בית עד מפתח', priceAgorot: 14_100_000, sortOrder: 3 },
];

/** Fictional strategic partners (the revenue squad's demo uses "חלונות הגליל" too). */
export const DEMO_PARTNERS: ReadonlyArray<{ id: string; name: string; tier: PartnerTierId; pace: number; ctr: number; leadWeight: number }> = [
  // pace: delivery vs the tier's monthly target (the Israeli week averages ~0.95 of a weekday).
  { id: 'demo-partner-galil-windows', name: 'חלונות הגליל', tier: 'ambassadors', pace: 1.16, ctr: 0.024, leadWeight: 10 },
  { id: 'demo-partner-emek-kitchens', name: 'מטבחי העמק', tier: 'partners', pace: 1.09, ctr: 0.019, leadWeight: 6 },
  { id: 'demo-partner-sharon-aluminium', name: 'אלומיניום השרון', tier: 'partners', pace: 0.82, ctr: 0.016, leadWeight: 4 },
  { id: 'demo-partner-solar-plus', name: 'סולאר פלוס', tier: 'members', pace: 1.12, ctr: 0.028, leadWeight: 2 },
  { id: 'demo-partner-carmel-parquet', name: 'פרקט הכרמל', tier: 'members', pace: 0.74, ctr: 0.013, leadWeight: 1.5 },
  { id: 'demo-partner-negev-frame', name: 'שלד ובטון הנגב', tier: 'members', pace: 0.46, ctr: 0.011, leadWeight: 0.5 },
];

const TIER_DAILY_TARGET: Record<PartnerTierId, number> = { members: 1_500 / 30, partners: 5_000 / 30, ambassadors: 12_000 / 30 };

const TYPE_WEIGHTS: ReadonlyArray<readonly [LeadType, number]> = [
  ['business_contact', 30],
  ['consultation', 26],
  ['whatsapp_join', 13],
  ['service_plan', 12],
  ['benefit', 8],
  ['partner', 5],
  ['advertise', 2],
  ['join_pro', 2],
  ['contact', 2],
];

const PLAN_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['bonim-budget', 50],
  ['bonim-bait-plus', 30],
  ['bonim-bait-turnkey', 20],
];

/** Real videos the AI answers cite (attributed leads point at them). */
const CITED_VIDEOS = ['5Ju_QoIs1qs', 'Qiyot51Hv8k', 'b1PlXdfVJ9s', 'veSfkwMGtEg', 'dHhH_tdrTLU', '5aT5LvGy7p8', '-uHHq1ZwimM'];
const CAMPAIGNS: ReadonlyArray<readonly [string, string, number]> = [
  ['facebook', 'budget-consult', 5],
  ['instagram', 'tomer-reels', 3],
  ['google', 'search-build-cost', 3],
  ['newsletter', 'weekly', 1],
];

/** Status by age: building sales cycles are long, so most of a month's leads are still open. */
function statusFor(r: { float(a: number, b: number): number }, ageDays: number): LeadStatus {
  const x = r.float(0, 1);
  if (ageDays < 1) return x < 0.7 ? 'new' : 'contacted';
  if (ageDays < 7) return x < 0.1 ? 'new' : x < 0.88 ? 'contacted' : x < 0.91 ? 'won' : x < 0.98 ? 'lost' : 'spam';
  if (ageDays < 30) return x < 0.02 ? 'new' : x < 0.77 ? 'contacted' : x < 0.86 ? 'won' : x < 0.97 ? 'lost' : 'spam';
  if (ageDays < 90) return x < 0.005 ? 'new' : x < 0.5 ? 'contacted' : x < 0.66 ? 'won' : x < 0.96 ? 'lost' : 'spam';
  return x < 0.3 ? 'contacted' : x < 0.5 ? 'won' : x < 0.96 ? 'lost' : 'spam';
}

/** Daytime-weighted share of an Israel day that has passed by 11:00 (traffic starts around 07:00). */
const SHARE_BY_11 = 0.28;

/** Levels below are as of this date; growth runs from it both ways. */
const LEVEL_DATE = '2026-10-15';
const SERIAL_ANCHOR = '2026-01-01';

function dayNumber(date: string, from: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * One day's value from its date alone (seeded per date), so past days stay
 * the same as "today" moves on: level x weekly growth x the Israeli week x noise.
 */
function dailyValue(gen: DemoGenerator, label: string, date: string, o: { level: number; weeklyGrowth: number; noise: number }): number {
  const r = gen.fork(`${label}/${date}`).rng;
  const trend = o.level * Math.pow(1 + o.weeklyGrowth, dayNumber(date, LEVEL_DATE) / 7);
  return Math.max(0, trend * ISRAELI_WEEK[weekdayOf(date)] * Math.max(0.2, 1 + r.normal(0, o.noise)));
}

function topic(
  t: Omit<InsightTopic, 'questionCount' | 'visitors' | 'trendPct' | 'coverage' | 'levelSource' | 'avgConfidence'> & { questionCount?: number },
): InsightTopic {
  const coverage = Math.round(Math.max(0, Math.min(1, (t.topSimilarity - 0.4) / 0.25)) * 100) / 100;
  return {
    ...t,
    questionCount: t.questionCount ?? Math.max(1, Math.round(t.asks / 3)),
    visitors: Math.max(1, Math.round(t.asks * 0.92)),
    trendPct: t.asksPrevWeek > 0 ? Math.round(((t.asksThisWeek - t.asksPrevWeek) / t.asksPrevWeek) * 100) : null,
    coverage,
    levelSource: 'review',
    avgConfidence: null,
  };
}

const v = (id: string, title: string, similarity: number, startS: number | null = null) => ({
  kind: 'video' as const,
  id,
  title,
  href: `/video/${id}/${startS ? `?t=${startS}` : ''}`,
  similarity,
  startS,
});
const p = (slug: string, title: string, similarity: number) => ({ kind: 'post' as const, id: slug, title, href: `/${slug}/`, similarity, startS: null });

/** One insight run: 10 topics without a good answer (46 asks this month) and 8 the library already covers. */
export const DEMO_TOPICS: InsightTopic[] = [
  topic({
    id: 'demo-topic-floating-floor',
    rank: 9,
    label: 'רצפה צפה: עלות ובידוד',
    suggestedTitle: 'רצפה צפה: כמה זה עולה ב-2026 ומתי זה באמת שווה',
    asks: 14,
    asksThisWeek: 5,
    asksPrevWeek: 3,
    topSimilarity: 0.5,
    level: 'partial',
    levelReason: 'יש סרטון מבוא, אבל בלי מחירים ובלי בידוד בין קומות',
    examples: [
      { q: 'כמה עולה רצפה צפה למטר?', asks: 6 },
      { q: 'האם רצפה צפה באמת מונעת רעשים בין קומות?', asks: 4 },
      { q: 'מה העובי של רצפה צפה עם חימום תת רצפתי?', asks: 4 },
    ],
    nearest: [v('5RNVyFYpkCw', 'רצפה צפה - מה זה בכלל, ומה היתרונות שלה?!', 0.51, 95), p('thermal-acoustic-insulation-complete-guide', 'בידוד תרמי ואקוסטי בבית פרטי – כל מה שצריך לדעת לפני שבונים', 0.49)],
  }),
  topic({
    id: 'demo-topic-sloped-basement',
    rank: 12,
    label: 'מרתף בשטח משופע',
    suggestedTitle: 'מרתף במגרש משופע: מה בונים, איך מנקזים וכמה זה עולה',
    asks: 9,
    asksThisWeek: 4,
    asksPrevWeek: 2,
    topSimilarity: 0.45,
    level: 'gap',
    levelReason: 'הסרטונים על מרתף לא עוסקים במגרש בשיפוע',
    examples: [
      { q: 'מרתף בשטח משופע - איך מתכננים?', asks: 3 },
      { q: 'כמה עולה מרתף במגרש בשיפוע?', asks: 3 },
      { q: 'חצי מרתף במגרש בשיפוע, איך מנקזים מים?', asks: 2 },
      { q: 'האם מרתף בשטח משופע נחשב קומה בהיתר?', asks: 1 },
    ],
    nearest: [v('5Ju_QoIs1qs', 'חפירת מרתף - הכנות לבניית מרתף | כמה עולה?!', 0.46, 210), v('090wzHHfBsM', 'מכינים קיר דיפון - מה חשוב להבין לפני שמבצעים מרתף?! (2023)', 0.44)],
  }),
  topic({
    id: 'demo-topic-protected-trees',
    rank: 15,
    label: 'עצים מוגנים במגרש',
    suggestedTitle: 'עץ מוגן במגרש: מה עושים לפני ההיתר ומי מאשר כריתה',
    asks: 5,
    asksThisWeek: 2,
    asksPrevWeek: 1,
    topSimilarity: 0.44,
    level: 'gap',
    levelReason: 'אין תוכן על עצים מוגנים או רישיון כריתה',
    examples: [
      { q: 'יש עץ מוגן במגרש - מה עושים?', asks: 3 },
      { q: 'איך מקבלים רישיון לכריתת עץ לפני בנייה?', asks: 2 },
    ],
    nearest: [p('site-development-earthworks-topography-guide', 'פיתוח שטח בבנייה פרטית – המדריך המלא לטופוגרפיה, עבודות עפר ועלויות', 0.44)],
  }),
  topic({
    id: 'demo-topic-ev-charger',
    rank: 16,
    label: 'עמדת טעינה לרכב חשמלי',
    suggestedTitle: 'עמדת טעינה ביתית: מה מכינים בחשמל כבר בשלב השלד',
    asks: 4,
    asksThisWeek: 2,
    asksPrevWeek: 0,
    topSimilarity: 0.48,
    level: 'gap',
    levelReason: 'המאמר על חשמל לא מזכיר עמדות טעינה',
    examples: [
      { q: 'עמדת טעינה לרכב חשמלי בבית - מה מכינים בחשמל?', asks: 2 },
      { q: 'צריך חיבור תלת פאזי לעמדת טעינה?', asks: 2 },
    ],
    nearest: [p('electrical-planning-tips-private-home', 'חשמל בבית פרטי – טיפים לתכנון נכון מכנס בונים בית', 0.48)],
  }),
  topic({
    id: 'demo-topic-utility-hookups',
    rank: 17,
    label: 'חיבור לביוב ולמים במגרש חדש',
    suggestedTitle: 'חיבור מגרש חדש למים, ביוב וחשמל: הסדר, הזמנים והאגרות',
    asks: 4,
    asksThisWeek: 1,
    asksPrevWeek: 2,
    topSimilarity: 0.5,
    level: 'partial',
    levelReason: 'המאמר על אגרות מזכיר תשלומים, לא את תהליך החיבור',
    examples: [
      { q: 'כמה עולה חיבור לביוב במגרש חדש?', asks: 2 },
      { q: 'חיבור מים וחשמל למגרש - ממי מבקשים?', asks: 2 },
    ],
    nearest: [p('אגרות-בניה-והיטלים-בית-פרטי', 'אגרות בניה והיטלים בית פרטי', 0.5)],
  }),
  topic({
    id: 'demo-topic-accessible-home',
    rank: 18,
    label: 'בית נגיש לכיסא גלגלים',
    suggestedTitle: 'בית נגיש מהיום הראשון: דלתות, מקלחת בלי מדרגה ומה זה עולה',
    asks: 3,
    asksThisWeek: 1,
    asksPrevWeek: 1,
    topSimilarity: 0.46,
    level: 'gap',
    levelReason: 'אין תוכן על תכנון נגיש',
    examples: [
      { q: 'איך מתכננים בית נגיש לכיסא גלגלים?', asks: 2 },
      { q: 'מקלחת נגישה בלי מדרגה - איך עושים?', asks: 1 },
    ],
    nearest: [p('interior-design-tips-fixing-mistakes', 'עיצוב פנים לבית – טיפים מהשטח ותיקון טעויות תכנוניות', 0.46)],
  }),
  topic({
    id: 'demo-topic-timber-house',
    rank: 19,
    label: 'בית מעץ בישראל',
    suggestedTitle: 'בית מעץ בישראל: מחזיק? מה ההבדל מבנייה קלה, ומה המחיר',
    asks: 3,
    asksThisWeek: 1,
    asksPrevWeek: 1,
    topSimilarity: 0.53,
    level: 'partial',
    levelReason: 'יש תוכן על בנייה קלה מפלדה, לא על עץ',
    examples: [
      { q: 'בית מעץ בישראל - זה מחזיק?', asks: 2 },
      { q: 'כמה עולה לבנות בית מעץ?', asks: 1 },
    ],
    nearest: [p('advanced-light-construction-boards-budget', 'בנייה קלה מתקדמת – מה חשוב לדעת על לוחות, תקציב ושן בטון לפני שמתחילים', 0.53)],
  }),
  topic({
    id: 'demo-topic-retaining-walls',
    rank: 20,
    label: 'קירות תמך בחצר משופעת',
    suggestedTitle: 'קיר תמך בחצר: מתי צריך מהנדס ומה זה עולה',
    asks: 2,
    asksThisWeek: 1,
    asksPrevWeek: 0,
    topSimilarity: 0.45,
    level: 'gap',
    levelReason: 'אין תוכן על קירות תמך',
    examples: [{ q: 'קיר תומך בחצר משופעת - כמה עולה?', asks: 2 }],
    nearest: [p('site-development-earthworks-topography-guide', 'פיתוח שטח בבנייה פרטית – המדריך המלא לטופוגרפיה, עבודות עפר ועלויות', 0.45)],
  }),
  topic({
    id: 'demo-topic-neighbour-fence',
    rank: 21,
    label: 'גדר בין שכנים',
    suggestedTitle: 'גדר בין מגרשים: מי משלם, מה מותר ואיך לא לריב עם השכן',
    asks: 1,
    asksThisWeek: 1,
    asksPrevWeek: 0,
    topSimilarity: 0.42,
    level: 'gap',
    levelReason: 'אין תוכן על גדרות בין שכנים',
    examples: [{ q: 'מי משלם על גדר בין שני מגרשים?', asks: 1 }],
    nearest: [],
  }),
  topic({
    id: 'demo-topic-roof-terrace',
    rank: 22,
    label: 'מרפסת גג מעל גג רעפים',
    suggestedTitle: 'מרפסת שמש לצד גג רעפים: איטום, ניקוז וחוקי הבנייה',
    asks: 1,
    asksThisWeek: 0,
    asksPrevWeek: 1,
    topSimilarity: 0.49,
    level: 'partial',
    levelReason: 'הסרטון על גג רעפים לא מדבר על מרפסות',
    examples: [{ q: 'אפשר מרפסת שמש ליד גג רעפים?', asks: 1 }],
    nearest: [v('dHhH_tdrTLU', 'מתחילים גג רעפים חשוף! פרק 1', 0.49)],
  }),
  // Covered: the library already answers these well.
  topic({
    id: 'demo-topic-frame-cost',
    rank: 1,
    label: 'עלות שלד לבית',
    suggestedTitle: null,
    asks: 412,
    asksThisWeek: 104,
    asksPrevWeek: 96,
    topSimilarity: 0.62,
    level: 'covered',
    levelReason: 'מאמר מחירים מפורט ועדכני',
    examples: [{ q: 'כמה עולה שלד לבית של 200 מ״ר?', asks: 188 }],
    nearest: [p('sheled-2', 'עלות קבלן שלד', 0.62), p('cost-build-private-house-2026', 'כמה עולה לבנות בית פרטי ב-2026? תכנון, שלד, גמרים ומה לא כלול', 0.6)],
  }),
  topic({
    id: 'demo-topic-mortgage',
    rank: 2,
    label: 'משכנתא לבנייה עצמית',
    suggestedTitle: null,
    asks: 268,
    asksThisWeek: 70,
    asksPrevWeek: 64,
    topSimilarity: 0.64,
    level: 'covered',
    levelReason: 'מדריך מלא עם צחי גרוסמן',
    examples: [{ q: 'איך מקבלים משכנתא לבנייה עצמית?', asks: 120 }],
    nearest: [p('construction-mortgage-complete-guide-grossman', 'משכנתא לבנייה עצמית – המדריך המלא עם צחי גרוסמן | כל מה שהבנק לא מספר', 0.64)],
  }),
  topic({
    id: 'demo-topic-betterment',
    rank: 3,
    label: 'היטל השבחה',
    suggestedTitle: null,
    asks: 190,
    asksThisWeek: 44,
    asksPrevWeek: 49,
    topSimilarity: 0.58,
    level: 'covered',
    levelReason: 'מאמר ייעודי',
    examples: [{ q: 'מה זה היטל השבחה ומי משלם?', asks: 90 }],
    nearest: [p('hetel', 'היטל השבחה', 0.58)],
  }),
  topic({
    id: 'demo-topic-underfloor',
    rank: 4,
    label: 'חימום תת רצפתי',
    suggestedTitle: null,
    asks: 176,
    asksThisWeek: 49,
    asksPrevWeek: 38,
    topSimilarity: 0.63,
    level: 'covered',
    levelReason: 'מאמר מחירים וסרטון התקנה',
    examples: [{ q: 'חימום תת רצפתי או מזגנים, מה עדיף?', asks: 70 }],
    nearest: [p('underfloor-water-heating-costs-guide', 'חימום תת רצפתי במים: כמה עולה, מה לבדוק ואיך לבחור נכון', 0.63), v('b1PlXdfVJ9s', 'מתקינים משאבת חום לחימום תת רצפתי במים - אז מה קורה ביום הזה?!', 0.55)],
  }),
  topic({
    id: 'demo-topic-roof',
    rank: 5,
    label: 'גג רעפים או גג שטוח',
    suggestedTitle: null,
    asks: 151,
    asksThisWeek: 37,
    asksPrevWeek: 35,
    topSimilarity: 0.65,
    level: 'covered',
    levelReason: 'מפרט מלא וסרטוני ביצוע',
    examples: [{ q: 'גג רעפים או גג שטוח, מה עדיף?', asks: 80 }],
    nearest: [p('quality-roof-specs-contractors-hide', 'גג רעפים – המפרט האיכותי שקבלנים לא מספרים לכם', 0.65)],
  }),
  topic({
    id: 'demo-topic-architect',
    rank: 6,
    label: 'בחירת אדריכל',
    suggestedTitle: null,
    asks: 133,
    asksThisWeek: 31,
    asksPrevWeek: 34,
    topSimilarity: 0.61,
    level: 'covered',
    levelReason: 'כמה מדריכים ושיחות עם אדריכלים',
    examples: [{ q: 'איך בוחרים אדריכל לבית פרטי?', asks: 61 }],
    nearest: [p('choosing-architect-guide', 'איך לבחור אדריכל לבית פרטי – עלויות, טעויות וטיפים מ-4 אדריכלים', 0.61)],
  }),
  topic({
    id: 'demo-topic-form4',
    rank: 7,
    label: 'טופס 4',
    suggestedTitle: null,
    asks: 97,
    asksThisWeek: 25,
    asksPrevWeek: 21,
    topSimilarity: 0.62,
    level: 'covered',
    levelReason: 'מאמר ייעודי ומדריך התהליך',
    examples: [{ q: 'מה צריך כדי לקבל טופס 4?', asks: 50 }],
    nearest: [p('tofes4', 'מה זה טופס 4 ואיך נתכונן לקראתו', 0.62)],
  }),
  topic({
    id: 'demo-topic-windows',
    rank: 8,
    label: 'חלונות אלומיניום',
    suggestedTitle: null,
    asks: 88,
    asksThisWeek: 23,
    asksPrevWeek: 20,
    topSimilarity: 0.57,
    level: 'covered',
    levelReason: 'השוואת קליל ואלובין',
    examples: [{ q: 'חלונות קליל או בלגי - מה ההבדל?', asks: 40 }],
    nearest: [p('חלונות-אלומיניום-קליל-מול-אלובין', 'חלונות אלומיניום – קליל מול אלובין, איך בוחרים נכון?', 0.57)],
  }),
].sort((a, b) => a.rank - b.rank);

export const commandDemo = defineDemoFixture('command', ({ gen, today }) => {
  const nowMs = israelMidnight(today) + 11 * 60 * MINUTE;
  const days = Array.from({ length: DEMO_DAYS }, (_, i) => addDays(today, i - (DEMO_DAYS - 1)));
  const spikeDay = days[DEMO_DAYS - 1 - 41];

  // --- Leads -------------------------------------------------------------------------
  const partnerPick = DEMO_PARTNERS.map((p) => [p.id, p.leadWeight] as const);
  const leads: LeadFact[] = [];
  for (const date of days) {
    const point = { date, value: Math.round(dailyValue(gen, 'lead-volume', date, { level: 33, weeklyGrowth: 0.011, noise: 0.14 })) };
    const isToday = point.date === today;
    const count = isToday ? Math.round(point.value * SHARE_BY_11) : point.value;
    // Refs grow with time and never depend on the window: 64 numbers per day.
    const serialBase = 1000 + dayNumber(point.date, SERIAL_ANCHOR) * 64;
    const day = gen.fork(`leads/${point.date}`);
    const r = day.rng;
    const midnight = israelMidnight(point.date);
    for (let j = 0; j < count; j++) {
      const type = r.weighted(TYPE_WEIGHTS);
      const base = day.lead({ type, withinMinutes: 10 });
      const minuteOfDay = isToday ? r.int(7 * 60, 10 * 60 + 50) : r.weighted([[r.int(7 * 60, 12 * 60), 4], [r.int(12 * 60, 18 * 60), 5], [r.int(18 * 60, 23 * 60 + 30), 6]]);
      const createdMs = midnight + minuteOfDay * MINUTE;
      const ageDays = (nowMs - createdMs) / DAY_MS;
      const status = statusFor(r, ageDays);
      const responseMinutes = Math.round(Math.min(72 * 60, Math.max(3, Math.exp(r.normal(Math.log(140), 1.15)))));
      const responded = status !== 'new' && createdMs + responseMinutes * MINUTE < nowMs;
      let source: LeadSource;
      let sourcePath: string | null = null;
      switch (base.source.key) {
        case 'advisor': {
          const vid = r.pick(CITED_VIDEOS);
          source = { medium: 'ai_source', source: `video:${vid}`, campaign: null, label: 'סרטון בתשובה' };
          sourcePath = '/search/';
          break;
        }
        case 'partner': {
          const pid = r.weighted(partnerPick);
          const name = DEMO_PARTNERS.find((x) => x.id === pid)!.name;
          source = { medium: 'partner', source: pid, campaign: null, label: `שותף: ${name}` };
          break;
        }
        case 'consultation': {
          const [src, campaign] = r.weighted(CAMPAIGNS.map((c) => [c, c[2]] as const));
          source = { medium: 'campaign', source: src, campaign, label: `קמפיין: ${src} (${campaign})` };
          break;
        }
        case 'whatsapp':
          source = { medium: 'referral', source: 'chat.whatsapp.com', campaign: null, label: 'הפניה מאתר: chat.whatsapp.com' };
          break;
        case 'planner':
          source = { medium: 'direct', source: null, campaign: null, label: 'ישיר' };
          sourcePath = '/calculator/';
          break;
        default:
          source = { medium: 'direct', source: null, campaign: null, label: 'ישיר' };
          sourcePath = type === 'business_contact' ? `/business/${base.specialty?.slug ?? 'pro'}/` : '/';
      }
      leads.push({
        id: base.id,
        ref: `BB-${point.date.slice(2, 4)}-${String(serialBase + j).padStart(6, '0')}`,
        type,
        status,
        createdAt: new Date(createdMs).toISOString(),
        firstResponseAt: responded ? new Date(createdMs + responseMinutes * MINUTE).toISOString() : null,
        stage: stageKey(base.stage.value),
        regionSlug: base.place.regionSlug,
        sizeM2: type === 'whatsapp_join' || type === 'benefit' ? null : base.sizeSqm,
        budgetLabel: type === 'consultation' || type === 'service_plan' || type === 'business_contact' ? base.budgetBand : null,
        // The generator's scores run high (and pile up at its 98 cap) for a whole funnel: compress
        // them with a little jitter so about a quarter are hot (70+) and the top isn't one value.
        score:
          type === 'whatsapp_join' || type === 'benefit' || type === 'contact'
            ? null
            : Math.max(18, Math.min(97, Math.round(base.score * 0.88 + r.normal(0, 3.5) - 2))),
        scoreReasons: type === 'whatsapp_join' || type === 'benefit' || type === 'contact' ? [] : scoreReasons(base.stage.value, base.budgetBand, base.question),
        planSlug: type === 'service_plan' ? r.weighted(PLAN_WEIGHTS) : null,
        source,
        sourcePath,
      });
    }
  }

  // --- Daily events ------------------------------------------------------------------
  const events: DailyEventCount[] = [];
  const aiUsage: AiUsageDay[] = [];
  const leadsPerDay = new Map<string, number>();
  for (const l of leads) {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(l.createdAt));
    leadsPerDay.set(d, (leadsPerDay.get(d) ?? 0) + 1);
  }
  for (let i = 0; i < DEMO_DAYS; i++) {
    const date = days[i];
    const isToday = date === today;
    const share = isToday ? SHARE_BY_11 : 1;
    const spike = date === spikeDay ? 3.4 : 1;
    const requested = Math.round(dailyValue(gen, 'asked', date, { level: 205, weeklyGrowth: 0.024, noise: 0.1 }) * spike * share);
    // On the spike day the $3 cap kicked in mid-afternoon: later questions got sources only (no answer_completed).
    const costPerAnswer = 0.0098;
    const uncapped = requested * costPerAnswer;
    const capped = Math.min(3, uncapped);
    const completed = uncapped > 3 ? Math.round(3 / costPerAnswer) : Math.round(requested * 0.97);
    const bookings = Math.round(dailyValue(gen, 'booked', date, { level: 5.6, weeklyGrowth: 0.012, noise: 0.35 }) * share);
    events.push(
      { day: date, name: 'answer_requested', events: requested, visitors: Math.round(requested * 0.82) },
      { day: date, name: 'answer_completed', events: completed, visitors: Math.round(completed * 0.82) },
      { day: date, name: 'search_submitted', events: Math.round(requested * 1.55), visitors: Math.round(requested * 1.2) },
      { day: date, name: 'consult_booked', events: Math.round(bookings * 1.1), visitors: bookings },
      { day: date, name: 'lead_submitted', events: leadsPerDay.get(date) ?? 0, visitors: leadsPerDay.get(date) ?? 0 },
    );
    aiUsage.push({ day: date, costUsd: Math.round(capped * 1e4) / 1e4, calls: requested * 2, answerCalls: completed });
  }

  // --- Partners: daily viewable impressions and clicks ----------------------------------
  const partnerDaily = DEMO_PARTNERS.map((partner) => {
    const target = TIER_DAILY_TARGET[partner.tier] * partner.pace;
    return {
      id: partner.id,
      name: partner.name,
      tier: partner.tier,
      impressions: days.map((date) => {
        const value = dailyValue(gen, `partner/${partner.id}`, date, { level: target, weeklyGrowth: 0.006, noise: 0.18 });
        return Math.round(date === today ? value * SHARE_BY_11 : value);
      }),
      ctr: partner.ctr,
    };
  });

  // --- Plan orders ----------------------------------------------------------------------
  const orders: OrderFact[] = [];
  for (const date of days) {
    if (date === today) continue;
    const ordersRng = gen.fork(`orders/${date}`).rng;
    const createdAt = new Date(israelMidnight(date) + ordersRng.int(9 * 60, 22 * 60) * MINUTE).toISOString();
    if (ordersRng.bool(0.16)) {
      const status = ordersRng.weighted([['paid', 86], ['pending', 9], ['failed', 5]] as const);
      orders.push({ id: ordersRng.uuid(), createdAt, status, totalAgorot: 814_200, planItems: [{ planSlug: 'bonim-budget', totalAgorot: 814_200 }] });
    }
    if (ordersRng.bool(0.025)) {
      orders.push({ id: ordersRng.uuid(), createdAt, status: 'paid', totalAgorot: 3_422_000, planItems: [{ planSlug: 'bonim-bait-plus', totalAgorot: 3_422_000 }] });
    }
  }

  return {
    now: new Date(nowMs).toISOString(),
    days,
    leads,
    events,
    aiUsage,
    partnerDaily,
    orders,
  };
});

export type CommandDemoData = DemoFixtureData<typeof commandDemo>;

function scoreReasons(stage: string, budgetBand: string, question: string | null): string[] {
  const out: string[] = [];
  if (stage === 'tender' || stage === 'frame') out.push('בשלב היתר או שלד: צריכים החלטות עכשיו');
  else if (stage === 'planning') out.push('בשלב תכנון');
  if (/2\.5|3\.5|מעל/.test(budgetBand)) out.push('תקציב גבוה');
  if (question) out.push('שאל על עלויות וקבלנים');
  return out.slice(0, 3);
}

/** Region names for the demo (the 14 canonical regions). */
const REGION_NAMES = Object.fromEntries(REGIONS.map((r) => [r.slug, r.name]));

/** The fixture as Command Center inputs for one period (same builder as real data). */
export function commandDemoInputs(data: CommandDemoData, periodDays: PeriodDays): CommandInputs {
  const window = periodWindow(data.now, periodDays);
  const sumIn = (values: readonly number[], from: string, to: string, ctr = 1) => {
    let total = 0;
    data.days.forEach((d, i) => {
      const at = israelMidnight(d) + 12 * 60 * MINUTE;
      if (inRange(at, from, to)) total += values[i] * ctr;
    });
    return Math.round(total);
  };
  const partnerLeads = (id: string, from: string, to: string) =>
    data.leads.filter((l) => l.source.medium === 'partner' && l.source.source === id && l.status !== 'spam' && inRange(l.createdAt, from, to)).length;
  const partners: PartnerFact[] = data.partnerDaily.map((p) => ({
    id: p.id,
    name: p.name,
    tier: p.tier,
    impressions: sumIn(p.impressions, window.from, window.to),
    clicks: sumIn(p.impressions, window.from, window.to, p.ctr),
    leads: partnerLeads(p.id, window.from, window.to),
    prevImpressions: sumIn(p.impressions, window.prevFrom, window.prevTo),
    prevClicks: sumIn(p.impressions, window.prevFrom, window.prevTo, p.ctr),
    prevLeads: partnerLeads(p.id, window.prevFrom, window.prevTo),
  }));
  const todayUtc = new Date(data.now).toISOString().slice(0, 10);
  const today = data.days[data.days.length - 1];
  return {
    now: data.now,
    periodDays,
    leads: data.leads,
    plans: DEMO_PLANS,
    orders: data.orders,
    events: data.events,
    aiUsage: data.aiUsage,
    aiBudgetUsd: 3,
    aiSpentTodayUsd: data.aiUsage.find((u) => u.day === today || u.day === todayUtc)?.costUsd ?? 0,
    partners,
    expectedValues: defaultExpectedValues(DEMO_PLANS),
    insights: {
      run: {
        id: 'demo-run',
        status: 'done',
        startedAt: new Date(Date.parse(data.now) - 3 * 60 * MINUTE).toISOString(),
        finishedAt: new Date(Date.parse(data.now) - 3 * 60 * MINUTE + 24_000).toISOString(),
        questionCount: 1_284,
        // Every question asked in the run's 30 days, not only the topics listed.
        askCount: data.events
          .filter((e) => e.name === 'answer_requested' && e.day >= data.days[data.days.length - 30])
          .reduce((a, e) => a + e.visitors, 0),
        topicCount: DEMO_TOPICS.length,
        costUsd: 0.0041,
        message: null,
      },
      topics: DEMO_TOPICS,
    },
    topQuestions: [],
    regionNames: REGION_NAMES,
    pending: {
      newLeads: data.leads.filter((l) => l.status === 'new').length,
      pendingReviews: 4,
      pendingBusinesses: 2,
      openRequests: 3,
    },
  };
}
