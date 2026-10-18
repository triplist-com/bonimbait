/**
 * Source lists for demo data. Everything here is fictional or generic: common
 * first and last names combined at random, real towns, and typical builder
 * questions. Phones are masked and emails use example.com, so no generated
 * person can be a real, reachable one.
 */

export const FIRST_NAMES_F = [
  'נועה', 'מאיה', 'שירה', 'תמר', 'יעל', 'מיכל', 'הדס', 'רוני', 'ענבל', 'ליאת',
  'אורית', 'קרן', 'דנה', 'אפרת', 'שני', 'הילה', 'רחל', 'שרה', 'עדי', 'גלית',
  'סיון', 'מורן', 'לינה', 'רנא', 'אביטל',
] as const;

export const FIRST_NAMES_M = [
  'אורי', 'איתי', 'יונתן', 'עומר', 'נועם', 'דניאל', 'אביב', 'רועי', 'עידו', 'אלון',
  'יואב', 'גיל', 'אסף', 'ניר', 'עמית', 'אייל', 'שגיא', 'ליאור', 'משה', 'דוד',
  'יוסי', 'אבי', 'חיים', 'סאמר', 'ראמי',
] as const;

export const LAST_NAMES = [
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'פרידמן', 'דהן', 'אזולאי', 'שפירא',
  'גולן', 'אלון', 'ברק', 'שלום', 'חדד', 'עזרא', 'נחום', 'רוזן', 'קפלן', 'גבאי',
  'אוחיון', 'טל', 'שמעוני', 'בן דוד', 'יוסף', 'סלאמה', 'חורי', 'נסר', 'וקנין', 'הרשקוביץ',
] as const;

/** Towns per member region (slugs match public.regions / lib/constants/community.ts). */
export const CITIES_BY_REGION: Readonly<Record<string, readonly string[]>> = {
  golan: ['קצרין', 'חספין', 'מרום גולן', 'אורטל'],
  'upper-galilee': ['ראש פינה', 'צפת', 'קריית שמונה', 'מטולה', 'חצור הגלילית'],
  'akko-nahariya': ['נהריה', 'עכו', 'שלומי', 'כפר ורדים', 'מעלות-תרשיחא'],
  'lower-galilee': ['טבריה', 'כפר תבור', 'יבנאל', 'שורשים', 'מצפה נטופה'],
  'haifa-krayot': ['חיפה', 'קריית ביאליק', 'קריית אתא', 'טירת כרמל', 'נשר'],
  'zichron-valleys': ['זכרון יעקב', 'יוקנעם', 'עפולה', 'רמת ישי', 'קריית טבעון'],
  hadera: ['חדרה', 'פרדס חנה-כרכור', 'אור עקיבא', 'בנימינה', 'קיסריה'],
  sharon: ['נתניה', 'כפר יונה', 'אבן יהודה', 'תל מונד', 'הוד השרון', 'כפר סבא'],
  center: ['ראש העין', 'שוהם', 'פתח תקווה', 'גני תקווה', 'אלעד'],
  shfela: ['רחובות', 'גדרה', 'נס ציונה', 'יבנה', 'גן יבנה', 'מזכרת בתיה'],
  jerusalem: ['מבשרת ציון', 'בית שמש', 'צור הדסה', 'מוצא עילית', 'אבו גוש'],
  'judea-samaria': ['אריאל', 'אפרת', 'קרני שומרון', 'אלקנה', 'קדומים'],
  south: ['באר שבע', 'אופקים', 'מיתר', 'להבים', 'עומר', 'נתיבות', 'שדרות'],
};

/** Where demo builders live: weighted like the community (center/Sharon heavy). */
export const REGION_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['center', 14], ['sharon', 13], ['shfela', 12], ['haifa-krayot', 9], ['zichron-valleys', 8],
  ['hadera', 7], ['south', 9], ['jerusalem', 7], ['lower-galilee', 5], ['upper-galilee', 5],
  ['akko-nahariya', 5], ['judea-samaria', 4], ['golan', 2],
];

/** Area names used in business names ("חשמל השרון"). */
export const REGION_AREA: Readonly<Record<string, string>> = {
  golan: 'הגולן', 'upper-galilee': 'הגליל', 'akko-nahariya': 'הגליל המערבי', 'lower-galilee': 'העמק',
  'haifa-krayot': 'הכרמל', 'zichron-valleys': 'העמקים', hadera: 'החוף', sharon: 'השרון', center: 'המרכז',
  shfela: 'השפלה', jerusalem: 'ההרים', 'judea-samaria': 'השומרון', south: 'הנגב',
};

/** A demo subset of directory specialties, with the noun used in business names. */
export const DEMO_SPECIALTIES = [
  { slug: 'architects', name: 'אדריכלים', noun: 'אדריכלות' },
  { slug: 'engineering', name: 'מהנדסי קונסטרוקציה', noun: 'הנדסה' },
  { slug: 'skeleton', name: 'קבלני שלד', noun: 'בנייה ושלד' },
  { slug: 'supervision', name: 'פיקוח וניהול בנייה', noun: 'פיקוח' },
  { slug: 'aluminium', name: 'אלומיניום', noun: 'אלומיניום' },
  { slug: 'waterproofing', name: 'איטום', noun: 'איטום' },
  { slug: 'electricians', name: 'חשמלאים', noun: 'חשמל' },
  { slug: 'plumbing', name: 'אינסטלציה', noun: 'אינסטלציה' },
  { slug: 'plaster', name: 'טיח', noun: 'טיח' },
  { slug: 'flooring', name: 'ריצוף וחיפוי', noun: 'ריצוף' },
  { slug: 'kitchens', name: 'מטבחים', noun: 'מטבחים' },
  { slug: 'carpentry', name: 'נגרות', noun: 'נגרות' },
  { slug: 'hvac', name: 'מיזוג אוויר', noun: 'מיזוג' },
  { slug: 'solar', name: 'מערכות סולאריות', noun: 'סולארי' },
  { slug: 'landscaping', name: 'פיתוח וגינון', noun: 'גינון ופיתוח' },
  { slug: 'mortgage', name: 'יועצי משכנתאות', noun: 'משכנתאות' },
] as const;

/** Typical builder questions, by topic and the specialty that would answer them. */
export const DEMO_QUESTIONS: ReadonlyArray<{ text: string; topic: string; specialty?: string }> = [
  { text: 'כמה עולה לבנות שלד לבית של 180 מ״ר?', topic: 'עלויות', specialty: 'skeleton' },
  { text: 'מה ההבדל בין בלוקים לבטון יצוק בקירות חוץ?', topic: 'שלד', specialty: 'skeleton' },
  { text: 'כמה זמן לוקח לקבל היתר בנייה?', topic: 'היתרים' },
  { text: 'איך בוחרים קבלן שלד ומה חייב להופיע בחוזה?', topic: 'קבלנים', specialty: 'skeleton' },
  { text: 'כמה עולה ממ״ד בבית פרטי?', topic: 'עלויות', specialty: 'skeleton' },
  { text: 'מה צריך לבדוק לפני שקונים מגרש?', topic: 'מגרש' },
  { text: 'האם כדאי לבנות מרתף, וכמה זה מייקר?', topic: 'תכנון', specialty: 'architects' },
  { text: 'איזה חלונות אלומיניום הכי משתלמים?', topic: 'גמרים', specialty: 'aluminium' },
  { text: 'מתי עושים איטום ליסודות ולגג?', topic: 'איטום', specialty: 'waterproofing' },
  { text: 'כמה עולה פיקוח הנדסי על כל הפרויקט?', topic: 'פיקוח', specialty: 'supervision' },
  { text: 'איך חוסכים בבנייה בלי לפגוע באיכות?', topic: 'תקציב' },
  { text: 'מה זה היטל השבחה ומי משלם אותו?', topic: 'מיסים' },
  { text: 'מה עדיף: חימום תת-רצפתי או מזגנים?', topic: 'מערכות', specialty: 'hvac' },
  { text: 'מה כולל מפרט טכני טוב?', topic: 'תכנון', specialty: 'architects' },
  { text: 'כמה עולות עבודות פיתוח וגינון?', topic: 'עלויות', specialty: 'landscaping' },
  { text: 'האם כדאי מערכת סולארית על הגג?', topic: 'מערכות', specialty: 'solar' },
  { text: 'גג רעפים או גג שטוח: מה יותר משתלם?', topic: 'תכנון', specialty: 'architects' },
  { text: 'מתי מזמינים מטבח, ומה לבדוק בהצעה?', topic: 'גמרים', specialty: 'kitchens' },
  { text: 'אפשר לקבל משכנתא לבנייה עצמית?', topic: 'מימון', specialty: 'mortgage' },
  { text: 'אילו אגרות והיטלים משלמים לרשות?', topic: 'מיסים' },
  { text: 'כמה עולה חשמלאי לבית שלם?', topic: 'עלויות', specialty: 'electricians' },
  { text: 'איך בודקים שקבלן אמין לפני שחותמים?', topic: 'קבלנים' },
  { text: 'מה לוח הזמנים הריאלי מהיתר ועד מפתח?', topic: 'לוחות זמנים' },
  { text: 'איזה ריצוף מתאים לבית עם ילדים וכלבים?', topic: 'גמרים', specialty: 'flooring' },
  { text: 'כמה עולה טיח פנים וחוץ למ״ר?', topic: 'עלויות', specialty: 'plaster' },
  { text: 'מתי צריך יועץ קרקע?', topic: 'תכנון', specialty: 'engineering' },
  { text: 'כמה עולה תוכנית אדריכלית לבית פרטי?', topic: 'עלויות', specialty: 'architects' },
  { text: 'איך מתכננים תקציב גמרים שלא יברח?', topic: 'תקציב' },
];

/** Budget bands as builders state them (words, not ranges: keeps numbers readable in RTL). */
export const BUDGET_BANDS = [
  'עד 1.5 מיליון ₪',
  '1.5 עד 2 מיליון ₪',
  '2 עד 2.5 מיליון ₪',
  '2.5 עד 3.5 מיליון ₪',
  'מעל 3.5 מיליון ₪',
] as const;

/** Where demo leads come from (labels for lists and charts). */
export const LEAD_SOURCES = [
  { key: 'advisor', label: 'שאלה ליועץ', weight: 30 },
  { key: 'business_page', label: 'עמוד בעל מקצוע', weight: 26 },
  { key: 'planner', label: 'מחשבון התקציב', weight: 16 },
  { key: 'consultation', label: 'פגישת ייעוץ', weight: 14 },
  { key: 'whatsapp', label: 'קהילת WhatsApp', weight: 8 },
  { key: 'partner', label: 'קמפיין שותף', weight: 6 },
] as const;

/**
 * Daily traffic shape for an Israeli audience, Sunday first: busy Sunday to
 * Wednesday evenings, a dip on Friday and Shabbat, picking up Saturday night.
 */
export const ISRAELI_WEEK: readonly number[] = [1.12, 1.1, 1.06, 1.02, 0.95, 0.66, 0.74];
