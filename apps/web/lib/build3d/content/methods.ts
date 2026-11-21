/**
 * Construction-method metadata for the picker, the viewer switcher and the comparison summary
 * (docs/build3d/METHODS.md). Pure data: safe to import from the landing.
 *
 * Owned by the researcher (figures and sources: docs/build3d/methods-research.md). Numbers here are
 * the method's *typical* figures for a ~250–300 m² private house in Israel; the per-step sums for this
 * house live in METHOD_TOTALS (content/totals.ts).
 */
import type { MethodId } from '../methods';

export interface MethodInfo {
  id: MethodId;
  nameHe: string;
  /** 2–4 words for chips / segmented controls. */
  shortHe: string;
  /** One sentence for the picker card. */
  taglineHe: string;
  /** 2–3 sentences: what it is and how it is built. */
  descHe: string;
  /** Typical build time for this house, months (structure → keys). */
  months: number;
  /** Relative cost vs concrete, e.g. +0.04 = 4% more. */
  costVsConcrete: number;
  /** 1–5 (5 = best): thermal performance, speed, Israeli market availability. */
  scores: { thermal: number; speed: number; availability: number };
  prosHe: string[];
  consHe: string[];
  /** Phase names that differ from the concrete ones (by phase id 0–13). */
  phaseNamesHe: Partial<Record<number, string>>;
  /** Short badge for the picker, e.g. "הנפוצה בישראל". */
  badgeHe?: string;
}

/**
 * Qualitative data per method (research: docs/build3d/methods-research.md). `months` / `costVsConcrete` mirror
 * this house's computed METHOD_TOTALS (the UI computes them from there; these are for reference only).
 */
export const METHODS_INFO: Record<MethodId, MethodInfo> = {
  concrete: {
    id: 'concrete',
    nameHe: 'בטון ובלוקים',
    shortHe: 'בטון ובלוקים',
    taglineHe: 'שלד בטון מזוין ומילוי בלוקים: השיטה הנפוצה בישראל.',
    descHe: 'שלד בטון מזוין (עמודים, קורות ותקרות) ומילוי קירות בבלוקים, עם טיח ובידוד מבחוץ. זו השיטה שרוב הקבלנים, המהנדסים והבנקים בישראל מכירים, והיא גם מה שמתאים הכי טבעי לקומה תחתונה חצובה במדרון.',
    months: 16.5,
    costVsConcrete: 0,
    scores: { thermal: 2, speed: 2, availability: 5 },
    prosHe: [
      'כל קבלן ומהנדס בארץ מכיר אותה',
      'חוסן, עמידות באש ובקול ללא תוספות',
      'פשוטה לאישור בנק, שמאי וביטוח',
      'קל לשנות ולהרחיב בהמשך'
    ],
    consHe: [
      'הארוכה מבין השיטות עד מפתח',
      'בידוד תרמי חלש בלי שכבות נוספות',
      'הרבה עבודה רטובה ופסולת באתר',
      'תלויה בזמני ייבוש ובמזג האוויר'
    ],
    phaseNamesHe: {},
    badgeHe: 'הנפוצה בישראל',
  },
  icf: {
    id: 'icf',
    nameHe: 'ICF: תבניות בידוד יצוקות',
    shortHe: 'ICF',
    taglineHe: 'קירות בטון שנוצקים בתוך בלוקי קלקר שנשארים כבידוד.',
    descHe: 'קירות בטון מזוין שנוצקים בתוך בלוקי קלקר חלולים. הבלוקים נערמים כמו לגו, מכניסים ברזל, יוצקים, והקלקר נשאר בקיר כבידוד קבוע. מקבלים קיר בטון חזק ומבודד בשלב אחד.',
    months: 15,
    costVsConcrete: 0.02,
    badgeHe: 'בידוד מעולה',
    scores: { thermal: 5, speed: 3, availability: 3 },
    prosHe: [
      'בידוד תרמי מעולה וקירות אטומים לרוחות',
      'חזק כמו בטון ועמיד באש',
      'שלד ובידוד בשלב אחד, מהיר מבלוקים',
      'פחות גשרי קור ופחות חיפוי בידוד נפרד'
    ],
    consHe: [
      'מעט קבלנים מנוסים בשיטה בישראל',
      'מעט יקר מבטון ובלוקים',
      'יציקה בגבהים מחייבת פיקוח צמוד',
      'קשה לשנות פתחים אחרי היציקה'
    ],
    phaseNamesHe: { 4: 'קומה תחתונה: קירות ICF', 6: 'קומת כניסה: קירות ICF', 7: 'מחיצות ומעקות' },
  },
  steel: {
    id: 'steel',
    nameHe: 'שלד פלדה קלה (LSF)',
    shortHe: 'פלדה קלה',
    taglineHe: 'קירות וקורות מפרופילי פלדה מגולוונת, מעל קומה תחתונה מבטון.',
    descHe: 'קירות, מחיצות וקורות גג מפרופילי פלדה מגולוונת דקים, שמורכבים מראש בפאנלים ומכוסים בלוחות צמנט, צמר סלעים וגבס. הקומה התחתונה והממ״ד נשארים מבטון, והשלד הקל עולה מעליהם בשבועות ספורים.',
    months: 15,
    costVsConcrete: 0.065,
    badgeHe: 'בנייה יבשה',
    scores: { thermal: 4, speed: 5, availability: 3 },
    prosHe: [
      'השלד הקל עולה תוך שבועות ספורים',
      'קל, מדויק ולא רקוב ולא מתעפש',
      'צנרת וחשמל עוברים בתוך הקירות הפתוחים',
      'בלי זמני ייבוש ואשפרה לשלד'
    ],
    consHe: [
      'בידוד אקוסטי בינוני בלי צמר סלעים',
      'פחות קבלנים ופחות ניסיון בבתים פרטיים',
      'שמאים, בנקים וביטוח עשויים להיזהר',
      'פרטי איטום וגשרי קור דורשים ביצוע מדויק'
    ],
    phaseNamesHe: { 6: 'קומת כניסה: שלד פלדה קלה', 7: 'מילוי ומחיצות', 10: 'מעטפת: לוחות, בידוד וגבס' },
  },
  timber: {
    id: 'timber',
    nameHe: 'מסגרת עץ',
    shortHe: 'עץ',
    taglineHe: 'קירות מניצבי עץ ולוחות OSB, מעל קומה תחתונה מבטון.',
    descHe: 'קירות מניצבי עץ מרוחקים כ-60 ס״מ, מכוסים בלוחות OSB, עם קורות גג מעץ ובידוד בין הניצבים. כמו בפלדה קלה, הקומה התחתונה והממ״ד מבטון והמסגרת מתחילה בקומת הכניסה. עץ הוא חומר חם, מבודד ומהיר להרכבה.',
    months: 15,
    costVsConcrete: 0.066,
    scores: { thermal: 4, speed: 5, availability: 2 },
    prosHe: [
      'המסגרת עולה תוך שבועות ספורים',
      'בידוד תרמי טוב ותחושת בית חמה',
      'עבודה יבשה, נקייה ושקטה באתר',
      'משקל קל מקטין את עומס היסודות'
    ],
    consHe: [
      'חומר מיובא, יקר מבטון ובלוקים',
      'דורש הגנה מרטיבות, טרמיטים ואש',
      'מעט מאוד קבלנים מנוסים בישראל',
      'בנקים, שמאים וביטוח עשויים להיזהר'
    ],
    phaseNamesHe: { 6: 'קומת כניסה: מסגרת עץ', 7: 'מילוי ומחיצות', 10: 'מעטפת: לוחות, בידוד וגבס' },
  },
  precast: {
    id: 'precast',
    nameHe: 'בנייה טרומית',
    shortHe: 'טרומי',
    badgeHe: 'הכי מהירה',
    taglineHe: 'פאנלים ולוחות בטון מהמפעל, מורכבים במנוף תוך ימים.',
    descHe: 'פאנלים של קירות ולוחות תקרה חלולים שמיוצרים במפעל ומובאים לאתר. מנוף נייד מרכיב אותם תוך ימים על הקורות והיסודות, ויוצקים רק את החיבורים ושכבת בטון דקה בתקרה. גם הממ״ד מגיע כמודול מוכן.',
    months: 13.5,
    costVsConcrete: 0.062,
    scores: { thermal: 3, speed: 4, availability: 4 },
    prosHe: [
      'הרכבת השלד תוך ימים ספורים',
      'איכות בטון קבועה מהמפעל',
      'עמיד באש ובקול כמו בטון',
      'פחות פסולת ופחות עבודה רטובה'
    ],
    consHe: [
      'דורשת תכנון מדויק לפני הייצור',
      'מנוף ושינוע מחייבים גישה לרחוב',
      'שינויים אחרי הייצור יקרים או בלתי אפשריים',
      'עלות גבוהה מעט, וחיבורים שצריך לאטום'
    ],
    phaseNamesHe: { 4: 'קומה תחתונה: הרכבת פאנלים', 5: 'תקרה: לוחות חלולים', 6: 'קומת כניסה: הרכבת פאנלים', 7: 'מחיצות ומעקות' },
  },
};
