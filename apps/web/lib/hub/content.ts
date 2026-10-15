/**
 * Per-stage content for the Builder Hub roadmap: what happens, how long it
 * takes, the one place it's easiest to go wrong, a 6-10 item checklist and
 * questions for the advisor. Written from the owner's articles and videos
 * (the linked guides are real posts). The 7 stages and their labels come from
 * lib/stages.ts; this file only adds hub content to them. Client-safe.
 *
 * Checklist ids are stored in hub_checklist_state.item_id ('<stage>.<item>'):
 * never rename one; retire it instead. "מה עושים השבוע" is the next open items
 * of the current stage (lib/hub/roadmap.ts).
 */
import { BUILD_STAGES, type BuildStage } from '@/lib/stages';
import { isolateLtr } from './format';
import type { StageId } from './types';

export interface ChecklistItem {
  /** '<stage>.<item>', stable. */
  id: string;
  /** The action, in the plural imperative. */
  title: string;
  /** One line from the field: why it matters. */
  why: string;
  /** The owner's guide for it (a post or a tool). */
  link?: { href: string; label: string };
}

export interface StageContent {
  id: StageId;
  /** Two or three sentences: what happens in this stage. */
  whatHappens: string;
  /** Typical duration, in months. */
  duration: { minMonths: number; maxMonths: number };
  /** "פה הכי קל לטעות": the one pitfall to remember. */
  watchOut: string;
  checklist: ChecklistItem[];
  /** Suggested questions for the advisor ("שאלו על השלב הזה"). */
  questions: string[];
  /**
   * Topic word groups (synonyms) for picking this stage's videos and articles
   * (lib/hub/picks.ts). A text matches a topic when it contains any of its
   * words; picks are capped per topic so a stage gets variety.
   */
  topics: ReadonlyArray<readonly string[]>;
  /** Static video index categories that lean to this stage. */
  videoCategories: string[];
}

export const STAGE_CONTENT: Record<StageId, StageContent> = {
  purchase: {
    id: 'purchase',
    whatHappens:
      'בוחרים מגרש או נכס, בודקים מה מותר לבנות עליו ובונים תוכנית מימון. ההחלטות כאן קובעות את גבולות התקציב של כל הפרויקט, אז שווה להשקיע בבדיקות לפני שחותמים.',
    duration: { minMonths: 1, maxMonths: 6 },
    watchOut:
      'מגרש זול עם שיפוע, סלע או זכויות מוגבלות יכול לעלות בסוף יותר ממגרש יקר ושטוח. בדקו את המגרש עם איש מקצוע לפני החתימה.',
    checklist: [
      {
        id: 'purchase.rights',
        title: 'בדקו את זכויות הבנייה והתב״ע של המגרש',
        why: 'אחוזי בנייה, קווי בניין, גובה ומספר קומות קובעים כמה מ״ר תוכלו לבנות ובאיזו צורה.',
        link: { href: '/זכויות-בניה-המדריך-השלם/', label: 'מהן זכויות בנייה' },
      },
      {
        id: 'purchase.site-visit',
        title: 'סיירו במגרש עם אדריכל או מהנדס',
        why: 'שיפוע, סלע, קירות תמך וגישה למשאיות הם הבדל של עשרות ומאות אלפי שקלים ביסודות ובפיתוח.',
        link: { href: '/earthworks-foundations-guide/', label: 'כמה עולים עבודות עפר ויסודות' },
      },
      {
        id: 'purchase.soil',
        title: 'שקלו בדיקת קרקע לפני שחותמים',
        why: 'יועץ קרקע מתחיל בכ-2,000 ש״ח, וחוסך הפתעות של כלונסאות עמוקים או מילוי.',
        link: { href: '/price-land-consultant/', label: 'יועץ קרקע: מה זה עולה' },
      },
      {
        id: 'purchase.lawyer',
        title: 'קחו עורך דין מקרקעין לבדיקת הנכס',
        why: 'נסח טאבו או רמ״י, שעבודים, הערות אזהרה וזכויות מעבר: מה שלא בודקים עכשיו נתקע אחר כך בהיתר.',
      },
      {
        id: 'purchase.taxes',
        title: 'חשבו מס רכישה, היטל השבחה ועלויות עסקה',
        why: 'אלה עשרות אלפי שקלים מעבר למחיר המגרש, ולרוב משלמים אותם עוד לפני שמתחילים לבנות.',
        link: { href: '/hetel/', label: 'היטל השבחה' },
      },
      {
        id: 'purchase.mortgage',
        title: 'בדקו משכנתא לבנייה עצמית',
        why: 'הבנק משחרר כסף לפי שלבי הבנייה ודורש מסמכים בכל שלב. הבינו את זה לפני שמתכננים תזרים.',
        link: { href: '/construction-mortgage-complete-guide-grossman/', label: 'משכנתא לבנייה עצמית' },
      },
      {
        id: 'purchase.budget',
        title: 'קבעו מסגרת תקציב ריאלית לבנייה',
        why: 'לפי הנתונים של בונים בית, תכנון ובנייה עולים בין 12 ל-14 אלף ₪ למ״ר, לא כולל מע״מ (נכון ל-2026).',
        link: { href: '/calculator/', label: 'תקציב ראשוני' },
      },
      {
        id: 'purchase.rmi',
        title: 'קונים במכרז רמ״י? קראו את תנאי המכרז עד הסוף',
        why: 'יש מועדים לתחילת הבנייה ולסיומה, וקנסות על איחור. תכננו את לוח הזמנים בהתאם.',
        link: { href: '/מגרש-לבניה-עצמית-מינהל-מקרקעי-ישראל-כל/', label: 'מכרזי רמ״י לבנייה עצמית' },
      },
    ],
    questions: [
      'מה חשוב לבדוק בתב״ע לפני שקונים מגרש?',
      'איך עובדת משכנתא לבנייה עצמית?',
      'כמה עולה לבנות בית פרטי ב-2026?',
    ],
    topics: [['מגרש', 'רמ"י', 'בנייה עצמית', 'בניה עצמית'], ['זכויות בני', 'תב"ע'], ['משכנת', 'מימון'], ['מס רכישה', 'היטל השבחה', 'שמאי'], ['קרקע'], ['רכישת']],
    videoCategories: ['planning-permits', 'costs-pricing'],
  },

  planning: {
    id: 'planning',
    whatHappens:
      'בוחרים אדריכל ויועצים, כותבים מה אתם צריכים מהבית ומתאימים את התכנון לתקציב. כל שינוי על הנייר זול. אותו שינוי בשטח עולה הרבה יותר.',
    duration: { minMonths: 3, maxMonths: 8 },
    watchOut:
      'הסקיצה שמתאהבים בה לא תמיד מתאימה לתקציב. בקשו אומדן עלות לכל גרסת תכנון, לפני שממשיכים הלאה.',
    checklist: [
      {
        id: 'planning.program',
        title: 'כתבו פרוגרמה לבית',
        why: 'כמה חדרים, כמה מ״ר, איך אתם חיים ומה הכי חשוב לכם. אדריכל טוב מתחיל מהרשימה הזו.',
      },
      {
        id: 'planning.architect',
        title: 'ראיינו לפחות שלושה אדריכלים',
        why: 'בקשו לראות בתים שתכננו ודברו עם לקוחות קודמים. שאלו מה כלול בשכר הטרחה ומה לא.',
        link: { href: '/tips-choosing-architect/', label: '12 טיפים לבחירת אדריכל' },
      },
      {
        id: 'planning.soil-report',
        title: 'הזמינו בדיקת קרקע לפני תכנון היסודות',
        why: 'הקונסטרוקטור צריך את הדוח כדי לתכנן יסודות לפי הקרקע האמיתית, ולא לפי הערכה.',
        link: { href: '/בדיקות-קרקע/', label: 'בדיקות קרקע' },
      },
      {
        id: 'planning.estimate',
        title: 'בקשו אומדן עלות לכל גרסת תכנון',
        why: 'מ״ר נוסף, מרתף או חלונות ענק משנים את התקציב. עדיף לגלות את זה על הנייר.',
        link: { href: '/7-סיבות-נפוצות-לחריגה-בתקציב-בנייה-וכיצ/', label: '7 סיבות לחריגה בתקציב' },
      },
      {
        id: 'planning.consultants',
        title: 'סגרו קונסטרוקטור ויועצים',
        why: 'חשמל, אינסטלציה, מיזוג ואיטום. יועצים שנכנסים מוקדם חוסכים תיקונים בשטח.',
      },
      {
        id: 'planning.superposition',
        title: 'דרשו סופרפוזיציה של כל התוכניות',
        why: 'תיאום בין האדריכלות, הקונסטרוקציה והמערכות מגלה התנגשויות לפני שהן נבנות בבטון.',
        link: { href: '/superposition-construction-coordination/', label: 'סופרפוזיציה בבנייה' },
      },
      {
        id: 'planning.electric',
        title: 'תכננו מוקדם את תוכנית החשמל והתאורה',
        why: 'שקעים, נקודות תאורה ומתח נמוך נקבעים לפי איך שתשתמשו בכל חדר, לא לפי תבנית.',
        link: { href: '/תוכנית-חשמל-ככה-תערכו-אותה-נכון/', label: 'תוכנית חשמל לבית' },
      },
      {
        id: 'planning.boq',
        title: 'הכינו כתב כמויות ומפרט טכני',
        why: 'בלי כתב כמויות אי אפשר באמת להשוות הצעות מחיר. זה הבסיס של מכרז הקבלנים.',
        link: { href: '/bill-of-quantities/', label: 'מה זה כתב כמויות' },
      },
    ],
    questions: [
      'איך בוחרים אדריכל לבית פרטי?',
      'מה זה כתב כמויות ולמה צריך אותו?',
      'כמה עולה תכנון של בית פרטי?',
    ],
    topics: [['אדריכל', 'מתכנן'], ['תכנון', 'תוכנית', 'סקיצ'], ['כתב כמויות'], ['יועץ', 'קונסטרוקטור'], ['סופרפוזיציה'], ['תוכנית חשמל'], ['עיצוב פנים'], ['בדיקות קרקע', 'בדיקת קרקע']],
    videoCategories: ['planning-permits'],
  },

  permit: {
    id: 'permit',
    whatHappens:
      'מגישים בקשה להיתר, משלמים אגרות והיטלים, ובמקביל יוצאים למכרז קבלנים. כאן סוגרים את המחירים הגדולים של הבנייה, אז לא ממהרים לחתום.',
    duration: { minMonths: 4, maxMonths: 12 },
    watchOut:
      'ההצעה הזולה היא לרוב זו שהכי הרבה חסר בה. השוו הצעות שורה מול שורה, על בסיס אותו כתב כמויות.',
    checklist: [
      {
        id: 'permit.submit',
        title: 'הגישו את בקשת ההיתר דרך האדריכל',
        why: 'עקבו אחרי הערות הוועדה וענו מהר. כל סבב הערות יכול להוסיף שבועות.',
      },
      {
        id: 'permit.fees',
        title: 'קבלו שומת אגרות והיטלים ושריינו לה כסף',
        why: 'אגרות והיטלי פיתוח יכולים להגיע למאות אלפי שקלים, ומשלמים אותם לפני שמקבלים את ההיתר.',
        link: { href: '/אגרות-בניה-והיטלים-בית-פרטי/', label: 'אגרות והיטלים לבית פרטי' },
      },
      {
        id: 'permit.tender',
        title: 'צאו למכרז מול שלושה קבלני שלד לפחות',
        why: 'כולם מקבלים אותן תוכניות ואותו כתב כמויות, כדי שתשוו תפוחים לתפוחים.',
        link: { href: '/contractor-tender-private-home-guide/', label: 'מכרז קבלנים לבית פרטי' },
      },
      {
        id: 'permit.compare-quotes',
        title: 'השוו הצעות מחיר שורה מול שורה',
        why: 'חפשו מה חסר: עבודות עפר, ברזל, איטום, פינוי פסולת. מה שלא כתוב בהצעה יחזור אליכם כחריג.',
        link: { href: '/איך-לפענח-הצעת-מחיר-ולזהות-מה-חסר/', label: 'איך לפענח הצעת מחיר' },
      },
      {
        id: 'permit.contractor-model',
        title: 'החליטו: קבלן מפתח או קבלני משנה',
        why: 'קבלן מפתח נותן ראש שקט ועולה יותר. חלוקה לקבלני משנה חוסכת כסף ודורשת ניהול צמוד.',
        link: { href: '/turnkey-contractor-vs-subcontractors-guide/', label: 'קבלן מפתח או קבלני משנה' },
      },
      {
        id: 'permit.contract',
        title: 'חתמו חוזה עם תשלומים לפי אבני דרך',
        why: 'משלמים רק על שלב שהושלם ונבדק, עם עיכבון, ערבות ביצוע ולוח זמנים עם קנסות.',
        link: { href: '/structural-contractor-golden-rules/', label: '11 כללי זהב לפני חוזה שלד' },
      },
      {
        id: 'permit.supervisor',
        title: 'בחרו מפקח בנייה',
        why: 'מפקח טוב בודק לפני כל יציקה ומאשר כל חשבון. סכמו מראש כמה ביקורים בשבוע.',
        link: { href: '/how-to-choose-construction-supervisor/', label: '10 שאלות למפקח בנייה' },
      },
      {
        id: 'permit.insurance',
        title: 'עשו ביטוח עבודות קבלניות',
        why: 'לפני שעולים לשטח. ודאו שהפוליסה מכסה גם צד שלישי וגם את העובדים באתר.',
        link: { href: '/ביטוח-בניה-פרטית/', label: 'ביטוח בנייה פרטית' },
      },
      {
        id: 'permit.start-approval',
        title: 'קבלו אישור תחילת עבודות',
        why: 'בלי האישור הזה אסור להתחיל לחפור, גם כשההיתר כבר ביד.',
        link: { href: '/אישור-תחילת-עבודות-בניה-ושיפוץ-בית/', label: 'אישור תחילת עבודות' },
      },
    ],
    questions: [
      'כמה עולות אגרות והיטלים לבית פרטי?',
      'קבלן מפתח או קבלני משנה, מה עדיף?',
      'איך משווים הצעות מחיר של קבלני שלד?',
    ],
    topics: [['היתר', 'ועדה', 'רישוי', 'תחילת עבודות'], ['אגרות', 'היטל'], ['מכרז', 'הצעת מחיר', 'הצעות מחיר', 'משא ומתן'], ['קבלן מפתח', 'קבלני משנה'], ['חוזה'], ['ביטוח'], ['מפקח', 'פיקוח']],
    videoCategories: ['planning-permits', 'contractors-labor', 'costs-pricing'],
  },

  frame: {
    id: 'frame',
    whatHappens:
      'חפירה, יסודות, רצפה, קירות ותקרות. זה השלב היקר ביותר, כשליש מהתקציב, והשלב שבו טעויות נבנות בבטון. כאן הפיקוח שווה כל שקל.',
    duration: { minMonths: 4, maxMonths: 8 },
    watchOut:
      'אחרי יציקה כבר אי אפשר לתקן בזול. אל תאשרו אף יציקה בלי בדיקת ברזל של המפקח או הקונסטרוקטור.',
    checklist: [
      {
        id: 'frame.kickoff',
        title: 'קיימו פגישת פתיחה עם הקבלן והמפקח',
        why: 'סכמו לוח זמנים, אבני דרך, ערוץ תקשורת קבוע ומי מאשר מה באתר.',
      },
      {
        id: 'frame.survey',
        title: 'ודאו סימון של מודד לפני החפירה',
        why: 'קווי בניין ומפלסים שגויים הם טעות שאי אפשר להזיז אחר כך.',
      },
      {
        id: 'frame.rebar',
        title: 'אל תאשרו יציקה בלי בדיקת ברזל',
        why: 'המפקח או הקונסטרוקטור בודקים קוטר, מרווחים וכיסוי בטון. בקשו את האישור בכתב.',
      },
      {
        id: 'frame.concrete',
        title: 'דרשו תעודת משלוח לכל מערבל בטון',
        why: 'סוג הבטון והשקיעה צריכים להתאים למפרט. מים שמוסיפים באתר מחלישים את הבטון.',
        link: { href: '/concrete-guide-types-slump-segregation/', label: 'מדריך הבטון המלא' },
      },
      {
        id: 'frame.sleeves',
        title: 'תאמו שרוולים ומעברים לפני כל יציקה',
        why: 'מעבר שנשכח לאינסטלציה, לחשמל או למיזוג יעלה בקידוח יהלום ובפגיעה בברזל.',
      },
      {
        id: 'frame.mamad',
        title: 'בדקו את דרישות הממ״ד לפני היציקה',
        why: 'פיקוד העורף בודק עובי קירות, ברזל ופתחים. תיקון בממ״ד הוא מהיקרים שיש.',
        link: { href: '/מהי-עלות-ממד-למר/', label: 'עלות בניית ממ״ד' },
      },
      {
        id: 'frame.waterproofing',
        title: 'אטמו יסודות ומרתף לפני המילוי החוזר',
        why: 'אחרי שמכסים באדמה כבר אי אפשר להגיע לקירות מבחוץ.',
        link: { href: '/basement-waterproofing-layers-guide/', label: 'איטום מרתף' },
      },
      {
        id: 'frame.photos',
        title: 'צלמו כל שלב לפני שסוגרים אותו',
        why: 'ברזל, צנרת ואיטום: התמונות האלה שוות זהב בבדק בית ובכל מחלוקת עם קבלן.',
        link: { href: '/construction-documentation-guide/', label: 'צילום ותיעוד בבנייה' },
      },
      {
        id: 'frame.payments',
        title: 'שלמו רק על אבני דרך שהושלמו ונבדקו',
        why: 'המפקח מאשר כל חשבון לפני תשלום. כך שומרים על כוח מול הקבלן עד הסוף.',
      },
    ],
    questions: [
      'כמה עולה שלד לבית של 200 מ״ר?',
      'מה בודקים לפני יציקת תקרה?',
      'איך בוחרים סוג בטון ליסודות?',
    ],
    topics: [['שלד', 'קבלן שלד'], ['יסודות', 'כלונס', 'חפירה', 'עבודות עפר'], ['בטון', 'יציקה', 'ברזל'], ['בלוק'], ['תקרה'], ['מרתף'], ['ממד', 'ממ"ד'], ['שלד פלדה', 'פלדה דקת', 'ICF', 'בנייה קלה', 'בניה קלה']],
    videoCategories: ['structure-construction'],
  },

  infrastructure: {
    id: 'infrastructure',
    whatHappens:
      'מעבירים צנרת מים וביוב, חשמל, תקשורת ומיזוג, ואוטמים את הגג ואת החדרים הרטובים. אחרי הטיח כבר קשה ויקר לתקן, אז זה הזמן לבדוק כל נקודה.',
    duration: { minMonths: 2, maxMonths: 4 },
    watchOut:
      'צלמו כל קיר לפני הטיח, עם מטר בתמונה. בעוד עשר שנים תדעו בדיוק איפה עובר כל צינור.',
    checklist: [
      {
        id: 'infrastructure.walkthrough',
        title: 'עשו סיור נקודות עם החשמלאי לפני ההשחלה',
        why: 'עמדו בכל חדר ובדקו שקעים, מתגים ותאורה לפי איך שתחיו בו.',
        link: { href: '/תוכנית-חשמל-ככה-תערכו-אותה-נכון/', label: 'תוכנית חשמל לבית' },
      },
      {
        id: 'infrastructure.pressure-test',
        title: 'דרשו בדיקת לחץ לצנרת המים',
        why: 'לפני שמכסים. נזילה שמתגלה אחרי הריצוף עולה פי עשרה.',
        link: { href: '/pex-plumbing-guide/', label: 'אינסטלציה בבית פרטי' },
      },
      {
        id: 'infrastructure.drainage',
        title: 'בדקו שיפועי ביוב ונקודות ניקוז',
        why: 'שיפוע לא נכון יגרום לסתימות חוזרות לאורך שנים.',
      },
      {
        id: 'infrastructure.hvac',
        title: 'הכינו את המיזוג: צנרת, ניקוז ומיקום מעבים',
        why: 'החליטו עכשיו על סוג המערכת, כדי שהצנרת והתעלות ייכנסו לפני הטיח והגבס.',
        link: { href: '/vrf-air-conditioning-planning-guide/', label: 'תכנון מיזוג VRF' },
      },
      {
        id: 'infrastructure.wet-rooms',
        title: 'אטמו חדרים רטובים ובצעו בדיקת הצפה',
        why: 'ממלאים מים ליממה לפחות, לפני הריצוף. זו הבדיקה שבאמת מגלה נזילות.',
        link: { href: '/waterproofing-wet-rooms/', label: 'איטום חדרים רטובים' },
      },
      {
        id: 'infrastructure.roof',
        title: 'סגרו את האיטום והבידוד של הגג',
        why: 'גג שדולף פוגע בכל מה שמתחתיו. בדקו שיטה, אחריות ובדיקת הצפה.',
        link: { href: '/roofs-waterproofing-conference-guide/', label: 'גגות ואיטום גגות' },
      },
      {
        id: 'infrastructure.windows-measure',
        title: 'הזמינו מדידה לאלומיניום לפני הטיח',
        why: 'משקופים עיוורים וארגזי תריס נכנסים עכשיו. מי שמאחר משלם בתיקוני טיח.',
        link: { href: '/מתי-כדאי-לגשת-לקבלני-האלומיניום-איך-מו/', label: 'מתי לגשת לקבלני האלומיניום' },
      },
      {
        id: 'infrastructure.photos',
        title: 'צלמו את כל הקירות לפני הטיח',
        why: 'צנרת, חשמל ומתח נמוך, עם מטר בתמונה. שמרו את התמונות בתיק הפרויקט.',
        link: { href: '/construction-documentation-guide/', label: 'צילום ותיעוד בבנייה' },
      },
    ],
    questions: [
      'איך מתכננים נקודות חשמל בבית פרטי?',
      'מה חשוב באיטום חדרים רטובים?',
      'מיזוג VRF או מיני מרכזי?',
    ],
    topics: [['חשמל', 'מתח נמוך', 'בית חכם'], ['אינסטלציה', 'צנרת', 'PEX', 'ביוב', 'ניקוז'], ['מיזוג', 'VRF'], ['איטום', 'חדרים רטובים'], ['בידוד', 'גג'], ['סולארי', 'דוד שמש'], ['תשתית']],
    videoCategories: ['electrical-plumbing'],
  },

  finishing: {
    id: 'finishing',
    whatHappens:
      'טיח, ריצוף, אלומיניום, מטבח, נגרות וכלים סניטריים. הרבה בחירות והרבה ספקים במקביל. כאן נולדות רוב החריגות, מתוספות קטנות שמצטברות.',
    duration: { minMonths: 4, maxMonths: 8 },
    watchOut:
      'סכמו מחיר בכתב לפני כל תוספת או שינוי. עשר תוספות של "רק עוד קצת" הן עשרות אלפי שקלים.',
    checklist: [
      {
        id: 'finishing.selections',
        title: 'סגרו את הבחירות לפי לוח הזמנים של הקבלן',
        why: 'ריצוף, כלים וברזים שמגיעים באיחור עוצרים את כל העבודה באתר.',
      },
      {
        id: 'finishing.plaster',
        title: 'בדקו את הטיח לפני הצבע',
        why: 'מישוריות, פינות ישרות ורשתות במעבר בין חומרים. אחרי הצבע כל פגם בולט.',
        link: { href: '/17-טיפים-לסגירה-מול-הטייח-שלכם-2021/', label: '17 טיפים מול הטייח' },
      },
      {
        id: 'finishing.tiles',
        title: 'הזמינו ריצוף עם 10% רזרבה',
        why: 'אותה סדרה ואותו גוון קשה למצוא אחרי שנה. את הרזרבה שומרים לתיקונים.',
        link: { href: '/tiling-preparation-costs/', label: 'ריצוף בית פרטי' },
      },
      {
        id: 'finishing.aluminium',
        title: 'בדקו את האלומיניום מול ההזמנה',
        why: 'סדרת פרופיל, זכוכית, תריסים ואטימות. שאלו מה ההבדל בין הסדרות לפני שבוחרים.',
        link: { href: '/keil-9200-vs-2200/', label: 'קליל 9200 או 2200' },
      },
      {
        id: 'finishing.kitchen',
        title: 'מדידה סופית למטבח רק אחרי ריצוף וטיח',
        why: 'כמה סנטימטרים של פער בין התוכנית לקיר הם מטבח שלא נכנס.',
        link: { href: '/kitchen-guide-private-house/', label: 'כמה עולה מטבח לבית פרטי' },
      },
      {
        id: 'finishing.extras',
        title: 'נהלו רשימת חריגים עם מחיר בכתב',
        why: 'כל שינוי נרשם ומאושר לפני ביצוע. כך יודעים בכל רגע איפה התקציב עומד.',
        link: { href: '/construction-extras-changes-guide/', label: 'חריגים ותוספות בבנייה' },
      },
      {
        id: 'finishing.sanitary',
        title: 'התאימו כלים סניטריים להכנות בקיר',
        why: 'אינטרפוץ, ברזים ואסלות תלויות צריכים להתאים למה שהאינסטלטור הכין.',
        link: { href: '/אינטרפוץ-3-דרך-או-4-דרך-מה-ההבדלים-בכלל-2021/', label: 'אינטרפוץ 3 או 4 דרך' },
      },
      {
        id: 'finishing.punch-list',
        title: 'פתחו רשימת ליקויים כבר עכשיו',
        why: 'רשמו כל פגם כשרואים אותו, עם תמונה. ברשימה מסודרת קל לסגור חשבון בסוף.',
      },
    ],
    questions: [
      'איך בוחרים פרופיל אלומיניום?',
      'מה בודקים בטיח לפני צבע?',
      'איך שולטים בחריגים ותוספות בגמרים?',
    ],
    topics: [['טיח'], ['ריצוף', 'חיפוי', 'פרקט'], ['אלומיניום', 'חלונות', 'פרופיל', 'קליל', 'תריס'], ['מטבח', 'נגר', 'שיש'], ['דלת'], ['צבע', 'גבס'], ['סניטרי', 'ברז', 'מקלחון', 'אינטרפוץ'], ['מדרגות'], ['גמר']],
    videoCategories: ['finishes-design'],
  },

  'moving-in': {
    id: 'moving-in',
    whatHappens:
      'פיתוח חוץ, חיבורים קבועים לחשמל ולמים, טופס 4 ומסירה. כאן סוגרים חשבון סופי עם הקבלנים ומוודאים שכל ליקוי תוקן, לפני שנכנסים הביתה.',
    duration: { minMonths: 1, maxMonths: 3 },
    watchOut:
      'אל תשחררו את העיכבון האחרון לפני שכל הליקויים תוקנו ונבדקו. אחרי התשלום, קשה להחזיר את הקבלן לשטח.',
    checklist: [
      {
        id: 'moving-in.inspection',
        title: 'הזמינו בדק בית לפני המסירה',
        why: 'מהנדס בודק איטום, ריצוף, חשמל ואינסטלציה ומוציא דוח ליקויים מסודר.',
        link: { href: '/home-inspection-guide/', label: 'בדק בית לבנייה פרטית' },
      },
      {
        id: 'moving-in.form4',
        title: 'הכינו את המסמכים לטופס 4',
        why: 'אישורי חברת החשמל, המים, כיבוי האש ופיקוד העורף. בדקו עם האדריכל מה עוד חסר.',
        link: { href: '/tofes4/', label: 'מה זה טופס 4' },
      },
      {
        id: 'moving-in.connections',
        title: 'תאמו חיבורים קבועים לחשמל, מים ותקשורת',
        why: 'לחלק מהחיבורים יש זמני המתנה של שבועות. הזמינו מוקדם.',
        link: { href: '/water-temp/', label: 'מדריך לחיבור מים' },
      },
      {
        id: 'moving-in.handover',
        title: 'עשו סיור מסירה עם רשימת בדיקה',
        why: 'עברו חדר אחרי חדר עם הקבלן והמפקח, ורשמו כל ליקוי בפרוטוקול חתום.',
        link: { href: '/new-home-handover-checklist/', label: 'צ׳קליסט מסירה' },
      },
      {
        id: 'moving-in.final-account',
        title: 'סגרו חשבון סופי מול כתב הכמויות',
        why: 'כמויות בפועל, חריגים שאושרו ומה שקוזז. את העיכבון משחררים רק בסוף.',
      },
      {
        id: 'moving-in.warranties',
        title: 'אספו תעודות אחריות מכל ספק',
        why: 'איטום, אלומיניום, מיזוג, דוד ומערכות. שמרו הכול בתיק הפרויקט.',
      },
      {
        id: 'moving-in.insurance',
        title: 'עשו ביטוח דירה מהיום הראשון',
        why: 'הביטוח הקבלני נגמר במסירה. בלי ביטוח חדש, הבית עומד בלי כיסוי.',
        link: { href: '/insurance-continuity-guide/', label: 'רצף ביטוחי' },
      },
      {
        id: 'moving-in.landscaping',
        title: 'תכננו את פיתוח החוץ',
        why: 'גדרות, חניה, ניקוז וגינה. לפעמים נכון לדחות חלק לאחרי הכניסה, כדי לנשום תקציבית.',
        link: { href: '/site-development-earthworks-topography-guide/', label: 'פיתוח שטח בבנייה פרטית' },
      },
    ],
    questions: [
      'מה בודקים בבדק בית לפני מסירה?',
      'איך מקבלים טופס 4?',
      'מתי משחררים לקבלן את העיכבון?',
    ],
    topics: [['אכלוס', 'כניסה לבית'], ['מסירה', 'מסירת'], ['בדק בית', 'ליקוי'], ['טופס 4', 'תעודת גמר'], ['פיתוח', 'גינ', 'גדר', 'חניה'], ['אחריות'], ['ביטוח דירה', 'רצף ביטוחי'], ['חשבון סופי'], ['סוף בני', 'סיום בני', 'סיום הבני']],
    videoCategories: ['landscaping-yard'],
  },
};

/** lib/stages.ts entry for a hub stage id. */
export function buildStage(id: StageId): BuildStage {
  const stage = BUILD_STAGES.find((s) => s.id === id);
  if (!stage) throw new Error(`Unknown stage: ${id}`);
  return stage;
}

/** Every checklist item id, for validation (hub_checklist_state.item_id). */
export const CHECKLIST_ITEM_IDS: ReadonlySet<string> = new Set(
  Object.values(STAGE_CONTENT).flatMap((s) => s.checklist.map((i) => i.id)),
);

export function isChecklistItemId(value: unknown): value is string {
  return typeof value === 'string' && CHECKLIST_ITEM_IDS.has(value);
}

/** The checklist item and its stage, or undefined. */
export function findChecklistItem(id: string): (ChecklistItem & { stage: StageId }) | undefined {
  const stage = id.split('.')[0] as StageId;
  const item = STAGE_CONTENT[stage]?.checklist.find((i) => i.id === id);
  return item ? { ...item, stage } : undefined;
}

/** "3–8 חודשים", with the range in an LTR isolate so it never reads "8–3" in RTL. */
export function durationLabel(stage: StageId): string {
  const { minMonths, maxMonths } = STAGE_CONTENT[stage].duration;
  if (minMonths === maxMonths) return minMonths === 1 ? 'כחודש' : `כ-${minMonths} חודשים`;
  return `${isolateLtr(`${minMonths}–${maxMonths}`)} חודשים`;
}
