/**
 * Site navigation (header, mobile drawer, footer). Mirrors the live
 * bonimbayit.co.il menus (docs/LIVE_SITE_INVENTORY.md) in the new design.
 * Single source of truth: the orchestrator wires other workstreams' links here.
 *
 * Client-safe (no server imports).
 */

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

/** Calendly booking link for the free budget consultation. */
export const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/tzuri-galili-bonimbayit/demo45min';

/** Primary header menu (live order). */
export const HEADER_NAV: NavLink[] = [
  { label: 'ניהול ופיקוח', href: '/membership-tiers/' },
  { label: 'מדריך בניה', href: '/blog/' },
  { label: 'נבחרת מומלצים', href: '/recommended/' },
  { label: 'הצטרפות לקהילה', href: '/הצטרפו-לקבוצות-הווטסאפ/' },
  { label: 'חנות ההטבות', href: '/הטבות-לקהילה/' },
];

/** Secondary links (live "hamburger" sidebar menu), plus the app's own tools. */
export const SECONDARY_NAV: NavLink[] = [
  { label: 'בונים בית TV', href: '/בונים-בית-tv/' },
  { label: 'מחשבון עלויות', href: '/calculator/' },
  { label: 'אודות', href: '/אודותינו/' },
  { label: 'צור קשר', href: '/צור-קשר/' },
  { label: 'פרסמו אצלנו', href: '/join-us/' },
];

export const AUTH_LINKS = {
  login: '/login/',
  signup: '/signup/',
  // Member account area (Community & Commerce workstream).
  account: '/account/',
} as const;

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'תוכן ולמידה',
    links: [
      { label: 'מרכז הידע', href: '/blog/' },
      { label: 'בונים בית TV', href: '/בונים-בית-tv/' },
      { label: 'חיפוש חכם', href: '/search/' },
      { label: 'מחשבון עלויות בניה', href: '/calculator/' },
      { label: 'פודקאסט בונים בית', href: 'https://open.spotify.com/show/54ad9OeT6XsRf8ZtUtC4Su', external: true },
      { label: 'ערוץ הסרטונים', href: 'https://www.youtube.com/channel/UCCehs0A1gUmOUtZIhvkXVJQ', external: true },
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
      { label: 'הצטרפות לקהילה', href: '/הצטרפו-לקבוצות-הווטסאפ/' },
      { label: 'התחברות לאתר', href: '/login/' },
      { label: 'הרשמה לאתר', href: '/signup/' },
    ],
  },
  {
    title: 'מידע נוסף',
    links: [
      { label: 'תקנון האתר', href: '/תקנון-האתר/' },
      { label: 'מדיניות פרטיות', href: '/מדיניות-פרטיות/' },
    ],
  },
];

export const CONTACT_DETAILS = {
  phone: '03-9440467',
  address: 'שושנה דמארי 30, חולון',
};

/** Community channels with the live site's footer stats. */
export const COMMUNITY_STATS: Array<{ network: string; value: string; label: string; href: string }> = [
  { network: 'WhatsApp', value: '10,000', label: 'חברי קהילה', href: '/הצטרפו-לקבוצות-הווטסאפ/' },
  { network: 'YouTube', value: '24,000', label: 'מנויים', href: 'https://www.youtube.com/channel/UCCehs0A1gUmOUtZIhvkXVJQ' },
  { network: 'Spotify', value: '50,000+', label: 'השמעות', href: 'https://open.spotify.com/show/54ad9OeT6XsRf8ZtUtC4Su' },
  { network: 'Facebook', value: '14,000', label: 'חברים', href: 'https://www.facebook.com/bonimbayit/' },
];

export const SOCIAL_LINKS: NavLink[] = [
  { label: 'YouTube', href: 'https://www.youtube.com/channel/UCCehs0A1gUmOUtZIhvkXVJQ?sub_confirmation=1', external: true },
  { label: 'Facebook', href: 'https://www.facebook.com/bonimbayit/', external: true },
  { label: 'Instagram', href: 'https://www.instagram.com/tomer.chen.rihana/', external: true },
  { label: 'TikTok', href: 'https://www.tiktok.com/@tomer.chen.rihana', external: true },
  { label: 'Spotify', href: 'https://open.spotify.com/show/54ad9OeT6XsRf8ZtUtC4Su', external: true },
];

/** True when `href` is the current page (trailing-slash and encoding insensitive). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const norm = (p: string) => {
    let s = p;
    try {
      s = decodeURI(p);
    } catch {
      // keep raw
    }
    return s.replace(/\/+$/, '') || '/';
  };
  const current = norm(pathname);
  const target = norm(href);
  return target === '/' ? current === '/' : current === target || current.startsWith(`${target}/`);
}
