// ============================================================
// 20 pre-defined budget scenarios, one per /calculator/[slug] page (SEO).
// Each runs through the budget planner (lib/planner/engine.ts) with the current
// price book, so the numbers follow the owner's 2026 figures and any admin edit.
// Slugs and titles are stable (they are indexed URLs).
// ============================================================

import type { PlannerInput } from '@/lib/planner/types';

export interface CalculatorScenario {
  slug: string;
  title: string; // Hebrew SEO title
  description: string; // Hebrew meta description
  input: PlannerInput;
  /** What this scenario shows, in the owner's words (sourced). */
  note?: string;
  /** The owner's article to read next. */
  readMore?: { title: string; href: string };
  /** Slugs of 3-4 related scenarios for internal linking */
  relatedSlugs: string[];
}

const base = { floors: 2, regionSlug: 'center', finishLevel: 'standard', extras: [] } as const;

function input(sizeM2: number, patch: Partial<PlannerInput> = {}): PlannerInput {
  return { ...base, extras: [], sizeM2, ...patch } as PlannerInput;
}

const FLOORS_NOTE =
  'בית בקומה אחת יקר יותר בשלד מבית של שתי קומות באותו שטח: יותר יסודות, יותר רצפה ויותר גג. לבית של 300 מ״ר המטר הקבלני הוא 450 בקומה אחת, 375 בשתי קומות ו-350 בשלוש.';
const METHOD_NOTE =
  'המחשבון מתמחר לפי מ״ר, רמת גמר ואזור. שיטת הבנייה משנה בעיקר את משך השלד ואת המחיר שלו, ואת ההפרש המדויק בודקים בהצעות מחיר מול תוכניות סגורות.';
const REGION_NOTE =
  'אין "מחיר אזורי" אחד: הטווח של ±15% מכסה את ההבדלים בין רוב האזורים. החריג הבולט היום הוא הדרום, שבו בגלל מצוקת כוח אדם המחירים גבוהים יותר מבשרון.';

export const SCENARIOS: CalculatorScenario[] = [
  // --- Vary by size ---
  {
    slug: 'beit-100-meter-standard',
    title: 'עלות בניית בית 100 מ״ר - סטנדרט',
    description: 'כמה עולה לבנות בית פרטי של 100 מ״ר בגמר סטנדרטי ב-2026? טווח עלות לתכנון ובנייה לפי 7 שלבי הבנייה, לפי הנתונים של בונים בית.',
    input: input(100, { floors: 1 }),
    note: FLOORS_NOTE,
    relatedSlugs: ['beit-120-meter-standard', 'beit-150-meter-standard', 'beit-120-taksiv-namuch'],
  },
  {
    slug: 'beit-120-meter-standard',
    title: 'עלות בניית בית 120 מ״ר - סטנדרט',
    description: 'כמה עולה לבנות בית פרטי של 120 מ״ר בגמר סטנדרטי? פירוט לפי שלבים: תכנון ואגרות, שלד, תשתיות וגמרים. נכון ל-2026.',
    input: input(120, { floors: 1 }),
    relatedSlugs: ['beit-100-meter-standard', 'beit-150-meter-standard', 'beit-120-taksiv-namuch', 'beit-plada-120'],
  },
  {
    slug: 'beit-150-meter-standard',
    title: 'עלות בניית בית 150 מ״ר - סטנדרט',
    description: 'מחשבון עלויות בנייה לבית 150 מ״ר בגמר סטנדרטי: טווח לתכנון ובנייה, פירוק לפי שלבים ומה לא כלול. נכון ל-2026.',
    input: input(150),
    relatedSlugs: ['beit-150-koma-achat', 'beit-150-merkaz', 'beit-beton-150', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-180-meter-gavoa',
    title: 'עלות בניית בית 180 מ״ר - גימור גבוה',
    description: 'כמה עולה לבנות בית 180 מ״ר בגמר גבוה? ויטרינות, נגרות בהתאמה ומערכות מתקדמות: טווח עלות לפי שלבים, נכון ל-2026.',
    input: input(180, { finishLevel: 'high' }),
    relatedSlugs: ['beit-200-meter-standard', 'beit-250-meter-yokra', 'beit-yokra-im-breicha', 'beit-150-meter-standard'],
  },
  {
    slug: 'beit-200-meter-standard',
    title: 'עלות בניית בית 200 מ״ר - סטנדרט',
    description: 'כמה עולה לבנות בית פרטי של 200 מ״ר ב-2026? לפי בונים בית: כ-12-14 אלף ₪ למ״ר לתכנון ובנייה, ושלד של כ-800 אלף. הטווח המלא לפי שלבים.',
    input: input(200),
    note: 'זה הבית שתומר וצורי משתמשים בו כדוגמה: 200 מ״ר כפול 13 אלף ₪ למ״ר הם 2.6 מיליון לתכנון ובנייה, לפני מע״מ, לפני מגרש ולפני אכלוס. השלד לבד בממוצע כ-800 אלף.',
    readMore: { title: 'כמה עולה לבנות בית פרטי ב-2026? תכנון, שלד, גמרים ומה לא כלול', href: '/cost-build-private-house-2026/' },
    relatedSlugs: ['beit-200-shtei-komot', 'beit-200-im-martef', 'beit-200-kol-hatosfot', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-250-meter-yokra',
    title: 'עלות בניית בית 250 מ״ר - יוקרה',
    description: 'כמה עולה לבנות בית יוקרה של 250 מ״ר? בבתים יוקרתיים העלות מגיעה ל-18 אלף ₪ למ״ר ויותר. טווח מלא לפי שלבים, נכון ל-2026.',
    input: input(250, { finishLevel: 'luxury' }),
    relatedSlugs: ['beit-yokra-im-breicha', 'beit-200-kol-hatosfot', 'beit-180-meter-gavoa', 'beit-200-meter-standard'],
  },

  // --- Vary by floors ---
  {
    slug: 'beit-150-koma-achat',
    title: 'עלות בניית בית קומה אחת 150 מ״ר',
    description: 'כמה עולה לבנות בית קומה אחת של 150 מ״ר? למה השלד בקומה אחת יקר יותר, ופירוט עלויות מלא לפי שלבים. נכון ל-2026.',
    input: input(150, { floors: 1 }),
    note: FLOORS_NOTE,
    readMore: { title: 'מה משפיע על עלויות הבנייה? מטר קבלן, חומרים ועבודה', href: '/factors-affecting-construction-costs/' },
    relatedSlugs: ['beit-200-shtei-komot', 'beit-150-meter-standard', 'beit-200-im-martef'],
  },
  {
    slug: 'beit-200-shtei-komot',
    title: 'עלות בניית בית 2 קומות 200 מ״ר',
    description: 'עלות בניית בית דו-קומתי של 200 מ״ר ב-2026: טווח לתכנון ובנייה, השלד, התשתיות והגמרים, ומה לא נכנס לסכום.',
    input: input(200),
    note: FLOORS_NOTE,
    relatedSlugs: ['beit-150-koma-achat', 'beit-200-im-martef', 'beit-200-meter-standard'],
  },
  {
    slug: 'beit-200-im-martef',
    title: 'עלות בניית בית עם מרתף 200 מ״ר',
    description: 'כמה עולה לבנות בית 200 מ״ר עם מרתף? מרתף מוסיף 700-800 אלף ₪, ויכול להפוך ליחידה מניבה. טווח מלא לפי שלבים, נכון ל-2026.',
    input: input(200, { extras: ['basement'] }),
    note: 'מרתף מוסיף 700-800 אלף ₪ לעלויות הבנייה. אם יש ביקוש לשכירות ביישוב, יחידת דיור מניבה 4,000-5,000 ₪ בחודש, שמכסים את המשכנתא הנוספת. בודקים קודם: ביקוש, סוג קרקע ואפשרות מימון.',
    readMore: { title: 'בניית מרתף – חפירה, הכנות ועלויות אמיתיות מהשטח', href: '/basement-construction-costs/' },
    relatedSlugs: ['beit-200-shtei-komot', 'beit-200-kol-hatosfot', 'beit-200-meter-standard', 'beit-yokra-im-breicha'],
  },

  // --- Vary by construction method ---
  {
    slug: 'beit-beton-150',
    title: 'עלות בניית בית בטון 150 מ״ר',
    description: 'כמה עולה לבנות בית בטון של 150 מ״ר? טווח עלות לתכנון ובנייה לפי שלבים, ומה שיטת הבנייה משנה. נכון ל-2026.',
    input: input(150, { floors: 1 }),
    note: METHOD_NOTE,
    readMore: { title: 'בטון לבית פרטי 2026: סוגים, מחירים, מה לבקש מהקבלן וטעויות שעולות עשרות אלפים', href: '/concrete-home-2026-types-prices-mistakes/' },
    relatedSlugs: ['beit-tromi-180', 'beit-plada-120', 'beit-150-meter-standard'],
  },
  {
    slug: 'beit-tromi-180',
    title: 'עלות בניית בית טרומי 180 מ״ר',
    description: 'כמה עולה לבנות בית טרומי של 180 מ״ר? טווח עלות לתכנון ובנייה לפי שלבים, ומה שיטת הבנייה משנה בזמנים. נכון ל-2026.',
    input: input(180),
    note: METHOD_NOTE,
    readMore: { title: 'בנייה מתקדמת לבית פרטי 2026: עלויות, שיטות, בידוד ומה באמת ההבדל', href: '/advanced-home-construction-2026/' },
    relatedSlugs: ['beit-beton-150', 'beit-plada-120', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-plada-120',
    title: 'עלות בניית בית שלד פלדה 120 מ״ר',
    description: 'כמה עולה לבנות בית בשלד פלדה של 120 מ״ר? טווח עלות לתכנון ובנייה, ולמה שלד פלדה עולה בשבועות במקום חודשים. נכון ל-2026.',
    input: input(120, { floors: 1 }),
    note: `${METHOD_NOTE} בשלד פלדה דקת דופן השלד עולה תוך שבועיים, מול 3-6 חודשים בבנייה רגילה.`,
    readMore: { title: 'שלד פלדה דקת דופן – סיור בבית של 200 מ"ר שהוקם בשבועיים', href: '/steel-frame-house-built-two-weeks/' },
    relatedSlugs: ['beit-beton-150', 'beit-tromi-180', 'beit-120-meter-standard'],
  },

  // --- Vary by region ---
  {
    slug: 'beit-150-merkaz',
    title: 'עלות בניית בית 150 מ״ר באזור המרכז',
    description: 'עלויות בנייה לבית 150 מ״ר באזור המרכז ב-2026: טווח לתכנון ובנייה לפי שלבים, ומה ההבדל מול הצפון, הדרום וירושלים.',
    input: input(150),
    note: REGION_NOTE,
    relatedSlugs: ['beit-150-tsfon', 'beit-150-darom', 'beit-150-yerushalayim', 'beit-150-meter-standard'],
  },
  {
    slug: 'beit-150-tsfon',
    title: 'עלות בניית בית 150 מ״ר בצפון',
    description: 'כמה עולה לבנות בית 150 מ״ר בצפון? טווח עלות לתכנון ובנייה לפי שלבים, נכון ל-2026, והשוואה למרכז ולדרום.',
    input: input(150, { regionSlug: 'lower-galilee' }),
    note: REGION_NOTE,
    relatedSlugs: ['beit-150-merkaz', 'beit-150-darom', 'beit-150-yerushalayim'],
  },
  {
    slug: 'beit-150-darom',
    title: 'עלות בניית בית 150 מ״ר בדרום',
    description: 'כמה עולה לבנות בית 150 מ״ר בדרום ב-2026? בגלל מצוקת כוח אדם המחירים בדרום היום גבוהים יותר מבשרון. טווח מלא לפי שלבים.',
    input: input(150, { regionSlug: 'south' }),
    note: REGION_NOTE,
    relatedSlugs: ['beit-150-merkaz', 'beit-150-tsfon', 'beit-150-yerushalayim'],
  },
  {
    slug: 'beit-150-yerushalayim',
    title: 'עלות בניית בית 150 מ״ר בירושלים',
    description: 'כמה עולה לבנות בית 150 מ״ר באזור ירושלים? טווח עלות לתכנון ובנייה לפי שלבים, נכון ל-2026.',
    input: input(150, { regionSlug: 'jerusalem' }),
    note: REGION_NOTE,
    relatedSlugs: ['beit-150-merkaz', 'beit-150-tsfon', 'beit-150-darom'],
  },

  // --- Special combinations ---
  {
    slug: 'beit-yokra-im-breicha',
    title: 'עלות בניית בית יוקרה עם בריכה',
    description: 'כמה עולה לבנות בית יוקרה עם בריכת שחייה? בית 250 מ״ר בגמר יוקרתי עם בריכה: טווח מלא לפי שלבים, נכון ל-2026.',
    input: input(250, { finishLevel: 'luxury', extras: ['pool'] }),
    note: 'בריכת סקימר פרטית עולה 150-250 אלף ₪, ואת גוף הבריכה בונה קבלן השלד. תכננו אותה יחד עם השלד, לא אחריו.',
    readMore: { title: 'בריכת גלישה מול בריכת סקימר – מה ההבדל, כמה זה עולה ומה עדיף', href: '/overflow-vs-skimmer-pool-guide/' },
    relatedSlugs: ['beit-250-meter-yokra', 'beit-200-kol-hatosfot', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-200-kol-hatosfot',
    title: 'עלות בניית בית 200 מ״ר עם כל התוספות',
    description: 'כמה עולה לבנות בית 200 מ״ר עם מרתף, בריכה, פיתוח כבד, מיזוג VRF ובית חכם? טווח מלא לפי שלבים, נכון ל-2026.',
    input: input(200, { finishLevel: 'luxury', extras: ['basement', 'pool', 'slope', 'vrf', 'smart_home'] }),
    relatedSlugs: ['beit-yokra-im-breicha', 'beit-250-meter-yokra', 'beit-200-im-martef'],
  },
  {
    slug: 'koteg-du-mishpahti-150',
    title: 'עלות בניית קוטג׳ דו-משפחתי 150 מ״ר',
    description: 'כמה עולה לבנות קוטג׳ דו-משפחתי של 150 מ״ר? הערכה ליחידה אחת: תכנון, שלד, תשתיות וגמרים. נכון ל-2026.',
    input: input(150),
    note: 'ההערכה היא ליחידה אחת, לפי השטח שלה. גם בבית דו-משפחתי כל משפחה משלמת על התכנון, האגרות והגמרים שלה.',
    relatedSlugs: ['beit-150-meter-standard', 'beit-200-shtei-komot', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-120-taksiv-namuch',
    title: 'עלות בניית בית 120 מ״ר בתקציב נמוך',
    description: 'כמה עולה לבנות בית 120 מ״ר בתקציב מינימלי? טווח עלות בגמר בסיסי, ואיפה אפשר לחסוך בלי לשלם על זה אחר כך. נכון ל-2026.',
    input: input(120, { finishLevel: 'basic', floors: 1 }),
    note: 'חוסכים בתכנון, לא בשטח: בית סימטרי, גובה קומה סטנדרטי, דלתות בגובה 2.10 מ׳, מיני מרכזי בסלון ופחות משטחים יצוקים בחוץ. ועל טיח טוב לא מוותרים.',
    readMore: { title: 'עלויות ביצוע בית פרטי 2026: שלד, טיח, ריצוף, אלומיניום ומיזוג', href: '/private-home-construction-costs-2026/' },
    relatedSlugs: ['beit-100-meter-standard', 'beit-120-meter-standard', 'beit-plada-120'],
  },
];

/** Look up a scenario by slug */
export function getScenarioBySlug(slug: string): CalculatorScenario | undefined {
  return SCENARIOS.find((s) => s.slug === slug);
}

/** Get related scenarios for a given scenario */
export function getRelatedScenarios(scenario: CalculatorScenario): CalculatorScenario[] {
  return scenario.relatedSlugs
    .map((slug) => SCENARIOS.find((s) => s.slug === slug))
    .filter((s): s is CalculatorScenario => s !== undefined);
}
