/**
 * "פה הכי קל לחרוג": the three places a budget like this most often overruns,
 * each with the exact podcast moment where Tomer and Tzuri explain it.
 *
 * Moments are PINNED, not searched at runtime. They were picked offline from the
 * static index (apps/web/data/search-index.json, segment `marks`, the same rule
 * as lib/knowledge/moments.ts secondAt) and checked against the transcript:
 *
 *   fees              X78Yo_sJgIM  25:23  ep. 107  "עלות כואבת כבדה נוספת זה כל נושא האגרות וההיטלים"
 *   development       vluNH7GTkU4  26:27  ep. 109  "השלד… 700 אלף, ובצד עוד 200-250 בפיתוח, יציקות וחומות"
 *   railings          vluNH7GTkU4  39:44  ep. 109  "מעקות, גדרות… לפעמים מגיע ל-100-150 אלף"
 *   contractor_meter  vluNH7GTkU4  22:44  ep. 109  "לשים לב למטר הקבלני שלכם"
 *   basement          X78Yo_sJgIM  46:55  ep. 107  "אני אשים רצפה של 250 מטר… זה המון המון כסף"
 *   pool              vluNH7GTkU4  43:07  ep. 109  "בריכת הבטון… עפו להם עוד 80, 90, 100 אלף"
 *   vrf               vluNH7GTkU4  48:02  ep. 109  "גבס… 350-400 ש״ח למטר… תריסים למיזוג"
 *
 * Quotes are the cleaned versions from the owner's 2026 articles (the captions
 * are raw speech). Client-safe.
 */
import { amountText } from './format';
import type { PlannerEstimate, PlannerInput } from './types';

export interface VideoMoment {
  youtubeId: string;
  /** Seconds into the video. */
  start: number;
  /** "פרק 107" */
  episode: string;
  /** What is said there, for the play button. */
  label: string;
}

export type OverrunWarningId = 'fees' | 'development' | 'railings' | 'contractor_meter' | 'basement' | 'pool' | 'vrf';

export interface OverrunWarning {
  id: OverrunWarningId;
  /** Lower comes first. */
  priority: number;
  title: string;
  body: string;
  tip: string;
  quote: { text: string; who: string };
  /** Price book source id the quote and figure come from. */
  sourceId: string;
  moment: VideoMoment;
  /** Only shown when the answers make it relevant. */
  when?: (input: PlannerInput) => boolean;
  /** Not shown when the answers already price it in. */
  skipWhen?: (input: PlannerInput) => boolean;
  /** Size of the risk for this house, as short text. */
  impact: (estimate: PlannerEstimate) => string;
}

const FEES_MAX_PER_M2 = 850;

export const OVERRUN_WARNINGS: readonly OverrunWarning[] = [
  {
    id: 'fees',
    priority: 10,
    title: 'אגרות והיטלים',
    body: 'אגרת הבנייה הקבועה היא 37 ₪ למ״ר, אבל עם היטלי פיתוח, ביוב ותאגיד מים אותו בית יכול לשלם עד 850 ₪ למ״ר. ההבדל תלוי רק בוועדה המקומית.',
    tip: 'בדקו מול גזברות הוועדה ותאגיד המים עוד לפני שקונים מגרש, ושאלו שכנים שבנו כמה הם שילמו.',
    quote: { text: 'זה יכול לנוע מאפס ועד 600-850 שקלים למ״ר. כמה שזה נשמע קוטבי.', who: 'צורי גלילי, בונים בית' },
    sourceId: 'article-cost-2026',
    moment: { youtubeId: 'X78Yo_sJgIM', start: 1523, episode: 'פרק 107', label: 'צורי על אגרות והיטלים' },
    impact: (e) => `0–${amountText(e.input.sizeM2 * FEES_MAX_PER_M2)} בבית של ${e.input.sizeM2} מ״ר (בהערכה: ממוצע של כ-400 ₪ למ״ר)`,
  },
  {
    id: 'basement',
    priority: 15,
    title: 'מרתף "לעתיד"',
    body: 'גם מרתף בלי גמר הוא רצפה, קירות, ברזל ואיטום. מי שיוצק מרתף גדול "כי אולי נצטרך" משלם על כל מטר שלו כבר בשלב השלד.',
    tip: 'תכננו מרתף בגודל שתשתמשו בו, ובדקו מראש סוג קרקע, איטום וניקוז. יחידה להשכרה יכולה להחזיר את ההשקעה.',
    quote: { text: 'מי שמנצל את כל זכויות הבנייה ומוסיף מרתף ענק "לעתיד" – צריך לדעת שכל מטר רצפה = כסף גדול.', who: 'בונים בית' },
    sourceId: 'article-execution-2026',
    moment: { youtubeId: 'X78Yo_sJgIM', start: 2815, episode: 'פרק 107', label: 'מרתף של 250 מטר "רק רצפה"' },
    when: (input) => input.extras.includes('basement'),
    impact: () => '₪700-800 אלף למרתף טיפוסי',
  },
  {
    id: 'pool',
    priority: 16,
    title: 'הבריכה מתחילה בשלד',
    body: 'את גוף הבריכה בונה קבלן השלד, וזה עוד 80-100 אלף לפני שקבלן הבריכות נכנס. בריכה מגדילה גם את חיבור החשמל של הבית.',
    tip: 'תכננו את הבריכה יחד עם השלד ולא אחריו, ובקשו הצעה שכוללת את כל הסעיפים.',
    quote: { text: 'בסוף מי שצריך לבנות את בריכת הבטון זה קבלן השלד – והופ, עפו להם עוד 80, 90, 100 אלף שקל.', who: 'מתוך פרק 109 בפודקאסט' },
    sourceId: 'podcast-109',
    moment: { youtubeId: 'vluNH7GTkU4', start: 2587, episode: 'פרק 109', label: 'מה הבריכה עושה לשלד' },
    when: (input) => input.extras.includes('pool'),
    impact: () => 'עוד ₪80-100 אלף בשלד',
  },
  {
    id: 'vrf',
    priority: 17,
    title: 'מיזוג נסתר גורר גבס ותאורה',
    body: 'מיזוג VRF צריך הנמכות גבס לתעלות, והנמכות מייקרות גם את גופי התאורה. גבס עולה 350-400 ₪ למ״ר, וסלון של 100 מ״ר עם הנמכות מגיע ל-60-80 אלף.',
    tip: 'תכננו קודם מיזוג יעיל, ורק אחר כך את הגבס. לא הפוך.',
    quote: { text: 'לא למשוך את הגבס אחרי המיזוג. קודם מתכננים מיזוג יעיל, ואז מתאימים את הגבס. לא הפוך.', who: 'צורי גלילי, בונים בית' },
    sourceId: 'article-execution-2026',
    moment: { youtubeId: 'vluNH7GTkU4', start: 2882, episode: 'פרק 109', label: 'גבס, הנמכות ומיזוג' },
    when: (input) => input.extras.includes('vrf') || input.finishLevel === 'high' || input.finishLevel === 'luxury',
    impact: () => '₪60-80 אלף בגבס בלבד',
  },
  {
    id: 'development',
    priority: 20,
    title: 'פיתוח, חומות ומשטחי חוץ',
    body: 'השלד לבד הוא כ-700 אלף. חומות, מילוי אדמה ומשטחי חוץ מוסיפים לא פעם עוד 200-250 אלף, והם לא מופיעים במטר האדריכלי.',
    tip: 'בדקו את הטופוגרפיה כבר בשלב הרכישה, וצמצמו משטחים יצוקים בחוץ.',
    quote: { text: 'במקום לגמור ב-70 אלף חומות – מסיימים ב-250 אלף.', who: 'בונים בית' },
    sourceId: 'article-cost-2026',
    moment: { youtubeId: 'vluNH7GTkU4', start: 1587, episode: 'פרק 109', label: 'שלד, ועוד 200-250 אלף בפיתוח' },
    skipWhen: (input) => input.extras.includes('slope'),
    impact: () => '₪200-250 אלף',
  },
  {
    id: 'railings',
    priority: 30,
    title: 'מעקות, מסגרות ופרגולות',
    body: 'כל מרפסת, מדרגה וגדר מוסיפה מטרים של מעקה. בסוף זה 100-150 אלף שכמעט אף אחד לא תקצב מראש.',
    tip: 'תקצבו מעקות כבר בתכנון. אם התקציב לחוץ, צמצמו מרפסות בקומה השנייה: כל מטר מרפסת הוא מטר מעקה.',
    quote: { text: 'מעקות בטיחות – 1,100 עד 1,900 שקל למטר אורך. זכוכית, ברזל, אלומיניום – שלושתם יקרים. אין לך יותר מדי חלופה.', who: 'צורי גלילי, בונים בית' },
    sourceId: 'article-execution-2026',
    moment: { youtubeId: 'vluNH7GTkU4', start: 2384, episode: 'פרק 109', label: 'מעקות וגדרות: 100-150 אלף' },
    impact: () => '₪100-150 אלף',
  },
  {
    id: 'contractor_meter',
    priority: 40,
    title: 'מטר קבלני מול מטר אדריכלי',
    body: 'הקבלן מתמחר את השלד לפי מה שיוצקים: מרפסות, חללים כפולים, משטחי חוץ וחומות. בית של 210 מ״ר אדריכלי יכול להיות 430 מ״ר קבלני.',
    tip: 'בקשו הצעת מחיר לפי מטר קבלני מפורט, והשוו אותה לתוכניות לפני שחותמים.',
    quote: { text: 'באים אלינו אנשים ואומרים – אני 210 מטר אדריכלי, איך יצא לי שלד כל כך יקר? אבל המטר הקבלני של הבית הוא 430 מטר.', who: 'צורי גלילי, בונים בית' },
    sourceId: 'article-execution-2026',
    moment: { youtubeId: 'vluNH7GTkU4', start: 1364, episode: 'פרק 109', label: 'מה זה מטר קבלני' },
    impact: () => 'עד פי 2 במטרים שהקבלן סופר',
  },
];

/** The three warnings for these answers: relevant ones first, by priority. */
export function selectOverrunWarnings(input: PlannerInput, count = 3): OverrunWarning[] {
  return OVERRUN_WARNINGS.filter((w) => (w.when ? w.when(input) : true) && !(w.skipWhen?.(input) ?? false))
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .slice(0, count);
}

/** Our page for a moment (the static video page honours ?t=). */
export function momentHref(moment: Pick<VideoMoment, 'youtubeId' | 'start'>): string {
  return `/video/${moment.youtubeId}/?t=${Math.floor(moment.start)}`;
}

/** "25:23" */
export function momentClock(start: number): string {
  const s = Math.max(0, Math.floor(start));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
