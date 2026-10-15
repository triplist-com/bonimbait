/**
 * Site navigation config: header, mobile drawer, footer and the AI entry.
 * Components render whatever is here, so adding a destination is one line.
 * (Admin navigation lives in lib/admin/nav.ts, owned by the foundation squad.)
 *
 * Rules: internal hrefs end with "/" (WordPress parity); link only to routes
 * that exist. Client-safe (no server imports).
 */
import {
  CONTACT_DETAILS,
  FACEBOOK_URL,
  INSTAGRAM_URL,
  SPOTIFY_SHOW_URL,
  TIKTOK_URL,
  WHATSAPP_COMMUNITY_PATH,
  YOUTUBE_CHANNEL_URL,
} from './brand';

/** Icon keys resolved by components/Layout/NavIcon.tsx (keeps this file serialisable). */
export type NavIconName =
  | 'guide'
  | 'media'
  | 'pros'
  | 'calculator'
  | 'management'
  | 'benefits'
  | 'community'
  | 'tv'
  | 'about'
  | 'contact'
  | 'advertise'
  | 'partners';

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface SiteNavItem extends NavLink {
  id: string;
  /** One line for the drawer and menus. */
  description?: string;
  icon?: NavIconName;
  /** Extra path prefixes that mark this item active (child routes, legacy URLs). */
  match?: string[];
}

/** Primary header navigation, in display order. */
export const PRIMARY_NAV: SiteNavItem[] = [
  {
    id: 'guide',
    label: 'מדריך הבנייה',
    href: '/blog/',
    description: 'מאות מדריכים לכל שלב, מהמגרש ועד המפתח',
    icon: 'guide',
    match: ['/category/', '/author/'],
  },
  {
    id: 'media',
    label: 'סרטונים ופודקאסט',
    href: '/videos/',
    description: 'סיורי שטח, ראיונות ופרקי הפודקאסט',
    icon: 'media',
    match: ['/video/', '/בונים-בית-tv/'],
  },
  {
    id: 'pros',
    label: 'בעלי מקצוע',
    href: '/recommended/',
    description: 'נבחרת המומלצים, עם דירוגים מהקהילה',
    icon: 'pros',
    match: ['/business/'],
  },
  {
    id: 'calculator',
    label: 'מחשבון תקציב',
    href: '/calculator/',
    description: 'הערכת עלות לבית שלכם בכמה דקות',
    icon: 'calculator',
  },
  {
    id: 'management',
    label: 'ניהול ופיקוח',
    href: '/membership-tiers/',
    description: 'ליווי מקצועי: תקציב, מכרזים ופיקוח',
    icon: 'management',
  },
  {
    id: 'benefits',
    label: 'חנות ההטבות',
    href: '/הטבות-לקהילה/',
    description: 'הנחות בלעדיות לחברי הקהילה',
    icon: 'benefits',
    match: ['/product/', '/product-category/', '/shop/'],
  },
];

/** Default display name of the advisor (the owner has not approved "שאלו את תומר" yet). */
export const DEFAULT_ADVISOR_NAME = 'שאלו את בונים בית';

/** Advisor display name: NEXT_PUBLIC_ADVISOR_NAME, else the default. */
export function advisorName(env: string | undefined = process.env.NEXT_PUBLIC_ADVISOR_NAME): string {
  return env?.trim() || DEFAULT_ADVISOR_NAME;
}

/**
 * The advisor entry: /ask/ (the advisor squad's page; /search/ keeps the
 * results grid with a short answer preview). Builder-facing copy says
 * "תשובה מהשטח", not "AI".
 */
export const AI_ENTRY = {
  label: advisorName(),
  shortLabel: 'שאלו',
  href: '/ask/',
  queryParam: 'q',
} as const;

/** Link that opens the AI entry with a question: aiHref('כמה עולה שלד?'). */
export function aiHref(question?: string, entry: { href: string; queryParam: string } = AI_ENTRY): string {
  const q = question?.trim();
  if (!q) return entry.href;
  return `${entry.href}?${entry.queryParam}=${encodeURIComponent(q)}`;
}

/** Account area. "הבית שלי" is the Builder Hub slot (Wave B), today /account/. */
export const ACCOUNT_NAV = {
  login: { label: 'התחברות', href: '/login/' },
  signup: { label: 'הרשמה', href: '/signup/' },
  home: { label: 'הבית שלי', href: '/account/' },
  cart: { label: 'סל הקניות', href: '/cart/' },
  signOutAction: '/auth/signout/',
} as const;

/** Back-compat shape used by older components. */
export const AUTH_LINKS = {
  login: ACCOUNT_NAV.login.href,
  signup: ACCOUNT_NAV.signup.href,
  account: ACCOUNT_NAV.home.href,
  cart: ACCOUNT_NAV.cart.href,
} as const;

/** Secondary links (live "hamburger" menu): drawer and footer. */
export const SECONDARY_NAV: SiteNavItem[] = [
  { id: 'community', label: 'הצטרפות לקהילה', href: WHATSAPP_COMMUNITY_PATH, icon: 'community', description: 'קבוצות WhatsApp אזוריות של משפחות בונות' },
  { id: 'tv', label: 'בונים בית TV', href: '/בונים-בית-tv/', icon: 'tv' },
  { id: 'about', label: 'אודות', href: '/אודותינו/', icon: 'about' },
  { id: 'contact', label: 'צור קשר', href: '/צור-קשר/', icon: 'contact' },
  { id: 'advertise', label: 'פרסמו אצלנו', href: '/join-us/', icon: 'advertise' },
];

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

/** Footer columns. Every live footer link is kept (URL parity). */
export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'תוכן ולמידה',
    links: [
      { label: 'מרכז הידע', href: '/blog/' },
      // Live footer links /events/ (404 here); the same content lives in this category.
      { label: 'כנסים מקצועיים', href: '/category/כנסים-ולייבים/' },
      { label: 'בונים בית TV', href: '/בונים-בית-tv/' },
      { label: 'סרטונים ופודקאסט', href: '/videos/' },
      { label: 'חיפוש חכם', href: '/search/' },
      { label: 'מחשבון עלויות בניה', href: '/calculator/' },
      { label: 'פודקאסט בונים בית', href: SPOTIFY_SHOW_URL, external: true },
      { label: 'ערוץ הסרטונים', href: YOUTUBE_CHANNEL_URL, external: true },
    ],
  },
  {
    title: 'בעלי מקצוע ושירותים',
    links: [
      { label: 'נבחרת המומלצים', href: '/recommended/' },
      { label: 'הצטרפות כבעל מקצוע', href: '/join-us/' },
      { label: 'חנות ההטבות', href: '/הטבות-לקהילה/' },
      { label: 'ניהול הבנייה', href: '/membership-tiers/' },
      { label: 'שותפים אסטרטגיים', href: '/strategic-partners/' },
    ],
  },
  {
    title: 'אודות וקהילה',
    links: [
      { label: 'אודות', href: '/אודותינו/' },
      { label: 'צור קשר', href: '/צור-קשר/' },
      { label: 'הצטרפות לקהילה', href: WHATSAPP_COMMUNITY_PATH },
      { label: 'התחברות לאתר', href: '/login/' },
      { label: 'הרשמה לאתר', href: '/signup/' },
    ],
  },
];

/** Legal links (footer bottom bar). */
export const LEGAL_LINKS: NavLink[] = [
  { label: 'תקנון האתר', href: '/תקנון-האתר/' },
  { label: 'מדיניות פרטיות', href: '/מדיניות-פרטיות/' },
];

export type SocialId = 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'spotify';

export const SOCIAL_LINKS: Array<NavLink & { id: SocialId }> = [
  { id: 'youtube', label: 'YouTube', href: `${YOUTUBE_CHANNEL_URL}?sub_confirmation=1`, external: true },
  { id: 'facebook', label: 'Facebook', href: FACEBOOK_URL, external: true },
  { id: 'instagram', label: 'Instagram', href: INSTAGRAM_URL, external: true },
  { id: 'tiktok', label: 'TikTok', href: TIKTOK_URL, external: true },
  { id: 'spotify', label: 'Spotify', href: SPOTIFY_SHOW_URL, external: true },
];

export { CONTACT_DETAILS };

/** Calendly booking link for the free budget consultation. */
export const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/tzuri-galili-bonimbayit/demo45min';

/** Path without trailing slash, percent-decoded (Hebrew slugs). */
export function normalizePath(p: string): string {
  let s = p.split(/[?#]/)[0] ?? '';
  try {
    s = decodeURI(s);
  } catch {
    // keep raw
  }
  return s.replace(/\/+$/, '') || '/';
}

/** True when `href` is the current page or one of its children. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const current = normalizePath(pathname);
  const target = normalizePath(href);
  return target === '/' ? current === '/' : current === target || current.startsWith(`${target}/`);
}

/** Active state for a nav item, including its `match` prefixes. */
export function isNavItemActive(pathname: string | null, item: Pick<SiteNavItem, 'href' | 'match'>): boolean {
  if (!pathname) return false;
  if (isActivePath(pathname, item.href)) return true;
  const current = `${normalizePath(pathname)}/`;
  return (item.match ?? []).some((prefix) => current.startsWith(normalizePath(prefix) + '/'));
}
