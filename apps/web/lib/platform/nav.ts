/**
 * Navigation of the /platform pitch shell (app/platform/layout.tsx).
 * The pitch squad owns the shell's design; add an entry with one line.
 */
export type PlatformNavItem = { href: string; label: string; exact?: boolean };

export const PLATFORM_NAV: readonly PlatformNavItem[] = [
  { href: '/platform/', label: 'סקירה', exact: true },
  { href: '/platform/demo/', label: 'הדגמות' },
];

/** Active state for a nav item (paths end with "/"). */
export function isPlatformNavActive(pathname: string | null | undefined, item: PlatformNavItem): boolean {
  if (!pathname) return false;
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return item.exact ? path === item.href : path.startsWith(item.href);
}
