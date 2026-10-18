/**
 * Homepage copy, in one place (Tomer's voice: practical, "מהשטח", warm and
 * direct, no hype). Builder-facing headlines say "תשובה מהשטח", not "AI";
 * "בינה מלאכותית" appears only in small print. Cost figures carry a date.
 * Client-safe.
 */

export const HERO_COPY = {
  /** The owner's line, kept as the H1. The second part is highlighted. */
  title: { lead: 'אתכם עד', highlight: 'המפתח' },
  subline: 'שאלו כל שאלה על בניית בית, בנו תקציב ראשוני וקבלו מפת דרך אישית — מהמגרש ועד הכניסה הביתה.',
  placeholder: 'למשל: כמה עולה שלד לבית של 200 מ״ר?',
  chipsLabel: 'שאלות שבונים שואלים:',
  finePrint: 'התשובות נבנות בעזרת בינה מלאכותית, רק מתוך התוכן של בונים בית.',
  host: 'עם תומר חן ריחאנה וצוות בונים בית',
} as const;

/**
 * A real answer moment for the hero illustration: an indexed video segment
 * (data/search-index.json) the visitor can open at that second.
 */
export const HERO_MOMENT = {
  question: 'מה הכי חשוב ביציקת בטון?',
  youtubeId: '9803SaFIvXM',
  videoTitle: 'פרויקט מושב מאור: יציקת בטון ומעטפת ICF',
  startSeconds: 157,
} as const;

export type ValueIcon = 'answer' | 'roadmap' | 'budget' | 'pros' | 'community' | 'consult';

export const VALUE_STRIP: Array<{ icon: ValueIcon; text: string }> = [
  { icon: 'answer', text: 'תשובה מהשטח תוך שניות — עם הרגע המדויק בסרטון' },
  { icon: 'roadmap', text: 'מפת דרך אישית לפי השלב שלכם' },
  { icon: 'budget', text: 'תקציב ראשוני ב-3 דקות' },
  { icon: 'pros', text: 'בעלי מקצוע מומלצים, עם דירוג של בונים כמוכם' },
  { icon: 'community', text: 'קבוצות וואטסאפ אזוריות בכל הארץ' },
  { icon: 'consult', text: 'פגישת ייעוץ תקציב ראשונה — ללא עלות' },
];

export const HOW_IT_WORKS = [
  {
    title: 'שואלים',
    text: 'כותבים שאלה במילים שלכם: עלויות, קבלנים, היתרים, חומרים. כמו שהייתם שואלים בעל מקצוע ותיק באתר הבנייה.',
  },
  {
    title: 'צופים ברגע המדויק',
    text: 'מקבלים תשובה קצרה ומעשית, עם קפיצה לשנייה בסרטון שבה זה מוסבר. בלי לחפש בשעות של תוכן.',
  },
  {
    title: 'מתקדמים עם מקצוען',
    text: 'ממשיכים לבעל מקצוע מהנבחרת, עם דירוג של בונים כמוכם, או לפגישת ייעוץ תקציב ללא עלות.',
  },
] as const;

/** "הבית שלי" (Builder Hub) teaser. A slot: the hub squad (Wave B) owns the destination. */
export const HUB_TEASER = {
  eyebrow: 'חדש בבונים בית',
  title: 'הבית שלי',
  subtitle: 'שמרו, עקבו ותכננו את כל הבנייה במקום אחד',
  cta: 'פתחו את הבית שלי — חינם',
  href: '/account/',
  points: ['מפת דרך לפי השלב שלכם', 'סרטונים ומאמרים ששמרתם', 'בעלי מקצוע ברשימה הקצרה'],
} as const;

export const BUDGET_TEASER = {
  title: 'כמה יעלה הבית שלכם?',
  subtitle: 'תקציב ראשוני ב-3 דקות: גודל, קומות, אזור, רמת גמר ותוספות.',
  cta: 'למחשבון התקציב',
  href: '/calculator/',
  /** Example inputs for the preview (run through lib/calculator.ts). */
  example: {
    label: 'בית של כ-225 מ״ר, 2 קומות, גמר סטנדרטי-טוב, שפלה',
    answers: {
      house_size: '200_250',
      floors: '2',
      construction_method: 'blocks',
      finishing_level: 'standard_high',
      region: 'shfela',
      basement: 'no',
      special_features: [] as string[],
      timeline: 'normal',
    },
  },
  asOf: 'נכון ל-2026',
} as const;
