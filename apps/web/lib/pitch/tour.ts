/**
 * The guided 15-minute demo (/platform/tour/), beat by beat, following the
 * sales strategy's demo storyline: P1 → P6 → P2 → P4 → P3 → P7 → P5 → F.
 *
 * Everything here may be read by the owner (the tour link is shared with
 * him): key lines are what is said in the room, presenter notes are how to
 * drive the screens. Prices, offers and negotiation notes never go here.
 *
 * Targets are resolved against the demo registry (lib/demo/views.ts) and the
 * feature flags, so a beat opens its demo view once that view is 'ready' and
 * falls back to the live site (or "בקרוב") until then. Pure, client-safe.
 */
import type { FlagName } from '@/lib/flags';
import { aiHref } from '@/lib/nav';
import { DEMO_QUESTION, demoHref, type PillarId, type RegistryView } from './pillars';
import { ltr } from './text';

export type TourTarget =
  | { kind: 'demo'; slug: string; label?: string }
  | { kind: 'site'; href: string; label?: string; flag?: FlagName; staffOnly?: boolean }
  | { kind: 'pitch'; anchor: string; label?: string };

/** Figures computed by the page at render time (never hard-coded). */
export type MeasuredFigureKey = 'library' | 'switch' | 'roi' | 'autopilot';

export type TourFigure =
  /** The owner's own public numbers (his articles and price list). */
  | { source: 'owner'; value: string; label: string }
  /** Demo fixtures: always labelled as sample data. */
  | { source: 'demo'; value: string; label: string }
  /** Computed from our data or measurements when the page renders. */
  | { source: 'measured'; key: MeasuredFigureKey; label: string };

export interface TourBeat {
  id: string;
  /** Minutes from the start of the meeting. */
  from: number;
  to: number;
  title: string;
  pillars: readonly PillarId[];
  device: 'phone' | 'laptop';
  /** What is on screen. */
  screen: string;
  /** Preferred first; the first available one is the main "פתחו" button. */
  targets: readonly TourTarget[];
  /** Key lines, said in the room. */
  lines: readonly string[];
  figure?: TourFigure;
  /** Presenter notes: what to click, and what to do if something fails. */
  notes: readonly string[];
}

export const TOUR_MINUTES = 15;

/** Tomer's own words (bonimbayit.co.il, the 2026 management page). */
export const OWNER_QUOTE = {
  text: 'רציתי ליצור מקום אחד שמרכז את כל הידע, הכלים, ההכוונה, והקהילה',
  author: 'תומר חן ריחאנה',
  role: 'מייסד ומנכ״ל בונים בית',
  source: 'מתוך עמוד הליווי והפיקוח של בונים בית, 2026',
} as const;

export const TOUR_BEATS: readonly TourBeat[] = [
  {
    id: 'opening',
    from: 0,
    to: 1,
    title: 'פתיחה: במילים שלכם',
    pillars: [],
    device: 'phone',
    screen: 'דף הסקירה, הפתיח',
    targets: [{ kind: 'pitch', anchor: '#top' }],
    lines: [`״${OWNER_QUOTE.text}.״`, 'בנינו את המקום הזה. עם התוכן שלכם. הוא כבר רץ.'],
    notes: ['פתחו את דף הסקירה בנייד, עם המסך משוקף.', 'קראו את הציטוט כפי שהוא, ורק אז את הכותרת.'],
  },
  {
    id: 'business',
    from: 1,
    to: 2.5,
    title: 'העסק שלכם במסך אחד',
    pillars: [],
    device: 'phone',
    screen: 'דף הסקירה, ״העסק שלכם במסך אחד״',
    targets: [{ kind: 'pitch', anchor: '#business' }],
    lines: [
      'אתם לא בלוג עם מרקטפלייס. אתם חברת ניהול עם מנוע תוכן.',
      'הפלטפורמה בנויה בדיוק לזה: תוכן, קהילה, פגישת ייעוץ, תוכניות ניהול, ושותפים לאורך כל הדרך.',
    ],
    figure: { source: 'measured', key: 'library', label: 'מחושב מהנתונים, נכון להיום' },
    notes: ['כל מספר במסך מחושב מהנתונים או לקוח מהעמודים הציבוריים שלכם; אין כאן אף הנחה.'],
  },
  {
    id: 'advisor',
    from: 2.5,
    to: 5,
    title: 'וואו 1: תשובה מהשטח, עם הרגע המדויק',
    pillars: ['P1'],
    device: 'phone',
    screen: 'היועץ בנייד, במותג שלכם',
    targets: [
      { kind: 'demo', slug: 'advisor' },
      { kind: 'site', href: aiHref(DEMO_QUESTION), label: 'שאלו באתר' },
    ],
    lines: [
      `שאלו: ״${DEMO_QUESTION}״`,
      'תנו לתשובה לזרום, ואז לחצו נגן: הפודקאסט מתחיל בשנייה שבה זה נאמר.',
      'כל התשובות רק מהספרייה שלכם, עם הרגע המדויק.',
      'לחצו על שאלת המשך.',
    ],
    figure: {
      source: 'owner',
      value: `≈ 800 אלף ₪ לשלד · ${ltr('12–14')} אלף ₪ למ״ר`,
      label: 'מהמאמר שלכם על עלויות 2026, לפני מע״מ',
    },
    notes: [
      'מסך ההדגמה מנגן תשובה מוקלטת: בלי עלות ובלי תלות ברשת. ״שאלו באתר״ שואל באמת.',
      'אם תשובה חיה מתעכבת: ״בגלל זה כל תשובה מצוטטת, בואו נפתח את המקור״, ופתחו אותו.',
    ],
  },
  {
    id: 'project-file',
    from: 5,
    to: 7,
    title: 'וואו 2: תקציב ראשוני, הבית שלי ותיק פרויקט',
    pillars: ['P6', 'P2'],
    device: 'phone',
    screen: 'המתכנן בנייד, ואז התור של צורי במחשב',
    targets: [
      { kind: 'demo', slug: 'growth' },
      { kind: 'site', href: '/calculator/', label: 'פתחו את המתכנן' },
      { kind: 'demo', slug: 'hub', label: 'הבית שלי' },
      { kind: 'demo', slug: 'consult-queue', label: 'התור של צורי' },
    ],
    lines: [
      'לחצו ״תקציב ראשוני ב-3 דקות״, ענו על חמש שאלות, וקבלו טווח ומפת דרך.',
      'קבעו פגישת ייעוץ, ועברו למחשב: התיק כבר בתור.',
      'צורי יודע מי מתקשר, מה הוא שאל ובאיזה שלב הוא, לפני שהרים טלפון.',
    ],
    figure: {
      source: 'demo',
      value: `טווח ${ltr('2.4–2.8')} מיליון ₪ · ציון 82`,
      label: 'משפחה לדוגמה: 220 מ״ר בשרון, שלב היתר',
    },
    notes: [
      'הטווח לבית של 200 מ״ר הוא המספר שלכם מהמאמר על עלויות 2026; הציון והמשפחה הם נתוני הדגמה.',
      'אם המתכנן לא נטען: פתחו את ״הבית שלי״ ואת התור, וספרו את הדרך במילים.',
    ],
  },
  {
    id: 'command',
    from: 7,
    to: 8.5,
    title: 'וואו 3: חדר הבקרה',
    pillars: ['P4'],
    device: 'laptop',
    screen: 'חדר הבקרה במחשב',
    targets: [
      { kind: 'demo', slug: 'command' },
      { kind: 'site', href: '/admin/', label: 'פתחו בניהול', flag: 'commandCenter', staffOnly: true },
    ],
    lines: ['אריחי הצבר, ואז ״השאלות שעוד לא עניתם עליהן״.', 'הקהל שלכם אומר לכם מה לצלם.'],
    figure: { source: 'demo', value: 'צבר פוטנציאלי 1.4 מיליון ₪ · 46 שאלות בלי מענה', label: 'חדר בקרה לדוגמה' },
    notes: ['אמרו בקול שאלה נתוני הדגמה; במסך האמיתי אותם אריחים, על הנתונים שלכם.'],
  },
  {
    id: 'partner',
    from: 8.5,
    to: 10,
    title: 'וואו 4: דוח שותף',
    pillars: ['P3'],
    device: 'laptop',
    screen: 'הדוח החודשי של שותף לדוגמה',
    targets: [
      { kind: 'demo', slug: 'partner' },
      { kind: 'demo', slug: 'revenue' },
      { kind: 'demo', slug: 'pro', label: 'פורטל בעל מקצוע' },
      { kind: 'site', href: '/admin/partners/', label: 'פתחו בניהול', flag: 'revenue', staffOnly: true },
    ],
    lines: [
      'הדוח של השותף, ואז מסלול השדרוג: חברים, שותפים, שגרירים.',
      'זה הקייס סטאדי של פזגז, אוטומטי, לכל שותף, כל חודש.',
    ],
    figure: { source: 'demo', value: '112 שאלו על חלונות ← 37 בקשות הצעה ← 9 עסקאות', label: 'שותף לדוגמה: ״חלונות הגליל״' },
    notes: [
      'ההגדרות זהות לשלכם: חשיפה נצפית (חצי מהבאנר, שנייה, גולש פעיל), בלי כפילויות ב-30 דקות, ייחוס של 4 שעות.',
    ],
  },
  {
    id: 'bonimos',
    from: 10,
    to: 11,
    title: 'וואו 5: Bonim.Os',
    pillars: ['P7'],
    device: 'laptop',
    screen: 'פרויקט מנוהל, במותג שלכם',
    targets: [
      { kind: 'demo', slug: 'bonimos' },
      { kind: 'demo', slug: 'bonim-os' },
      { kind: 'site', href: '/membership-tiers/', label: 'שורה 3.3 במחירון' },
    ],
    lines: [
      'שורה 3.3 במחירון שלכם: ״חיבור למערכת Bonim.Os לשליטה מלאה״. עכשיו היא אמיתית.',
      'תקציב מול ביצוע, אבן הדרך הבאה, אישור תשלום ותמונות מהשטח.',
    ],
    figure: { source: 'demo', value: `תקציב מול ביצוע: ${ltr('+2.1%')}`, label: 'פרויקט לדוגמה' },
    notes: ['כל עוד מסך ההדגמה לא זמין, הכפתור פותח את עמוד התוכניות: הראו את שורה 3.3 וספרו מה יופיע שם.'],
  },
  {
    id: 'autopilot',
    from: 11,
    to: 12,
    title: 'טייס אוטומטי לתוכן',
    pillars: ['P5'],
    device: 'laptop',
    screen: 'תור הטייס האוטומטי בניהול',
    targets: [
      { kind: 'demo', slug: 'autopilot' },
      { kind: 'site', href: '/admin/autopilot/', label: 'פתחו בניהול', flag: 'autopilot', staffOnly: true },
    ],
    lines: ['סרטון חדש עולה ומקבל עמוד, פרקים ותשובות.', 'אתם ממשיכים לצלם. השאר קורה לבד.'],
    figure: { source: 'measured', key: 'autopilot', label: 'נמדד על סרטונים מהערוץ' },
    notes: [
      'בחרו סרטון שכבר עובד והראו: סיכום, פרקים עם זמנים, ״מוכן לפרסום״.',
      'שווה לציין את הצעד שלכם: שפת סרטון ״עברית״ ב-YouTube Studio לסרטונים בלי כתוביות.',
    ],
  },
  {
    id: 'switch',
    from: 12,
    to: 13.5,
    title: 'מעבר בלי סיכון',
    pillars: ['F'],
    device: 'laptop',
    screen: 'דף הסקירה, ״מעבר בלי סיכון״',
    targets: [
      { kind: 'pitch', anchor: '#switch' },
      { kind: 'site', href: '/admin/', label: 'הניהול בעברית', staffOnly: true },
    ],
    lines: [
      'דוח ההתאמה, האתר הישן מול החדש, תוכנית החזרה, וחצי דקה בניהול בעברית.',
      'גוגל ירגיש רק שהאתר מהיר יותר.',
    ],
    figure: { source: 'measured', key: 'switch', label: 'דוח ההתאמה ומדידת מהירות בנייד' },
    notes: ['בניהול: פוסטים, לידים ותוכניות. שלושה מסכים, לא יותר.'],
  },
  {
    id: 'numbers',
    from: 13.5,
    to: 15,
    title: 'המספרים שלכם',
    pillars: [],
    device: 'laptop',
    screen: 'דף הסקירה, המחשבון',
    targets: [{ kind: 'pitch', anchor: '#roi' }],
    lines: [
      'זה מקרה הבסיס. עכשיו בואו נשים את המספרים שלכם במקום ההנחות.',
      'הצעד הבא: גישת צפייה ל-GA4, והרצה מקבילה של שבועיים.',
      'ופגישת המשך עם צורי.',
    ],
    figure: { source: 'measured', key: 'roi', label: 'מקרה הבסיס, לפי הנחות לדוגמה' },
    notes: ['תנו לו להזיז את הסליידרים בעצמו. לא מבטיחים תנועה, מראים מה קורה בכל מספר.'],
  },
];

/* ------------------------------------------------------------------ */
/* Resolution against the registry and flags                           */
/* ------------------------------------------------------------------ */

export interface ResolvedTarget {
  href: string;
  label: string;
  kind: TourTarget['kind'];
  staffOnly: boolean;
}

export interface ResolvedBeat extends TourBeat {
  /** The main "פתחו" button, or null when nothing is available yet ("בקרוב"). */
  primary: ResolvedTarget | null;
  secondary: ResolvedTarget[];
}

const DEFAULT_LABELS: Record<TourTarget['kind'], string> = {
  demo: 'פתחו הדגמה',
  site: 'פתחו באתר',
  pitch: 'פתחו בסקירה',
};

function resolveTarget(
  target: TourTarget,
  ready: ReadonlySet<string>,
  isFlagOn: (flag: FlagName) => boolean,
): ResolvedTarget | null {
  switch (target.kind) {
    case 'demo':
      return ready.has(target.slug)
        ? { href: demoHref(target.slug), label: target.label ?? DEFAULT_LABELS.demo, kind: 'demo', staffOnly: false }
        : null;
    case 'site':
      return target.flag && !isFlagOn(target.flag)
        ? null
        : { href: target.href, label: target.label ?? DEFAULT_LABELS.site, kind: 'site', staffOnly: Boolean(target.staffOnly) };
    case 'pitch':
      return { href: `/platform/${target.anchor}`, label: target.label ?? DEFAULT_LABELS.pitch, kind: 'pitch', staffOnly: false };
  }
}

export function resolveTour(
  views: readonly RegistryView[],
  isFlagOn: (flag: FlagName) => boolean,
  beats: readonly TourBeat[] = TOUR_BEATS,
): ResolvedBeat[] {
  const ready = new Set(views.filter((v) => v.status === 'ready').map((v) => v.slug));
  return beats.map((beat) => {
    const resolved = beat.targets.flatMap((t) => {
      const r = resolveTarget(t, ready, isFlagOn);
      return r ? [r] : [];
    });
    // A demo view of the same slug may be listed twice (e.g. growth); keep hrefs unique.
    const unique = resolved.filter((t, i) => resolved.findIndex((o) => o.href === t.href) === i);
    return { ...beat, primary: unique[0] ?? null, secondary: unique.slice(1) };
  });
}

/** "2:30" for 2.5 minutes. */
export function formatMinutes(minutes: number): string {
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return `${whole}:${String(seconds).padStart(2, '0')}`;
}
