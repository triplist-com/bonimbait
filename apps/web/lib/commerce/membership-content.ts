/**
 * Static copy of the live /membership-tiers/ page (template-mp-v6, crawled
 * 2026-09-28): hero, team, "why us", testimonials and FAQ. Plans, prices and
 * the comparison table come from the DB (service_plans / service_plan_prices).
 *
 * Media was migrated from wp-content/uploads to Supabase Storage (same
 * uploads/... path; list in scripts/migrate/static_media.json), so URLs are
 * built with mediaUrl() and follow NEXT_PUBLIC_MEDIA_BASE_URL at cutover.
 */

import { mediaUrl } from '@/lib/media';

export const MEMBERSHIP_SEO = {
  title: 'תכניות הניהול פרוייקטים של בונים בית - בונים בית',
  description:
    'חריגות בתקציב, חוסר תיאום, עיכובים ולחצים – ניהול אחד שסוגר הכל. שלושה מסלולי ניהול, הנדסה, בקרה ופיקוח לבנייה פרטית: בונים תקציב, בונים בית פלוס ובונים בית עד מפתח.',
};

export const HERO = {
  lead: 'חריגות בתקציב, חוסר תיאום, עיכובים ולחצים -',
  highlight: 'ניהול אחד שסוגר הכל.',
  eyebrow: 'ניהול · הנדסה · בקרה · פיקוח',
  cta: 'מעוניינים לתאם פגישת ייעוץ חינמית',
  youtubeId: 'TmZp6uXGMwY',
  poster: mediaUrl('uploads/2026/02/Group-1000004803.jpg'),
};

export type TeamMember = { name: string; role: string; role2?: string; quote: string; bio?: string; photo: string };

export const TEAM: TeamMember[] = [
  { name: 'תומר חן ריחאנה', role: 'מומחה בניה', role2: 'מייסד בונים בית', quote: 'באתי לשנות את הנעשה בתחום הבניה הפרטית ולתת ערך למשפחות הבונים והמשפצים. באתי מאהבה.', bio: 'תומר, תושב חדרה, נשוי לעינב ואבא להראל, ירדן ולייה.', photo: 'tomer-white.webp' },
  { name: 'צורי גלילי', role: 'מנהל מקצועי', role2: 'עו״ד מקרקעין', quote: 'תקציב בניה זה המצפן שלנו בפרויקט הבניה, ה־Waze לניווט מוצלח במסע.', bio: 'צורי תושב חולון, נשוי ליעל, אבא לתאיר, נויה וליעד. עו״ד מקרקעין, מנהל פרויקטים וחשב כמויות מוסמך.', photo: 'zuri-white.webp' },
  { name: 'שני לוי', role: 'עורכת וידאו ותוכן דיגיטלי', quote: 'מאחורי כל יצירה, תהליך או חלום שמתגשם יש סיפור ששווה לספר.', bio: 'שני, תושבת חדרה, נשואה ואמא ל-5 ילדים.', photo: 'shani-levi-white.webp' },
  { name: 'מורן יוסיאן', role: 'תיאומים ורישוי', quote: 'אישור שמגיע בזמן שווה חודשים של שקט.', bio: 'מורן, תושבת בת ים, נשואה לשימי ואמא לאדל, טוהר ועלמה.', photo: 'moran-white.webp' },
  { name: 'מאור חג׳ג', role: 'מהנדס אינסטלציה', quote: 'מערכת שתוכננה נכון פעם אחת לא תטריד אתכם לעולם.', photo: 'maor-white.webp' },
  { name: 'אורן לוי', role: 'מתכנן מערכות מתח נמוך', quote: 'בית חכם אמיתי מתחיל מתשתית מסודרת, לא מגאדגט.', photo: 'oren-white.webp' },
  { name: 'אור שנאור', role: 'יועץ חלונות', quote: 'החלון הנכון מכניס אור וחוסם רעש וחום בדיוק איפה שצריך.', photo: 'or-shnaor-white.webp' },
  { name: 'אליאור ליאוטק', role: 'מתכנן בריכות', quote: 'בריכה טובה היא הנדסה מדויקת לפני שהיא הנאה.', photo: 'elior-white.webp' },
  { name: 'תמיר ממן', role: 'מנהל מערכות', quote: 'כשהכול מסונכרן במקום אחד, הפרויקט פשוט זורם.', bio: 'תושב מצפה רמון, נשוי ליפית.', photo: 'tamir-white.webp' },
  { name: 'איתמר ושני', role: 'קשרי קהילה', quote: 'מאחורי כל פרויקט יש משפחה, ואנחנו כאן בשבילה.', bio: 'נהרייתים, נשואים זה לזו והורים לאביגיל.', photo: 'itamar-shani-white.webp' },
];

export function teamPhotoUrl(file: string): string {
  return mediaUrl(`uploads/mp-v6/team/${file}`);
}

export const WHY: Array<{ title: string; text: string }> = [
  { title: 'מקצועיות', text: 'בונים בית נחשבת אוטוריטה מקצועית בתחום הבניה הפרטית, והנה חברת הניהול והפיקוח המובילה בתחומה — הן מבחינה מקצועית והן מבחינה כמותית.' },
  { title: 'קשרים', text: 'לבונים בית קשרי עבודה מעולים המבוססים על הערכה ואמון עם אנשי מקצוע, קבלנים וספקים בענף הבניה הפרטית.' },
  { title: 'טכנולוגיה', text: 'בונים בית מוגדרת חברת Tech Construction ומובילה את המהפכה הטכנולוגית בתחום הניהול והפיקוח.' },
  { title: 'אסטרטגיה', text: 'האסטרטגיה של בונים בית מתבססת על אימוץ עקרונות ניהול ושימוש בכלים במטרה לייעל את הבניה ברמת התכנון, איכות הביצוע והחיסכון הכספי.' },
  { title: 'כוח קנייה', text: 'כוח הקניה של בונים בית נובע מפעילות התוכן האדירה, הקהילה הגדולה וכמות הפרויקטים שתחת ניהולה.' },
  { title: 'חיסכון', text: 'כל יתרון וערך שיש לבונים בית, בדגש על הערך המקצועי והיתרון הטכנולוגי, מביאים לחיסכון כספי משמעותי.' },
];

/** Vertical video testimonials (mp4 + webp poster). */
export const TESTIMONIALS: Array<{ id: string; label: string }> = [
  { id: 'testi-eyal', label: 'המלצה של אייל' },
  { id: 'testi-alex-amir', label: 'המלצה של אלכס ועמיר' },
  { id: 'testi-guy', label: 'המלצה של גיא' },
];

export function testimonialMedia(id: string) {
  return { video: mediaUrl(`uploads/mp-v6/videos/${id}.mp4`), poster: mediaUrl(`uploads/mp-v6/videos/${id}.webp`) };
}

export const FAQ: Array<{ group: string; items: Array<{ q: string; a: string }> }> = [
  {
    group: 'כללי',
    items: [
      { q: 'מתי כדאי לפנות אליכם?', a: 'מומלץ כבר בשלב התכנון, לפני שמתחילים לבנות. ככל שניכנס מוקדם יותר, נוכל לחסוך לכם יותר כסף ולמנוע טעויות יקרות.' },
      { q: 'האם הליווי מתאים גם לפרויקט קטן?', a: 'כן. תוכנית "בונים תקציב" מתאימה לכל פרויקט, ותוכנית "בונים בית פלוס" מאפשרת להוסיף בדיוק את הרכיבים שאתם צריכים.' },
      { q: 'איפה אתם פועלים?', a: 'בכל הארץ מצפון לדרום. בפגישת הייעוץ נוודא התאמה לאזור שלכם ביחס למסלול בונים בית עד מפתח.' },
    ],
  },
  {
    group: 'תקציב ועלויות',
    items: [
      { q: 'כמה אפשר לחסוך?', a: 'בממוצע 6%–8% מעלות הפרויקט, דרך תקציב מדויק, כוח קנייה וניהול מכרזים נכון. אצל חלק מהמשפחות החיסכון מחזיר את עלות הליווי כמה פעמים.' },
      { q: 'המחירים כוללים מע״מ?', a: 'המחירים המוצגים אינם כוללים מע״מ. בפגישת הייעוץ תקבלו הצעת מחיר מסודרת ומפורטת.' },
      { q: 'אפשר לשדרג בין מסלולים?', a: 'בהחלט. אפשר להתחיל מתקציב ולהוסיף מודולים בהמשך, או לעבור לליווי מלא עד מפתח בכל שלב.' },
    ],
  },
  {
    group: 'התהליך',
    items: [
      { q: 'האם הפגישה הראשונה בתשלום?', a: 'לא. פגישת ההיכרות היא ללא עלות וללא התחייבות — נכיר את הפרויקט ונראה איך נוכל לעזור.' },
      { q: 'מי מלווה אותנו בפועל?', a: 'צוות בונים בית — מהנדס ביצוע, מנהל פרויקטים וכלכלן בניה, בהתאם למסלול שבחרתם.' },
      { q: 'כמה זמן נמשך הליווי?', a: 'משתנה לפי המסלול והפרויקט — מליווי תקציבי ממוקד ועד ניהול מלא לאורך כל הבניה.' },
    ],
  },
];
