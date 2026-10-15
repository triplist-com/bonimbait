/**
 * Admin sidebar configuration (rendered by app/admin/AdminSidebar.tsx).
 *
 * To add a screen: add one item to a group (or a new group). Items default to
 * editors and up; `minRole: 'admin'` hides them from editors (the page must
 * still call requireRole('admin') itself: the nav is not the guard). `flag`
 * hides an item until its feature flag is on (lib/flags.ts), for dark launches.
 * hrefs end with "/" (trailing-slash routing).
 */
import type { Role } from '@/lib/db/types';
import { hasRole } from '@/lib/auth/roles';
import type { FlagName } from '@/lib/flags';

export type AdminNavItem = {
  href: string;
  label: string;
  /** Lowest role that sees the item (default 'editor'). */
  minRole?: Role;
  /** Active only on the exact path (e.g. the dashboard), not its children. */
  exact?: boolean;
  /** Shown only while this feature flag is on. */
  flag?: FlagName;
};

export type AdminNavGroup = { id: string; title?: string; items: AdminNavItem[] };

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  { id: 'home', items: [{ href: '/admin/', label: 'חדר הבקרה', exact: true }] },
  {
    // P4 Command Center (command squad). Flagged screens appear with FLAG_COMMAND_CENTER.
    id: 'insights',
    title: 'תובנות',
    items: [
      { href: '/admin/insights/', label: 'שאלות בלי תשובה', exact: true, flag: 'commandCenter' },
      { href: '/admin/insights/leads/', label: 'ניתוח לידים', flag: 'commandCenter' },
      { href: '/admin/insights/content/', label: 'ביצועי תוכן', flag: 'commandCenter' },
      { href: '/admin/digest/', label: 'סיכום שבועי', flag: 'commandCenter' },
      { href: '/admin/search-stats/', label: 'חיפושים ותשובות', minRole: 'admin' },
      { href: '/admin/insights/pipeline/', label: 'ערך צפוי לליד', minRole: 'admin', flag: 'commandCenter' },
    ],
  },
  {
    id: 'content',
    title: 'תוכן',
    items: [
      { href: '/admin/posts/', label: 'מאמרים' },
      { href: '/admin/taxonomy/', label: 'קטגוריות, תגיות וכותבים' },
      { href: '/admin/pages/', label: 'עמודים' },
      { href: '/admin/videos/', label: 'עמודי וידאו' },
      { href: '/admin/autopilot/', label: 'אוטופיילוט תוכן' },
      { href: '/admin/media/', label: 'ספריית מדיה' },
    ],
  },
  {
    id: 'directory',
    title: 'נבחרת המומלצים',
    items: [
      { href: '/admin/directory/businesses/', label: 'עסקים' },
      { href: '/admin/directory/ranking/', label: 'סדר הופעה' },
      { href: '/admin/directory/reviews/', label: 'ביקורות' },
      { href: '/admin/directory/requests/', label: 'בקשות הצטרפות וניהול' },
      { href: '/admin/directory/taxonomy/', label: 'תחומים ואזורים' },
    ],
  },
  { id: 'leads', title: 'לידים', items: [{ href: '/admin/leads/', label: 'תיבת לידים' }] },
  {
    // P7 Bonim.Os (bonimos squad): managed clients and their project managers.
    id: 'bonimos',
    title: 'Bonim.Os',
    items: [
      { href: '/admin/bonimos/', label: 'לקוחות ליווי ומנהלים', minRole: 'admin', flag: 'bonimos' },
      { href: '/manage/', label: 'הפרויקטים שלי', flag: 'bonimos' },
    ],
  },
  { id: 'growth', title: 'צמיחה', items: [{ href: '/admin/planner/', label: 'מחירון מתכנן התקציב' }] },
  {
    id: 'commerce',
    title: 'חנות ושירותים',
    items: [
      { href: '/admin/commerce/products/', label: 'מוצרים' },
      { href: '/admin/commerce/categories/', label: 'קטגוריות מוצרים' },
      { href: '/admin/commerce/plans/', label: 'מסלולי ליווי' },
      { href: '/admin/commerce/orders/', label: 'הזמנות ותשלומים' },
    ],
  },
  {
    id: 'settings',
    title: 'הגדרות',
    items: [
      { href: '/admin/redirects/', label: 'הפניות (301)' },
      { href: '/admin/members/', label: 'משתמשים והרשאות', minRole: 'admin' },
    ],
  },
];

/**
 * The groups and items `role` may see, flag-gated items included only when
 * `isFlagOn` says so. Empty groups are dropped.
 */
export function adminNavFor(
  role: Role,
  isFlagOn: (flag: FlagName) => boolean = () => false,
  nav: readonly AdminNavGroup[] = ADMIN_NAV,
): AdminNavGroup[] {
  return nav
    .map((group) => ({
      ...group,
      items: group.items.filter((i) => hasRole(role, i.minRole ?? 'editor') && (!i.flag || isFlagOn(i.flag))),
    }))
    .filter((group) => group.items.length > 0);
}

/** Is `item` the current screen? (`pathname` with or without its trailing slash.) */
export function isAdminNavActive(pathname: string | null | undefined, item: Pick<AdminNavItem, 'href' | 'exact'>): boolean {
  if (!pathname) return false;
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return item.exact ? path === item.href : path.startsWith(item.href);
}
