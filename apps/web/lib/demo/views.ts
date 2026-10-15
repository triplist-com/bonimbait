/**
 * Registered demo views, listed on /platform/demo/. Every Wave B squad ships
 * /platform/demo/<slug>/ (no auth, fixtures only) and flips its entry to
 * 'ready' here. One entry per squad; keep the order (pillars P1..P6, then F).
 */
import type { DemoSquad } from './fixtures/define';

export type DemoViewStatus = 'ready' | 'planned';

export type DemoView = {
  /** URL segment: /platform/demo/<slug>/ */
  slug: string;
  squad: DemoSquad;
  /** Product pillar from docs/platform/PROGRAM.md §3. */
  pillar: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'F';
  title: string;
  description: string;
  status: DemoViewStatus;
};

export const DEMO_VIEWS: readonly DemoView[] = [
  {
    slug: 'advisor',
    squad: 'advisor',
    pillar: 'P1',
    title: 'היועץ החכם',
    description: 'שיחה בעברית שמבוססת על הסרטונים, המאמרים והפודקאסטים, מנגנת את הרגע המדויק בסרטון ומציעה את השאלה הבאה.',
    status: 'ready',
  },
  {
    slug: 'hub',
    squad: 'hub',
    pillar: 'P2',
    title: 'הבית שלי',
    description:
      'משפחת לוי בונה 220 מ״ר בשרון: מפת דרך ב-7 השלבים של בונים בית, מה עושים השבוע, תקציב מול הערכה עם הצעות ותשלומים, מסמכים, משימות ותיק פרויקט לפגישת הייעוץ.',
    status: 'ready',
  },
  // P3 has three views (/platform/demo/revenue/ redirects to the first).
  {
    slug: 'consult-queue',
    squad: 'revenue',
    pillar: 'P3',
    title: 'תור הייעוצים',
    description: 'כל פנייה לייעוץ מגיעה עם תיק פרויקט וציון: השלב, האזור, התקציב ומה שאלו באתר. צורי יודע מי מתקשר, לפני שהרים טלפון.',
    status: 'ready',
  },
  {
    slug: 'partner',
    squad: 'revenue',
    pillar: 'P3',
    title: 'דוח שותף',
    description: 'הדוח החודשי של "חלונות הגליל": מחשיפות נצפות, דרך בונים ששאלו על חלונות ובקשות הצעת מחיר, ועד עסקאות והחזר על ההשקעה.',
    status: 'ready',
  },
  {
    slug: 'pro',
    squad: 'revenue',
    pillar: 'P3',
    title: 'פורטל בעל מקצוע',
    description: 'מה האתר הביא לקבלן שלד: צפיות, טלפונים, פניות וביקוש בתחום, מקום בין עמיתים, השלמת פרופיל ומסלולי שותפות.',
    status: 'ready',
  },
  {
    slug: 'command',
    squad: 'command',
    pillar: 'P4',
    title: 'חדר הבקרה',
    description: 'כל העסק במסך אחד: צבר, פגישות ייעוץ, לידים חמים, שותפים ועלות ה-AI, והשאלות שעוד אין עליהן סרטון.',
    status: 'ready',
  },
  {
    slug: 'growth',
    squad: 'growth',
    pillar: 'P6',
    title: 'מתכנן התקציב',
    description: 'מחשבון תקציב שמפיק דוח הערכה מקצועי ומוביל לפגישת הייעוץ.',
    status: 'ready',
  },
  {
    slug: 'foundation',
    squad: 'foundation',
    pillar: 'F',
    title: 'ערכת נתוני ההדגמה',
    description: 'הנתונים שכל מסך הדגמה נשען עליהם: בונים, יישובים בכל האזורים, שלבי בנייה, לידים ושאלות, עם עונתיות שבועית וצמיחה.',
    status: 'ready',
  },
];

export function demoViewHref(view: Pick<DemoView, 'slug'>): string {
  return `/platform/demo/${view.slug}/`;
}
