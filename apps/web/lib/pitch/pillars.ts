/**
 * The platform's pillars as the owner sees them on /platform/ and in the tour.
 *
 * Names and value lines follow the sales strategy's Hebrew messaging (owner-facing).
 * Order is the demo order: P1 → P6 → P2 → P4 → P3 → P7 → P5 → F.
 *
 * Demo links are driven by the registry (lib/demo/views.ts): a pillar shows
 * "פתחו הדגמה" only once one of its views is 'ready', so other squads' views
 * appear as they merge and the page degrades to "בקרוב" until then.
 * Pure and client-safe.
 */
import type { FlagName } from '@/lib/flags';
import { ACCOUNT_NAV, advisorName, aiHref, DEFAULT_ADVISOR_NAME } from '@/lib/nav';

export type PillarId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'F';

export type PillarIcon = 'advisor' | 'planner' | 'hub' | 'command' | 'revenue' | 'bonimos' | 'autopilot' | 'switch';

/** A link to the real feature on the site. */
export interface PillarSiteLink {
  href: string;
  label: string;
  /** Shown only while this feature flag is on (dark launches). */
  flag?: FlagName;
  /** The target needs a staff login (admin screens). */
  staffOnly?: boolean;
}

export interface Pillar {
  id: PillarId;
  name: string;
  /** Second name after "·", e.g. "תיק פרויקט". */
  subname?: string;
  /** One owner-facing line: what it does for his business. */
  valueLine: string;
  /** What the owner sees in the demo. */
  wow: string;
  icon: PillarIcon;
  /** Registry slugs of this pillar's demo views, preferred first. */
  demoSlugs: readonly string[];
  /** In-page anchor on /platform/ that demonstrates the pillar (Foundation). */
  anchor?: string;
  site: readonly PillarSiteLink[];
}

/** The headline question of the demo (advisor wow moment). */
export const DEMO_QUESTION = 'כמה עולה שלד לבית של 200 מ״ר ב-2026?';

/** The name the owner may choose for the advisor; shown as a suggestion while not configured. */
export const SUGGESTED_ADVISOR_NAME = 'שאלו את תומר';

export const PILLARS: readonly Pillar[] = [
  {
    id: 'P1',
    name: advisorName(),
    valueLine: 'כל הספרייה שלכם עונה לבונים 24/7, עם הרגע המדויק בסרטון.',
    wow: `״${DEMO_QUESTION}״: התשובה מהתוכן שלכם, והפודקאסט מתנגן בשנייה שבה זה נאמר.`,
    icon: 'advisor',
    demoSlugs: ['advisor'],
    site: [{ href: aiHref(DEMO_QUESTION), label: 'פתחו באתר' }],
  },
  {
    id: 'P6',
    name: 'תקציב ראשוני ב-3 דקות',
    valueLine: 'הבונה מקבל טווח תקציב, ומבין למה הוא צריך את הדיוק של בונים תקציב.',
    wow: 'טווח לפי שלבים, שלושה ״פה הכי קל לחרוג״ עם הסרטונים שלכם, וקביעת פגישה בלחיצה.',
    icon: 'planner',
    demoSlugs: ['growth', 'planner'],
    site: [{ href: '/calculator/', label: 'פתחו באתר' }],
  },
  {
    id: 'P2',
    name: 'הבית שלי',
    subname: 'תיק פרויקט',
    valueLine: 'כל בונה מגיע לייעוץ עם תיק: שלב, אזור, מ״ר, תקציב ומה שאל. מתקשרים קודם למי ששווה הכי הרבה.',
    wow: 'היכרות של דקה, מפת דרך אישית, פגישת ייעוץ, והתיק כבר מחכה בתור של צורי, עם ציון.',
    icon: 'hub',
    demoSlugs: ['hub', 'consult-queue'],
    site: [{ href: ACCOUNT_NAV.home.href, label: 'פתחו באתר', flag: 'hub' }],
  },
  {
    id: 'P4',
    name: 'חדר הבקרה',
    valueLine: 'הצבר בשקלים, הלידים לפי ציון, והשאלות שעוד לא עניתם עליהן: הסרטונים הבאים שלכם.',
    wow: 'השאלות שהקהל שלכם שואל ואין לכם עליהן סרטון הופכות לרשימת הצילומים הבאה.',
    icon: 'command',
    demoSlugs: ['command'],
    site: [{ href: '/admin/', label: 'פתחו בניהול', flag: 'commandCenter', staffOnly: true }],
  },
  {
    id: 'P3',
    name: 'מנוע ההכנסות',
    subname: 'דוח שותף',
    valueLine: 'כל שותף רואה כמה בונים ראו אותו, שאלו על התחום שלו וביקשו הצעה. ככה מחדשים ומשדרגים מסלולים.',
    wow: 'דוח חודשי לכל שותף: חשיפות, בונים ששאלו על התחום, בקשות הצעה ועסקאות. הקייס סטאדי שלכם, אוטומטי.',
    icon: 'revenue',
    demoSlugs: ['partner', 'revenue', 'pro'],
    // Partner health, with every partner's monthly דוח שותף one click away.
    site: [{ href: '/admin/partners/', label: 'פתחו בניהול', flag: 'revenue', staffOnly: true }],
  },
  {
    id: 'P7',
    name: 'Bonim.Os',
    subname: 'מערכת הליווי ללקוחות הניהול',
    valueLine: 'מה שכתוב במחירון, אמיתי: תקציב מול ביצוע, אבני דרך, אישורי תשלום ותמונות מהשטח.',
    wow: 'שורה 3.3 במחירון עד מפתח, ״חיבור למערכת Bonim.Os לשליטה מלאה״, עם פרויקט מנוהל במותג שלכם.',
    icon: 'bonimos',
    demoSlugs: ['bonimos', 'bonim-os'],
    site: [],
  },
  {
    id: 'P5',
    name: 'טייס אוטומטי לתוכן',
    valueLine: 'סרטון עולה ביוטיוב, ומקבל עמוד, פרקים ותשובות בלי שאף אחד יגע בו.',
    wow: 'סרטון חדש מזוהה לבד, מקבל עמוד ופרקים, ואחרי אישור אחד היועץ כבר מצטט אותו.',
    icon: 'autopilot',
    demoSlugs: ['autopilot'],
    site: [{ href: '/admin/autopilot/', label: 'פתחו בניהול', flag: 'autopilot', staffOnly: true }],
  },
  {
    id: 'F',
    name: 'מעבר בלי סיכון',
    valueLine: 'כל הכתובות, כל התוכן וכל הדירוגים כבר עברו. גוגל ירגיש רק שהאתר מהיר יותר.',
    wow: 'כל כתובת באתר הישן נבדקה מול החדש, והאתר החדש נטען מהר יותר בנייד.',
    icon: 'switch',
    demoSlugs: [],
    anchor: '#switch',
    site: [{ href: '/', label: 'פתחו את האתר החדש' }],
  },
];

/** True while the advisor still carries the default name (the owner hasn't picked one). */
export function advisorNameIsDefault(name: string = advisorName()): boolean {
  return name === DEFAULT_ADVISOR_NAME;
}

/* ------------------------------------------------------------------ */
/* Registry-driven links                                               */
/* ------------------------------------------------------------------ */

/** The registry fields this module reads (lib/demo/views.ts → DemoView). */
export interface RegistryView {
  slug: string;
  pillar: string;
  title: string;
  status: 'ready' | 'planned' | string;
}

export interface PillarDemo {
  slug: string;
  title: string;
  href: string;
}

export interface ResolvedPillar extends Pillar {
  /** Ready demo views, preferred first. Empty until a squad flips its view to 'ready'. */
  demos: PillarDemo[];
  /** Site links whose flag (if any) is on. */
  links: PillarSiteLink[];
  /** 'live' when there is anything to open; 'soon' otherwise. */
  status: 'live' | 'soon';
}

/**
 * Registry views that are internal tooling, not a pitch demo (the foundation
 * view shows the demo-data kit). They never show up on a pillar card.
 */
export const INTERNAL_DEMO_SLUGS: ReadonlySet<string> = new Set(['foundation']);

export function demoHref(slug: string): string {
  return `/platform/demo/${slug}/`;
}

/**
 * Resolve every pillar against the registry and the feature flags.
 * A ready view counts for a pillar when its slug is in the pillar's
 * `demoSlugs`, or when its registry `pillar` matches and no pillar claims
 * its slug (so a squad's extra view still shows up).
 */
export function resolvePillars(
  views: readonly RegistryView[],
  isFlagOn: (flag: FlagName) => boolean,
  pillars: readonly Pillar[] = PILLARS,
): ResolvedPillar[] {
  const claimed = new Set(pillars.flatMap((p) => p.demoSlugs));
  const ready = views.filter((v) => v.status === 'ready');
  const bySlug = new Map(ready.map((v) => [v.slug, v]));

  return pillars.map((pillar) => {
    const preferred = pillar.demoSlugs.flatMap((slug) => {
      const view = bySlug.get(slug);
      return view ? [view] : [];
    });
    const extra = ready.filter((v) => v.pillar === pillar.id && !claimed.has(v.slug) && !INTERNAL_DEMO_SLUGS.has(v.slug));
    const demos = [...preferred, ...extra].map((v) => ({ slug: v.slug, title: v.title, href: demoHref(v.slug) }));
    const links = pillar.site.filter((l) => !l.flag || isFlagOn(l.flag));
    const status = demos.length > 0 || links.length > 0 || pillar.anchor ? 'live' : 'soon';
    return { ...pillar, demos, links, status };
  });
}
