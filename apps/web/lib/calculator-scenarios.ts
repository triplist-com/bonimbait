// ============================================================
// 20 pre-defined construction cost calculator scenarios for SEO
// Each scenario maps to a /calculator/[slug] page
// ============================================================

export interface CalculatorScenario {
  slug: string;
  title: string; // Hebrew SEO title
  description: string; // Hebrew meta description
  answers: {
    house_size: string;
    floors: string;
    construction_method: string;
    finishing_level: string;
    region: string;
    basement: string;
    special_features: string[];
    timeline: string;
  };
  /** Slugs of 3-4 related scenarios for internal linking */
  relatedSlugs: string[];
}

export const SCENARIOS: CalculatorScenario[] = [
  // --- Vary by size ---
  {
    slug: 'beit-100-meter-standard',
    title: 'עלות בניית בית 100 מ״ר - סטנדרט',
    description:
      'כמה עולה לבנות בית פרטי של 100 מ״ר בגימור סטנדרטי? מחשבון עלויות בנייה מפורט לפי שלבי בנייה, מבוסס על נתונים מ-900+ סרטוני בנייה.',
    answers: {
      house_size: 'up_to_100',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-120-meter-standard', 'beit-150-meter-standard', 'beit-120-taksiv-namuch'],
  },
  {
    slug: 'beit-120-meter-standard',
    title: 'עלות בניית בית 120 מ״ר - סטנדרט',
    description:
      'כמה עולה לבנות בית פרטי של 120 מ״ר בגימור סטנדרטי? פירוט עלויות בנייה לפי שלבים כולל יסודות, שלד, גמר, חשמל ואינסטלציה.',
    answers: {
      house_size: '100_150',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-100-meter-standard', 'beit-150-meter-standard', 'beit-120-taksiv-namuch', 'beit-plada-120'],
  },
  {
    slug: 'beit-150-meter-standard',
    title: 'עלות בניית בית 150 מ״ר - סטנדרט',
    description:
      'מחשבון עלויות בנייה לבית 150 מ״ר בגימור סטנדרטי. פירוט מלא של עלויות לפי שלבי בנייה: יסודות, שלד, גמר פנים, גג ועוד.',
    answers: {
      house_size: '150_200',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-150-koma-achat', 'beit-150-merkaz', 'beit-beton-150', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-180-meter-gavoa',
    title: 'עלות בניית בית 180 מ״ר - גימור גבוה',
    description:
      'כמה עולה לבנות בית 180 מ״ר בגימור גבוה? הערכת עלויות מפורטת כולל חומרים איכותיים, ריצוף, חלונות ודלתות ברמה גבוהה.',
    answers: {
      house_size: '150_200',
      floors: '2',
      construction_method: 'blocks',
      finishing_level: 'high',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-200-meter-standard', 'beit-250-meter-yokra', 'beit-yokra-im-breicha', 'beit-150-meter-standard'],
  },
  {
    slug: 'beit-200-meter-standard',
    title: 'עלות בניית בית 200 מ״ר - סטנדרט',
    description:
      'הערכת עלויות בנייה לבית פרטי 200 מ״ר בגימור סטנדרטי. פירוט מחירים לכל שלב: יסודות, שלד, גמר, חשמל, אינסטלציה, גג ופיתוח חוץ.',
    answers: {
      house_size: '200_250',
      floors: '2',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-200-shtei-komot', 'beit-200-im-martef', 'beit-200-kol-hatosfot', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-250-meter-yokra',
    title: 'עלות בניית בית 250 מ״ר - יוקרה',
    description:
      'כמה עולה לבנות בית יוקרה של 250 מ״ר? מחשבון מפורט הכולל גימור יוקרתי, חומרים פרימיום ועלויות מיוחדות.',
    answers: {
      house_size: '250_plus',
      floors: '2',
      construction_method: 'concrete',
      finishing_level: 'luxury',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-yokra-im-breicha', 'beit-200-kol-hatosfot', 'beit-180-meter-gavoa', 'beit-200-meter-standard'],
  },

  // --- Vary by floors ---
  {
    slug: 'beit-150-koma-achat',
    title: 'עלות בניית בית קומה אחת 150 מ״ר',
    description:
      'כמה עולה לבנות בית קומה אחת בשטח 150 מ״ר? יתרונות וחסרונות של בנייה בקומה אחת ופירוט עלויות מלא.',
    answers: {
      house_size: '150_200',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-200-shtei-komot', 'beit-150-meter-standard', 'beit-200-im-martef'],
  },
  {
    slug: 'beit-200-shtei-komot',
    title: 'עלות בניית בית 2 קומות 200 מ״ר',
    description:
      'עלות בניית בית דו-קומתי 200 מ״ר. פירוט מלא של עלויות בנייה לבית שתי קומות כולל שלד, גמר, מדרגות ועוד.',
    answers: {
      house_size: '200_250',
      floors: '2',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-150-koma-achat', 'beit-200-im-martef', 'beit-200-meter-standard'],
  },
  {
    slug: 'beit-200-im-martef',
    title: 'עלות בניית בית עם מרתף 200 מ״ר',
    description:
      'כמה עולה לבנות בית 200 מ״ר עם מרתף? חישוב עלויות כולל חפירה, בנייה תת-קרקעית ואיטום מרתף.',
    answers: {
      house_size: '200_250',
      floors: '2_basement',
      construction_method: 'concrete',
      finishing_level: 'standard_high',
      region: 'center',
      basement: 'yes',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-200-shtei-komot', 'beit-200-kol-hatosfot', 'beit-200-meter-standard', 'beit-yokra-im-breicha'],
  },

  // --- Vary by construction method ---
  {
    slug: 'beit-beton-150',
    title: 'עלות בניית בית בטון 150 מ״ר',
    description:
      'כמה עולה לבנות בית בטון יצוק 150 מ״ר? השוואת עלויות בנייה בבטון מול בלוקים, יתרונות וחסרונות.',
    answers: {
      house_size: '150_200',
      floors: '1',
      construction_method: 'concrete',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-tromi-180', 'beit-plada-120', 'beit-150-meter-standard'],
  },
  {
    slug: 'beit-tromi-180',
    title: 'עלות בניית בית טרומי 180 מ״ר',
    description:
      'כמה עולה לבנות בית טרומי 180 מ״ר? עלויות בנייה טרומית מפורטות כולל יתרונות בזמני ביצוע ואיכות.',
    answers: {
      house_size: '150_200',
      floors: '2',
      construction_method: 'precast',
      finishing_level: 'standard_high',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-beton-150', 'beit-plada-120', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-plada-120',
    title: 'עלות בניית בית שלד פלדה 120 מ״ר',
    description:
      'כמה עולה לבנות בית בשלד פלדה 120 מ״ר? עלויות בנייה קלה בפלדה, יתרונות במהירות הקמה ועמידות.',
    answers: {
      house_size: '100_150',
      floors: '1',
      construction_method: 'steel',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-beton-150', 'beit-tromi-180', 'beit-120-meter-standard'],
  },

  // --- Vary by region ---
  {
    slug: 'beit-150-merkaz',
    title: 'עלות בניית בית 150 מ״ר באזור המרכז',
    description:
      'עלויות בנייה לבית 150 מ״ר באזור המרכז. מחירי עבודה וחומרים באזור גוש דן, השרון והשפלה.',
    answers: {
      house_size: '150_200',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-150-tsfon', 'beit-150-darom', 'beit-150-yerushalayim', 'beit-150-meter-standard'],
  },
  {
    slug: 'beit-150-tsfon',
    title: 'עלות בניית בית 150 מ״ר בצפון',
    description:
      'כמה עולה לבנות בית 150 מ״ר בצפון הארץ? השוואת מחירי בנייה בצפון מול המרכז, עלויות עבודה וחומרים.',
    answers: {
      house_size: '150_200',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'north',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-150-merkaz', 'beit-150-darom', 'beit-150-yerushalayim'],
  },
  {
    slug: 'beit-150-darom',
    title: 'עלות בניית בית 150 מ״ר בדרום',
    description:
      'עלויות בנייה לבית 150 מ״ר בדרום הארץ. מחירים נמוכים יותר מהמרכז — פירוט מלא לפי שלבי בנייה.',
    answers: {
      house_size: '150_200',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'south',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-150-merkaz', 'beit-150-tsfon', 'beit-150-yerushalayim'],
  },
  {
    slug: 'beit-150-yerushalayim',
    title: 'עלות בניית בית 150 מ״ר בירושלים',
    description:
      'כמה עולה לבנות בית 150 מ״ר בירושלים? עלויות בנייה גבוהות יחסית — פירוט מלא כולל דרישות ייחודיות.',
    answers: {
      house_size: '150_200',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'jerusalem',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-150-merkaz', 'beit-150-tsfon', 'beit-150-darom'],
  },

  // --- Special combinations ---
  {
    slug: 'beit-yokra-im-breicha',
    title: 'עלות בניית בית יוקרה עם בריכה',
    description:
      'כמה עולה לבנות בית יוקרה עם בריכת שחייה? פירוט עלויות לבית 250 מ״ר ברמת גימור יוקרתית כולל בריכה ומרפסת גדולה.',
    answers: {
      house_size: '250_plus',
      floors: '2',
      construction_method: 'concrete',
      finishing_level: 'luxury',
      region: 'center',
      basement: 'no',
      special_features: ['pool', 'large_balcony'],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-250-meter-yokra', 'beit-200-kol-hatosfot', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-200-kol-hatosfot',
    title: 'עלות בניית בית 200 מ״ר עם כל התוספות',
    description:
      'כמה עולה לבנות בית 200 מ״ר עם מרתף, בריכה, מעלית, חניה תת-קרקעית, מרפסת גדולה ומערכת סולארית?',
    answers: {
      house_size: '200_250',
      floors: '2_basement',
      construction_method: 'concrete',
      finishing_level: 'luxury',
      region: 'center',
      basement: 'yes',
      special_features: ['pool', 'elevator', 'underground_parking', 'large_balcony', 'solar'],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-yokra-im-breicha', 'beit-250-meter-yokra', 'beit-200-im-martef'],
  },
  {
    slug: 'koteg-du-mishpahti-150',
    title: 'עלות בניית קוטג׳ דו-משפחתי 150 מ״ר',
    description:
      'כמה עולה לבנות קוטג׳ דו-משפחתי 150 מ״ר? הערכת עלויות ליחידה אחת בבנייה דו-משפחתית כולל שלד וגמר.',
    answers: {
      house_size: '150_200',
      floors: '2',
      construction_method: 'blocks',
      finishing_level: 'standard_high',
      region: 'center',
      basement: 'no',
      special_features: [],
      timeline: 'normal',
    },
    relatedSlugs: ['beit-150-meter-standard', 'beit-200-shtei-komot', 'beit-180-meter-gavoa'],
  },
  {
    slug: 'beit-120-taksiv-namuch',
    title: 'עלות בניית בית 120 מ״ר בתקציב נמוך',
    description:
      'כמה עולה לבנות בית 120 מ״ר בתקציב מינימלי? טיפים לחיסכון בעלויות בנייה עם גימור סטנדרטי בדרום הארץ.',
    answers: {
      house_size: '100_150',
      floors: '1',
      construction_method: 'blocks',
      finishing_level: 'standard',
      region: 'south',
      basement: 'no',
      special_features: [],
      timeline: 'flexible',
    },
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
