/**
 * Deprecated: site navigation moved to lib/nav.ts (config-driven header,
 * drawer and footer) and brand facts to lib/brand.ts. This module re-exports
 * the old names so existing imports keep working. Client-safe.
 */
import { PRIMARY_NAV, SECONDARY_NAV as NAV_SECONDARY, LEGAL_LINKS, FOOTER_COLUMNS as NAV_FOOTER, type FooterColumn, type NavLink } from '@/lib/nav';

export {
  AUTH_LINKS,
  CALENDLY_URL,
  CONTACT_DETAILS,
  SOCIAL_LINKS,
  isActivePath,
  type FooterColumn,
  type NavLink,
} from '@/lib/nav';
export { COMMUNITY_STATS } from '@/lib/brand';

/** Primary header menu. */
export const HEADER_NAV: NavLink[] = PRIMARY_NAV.map(({ label, href }) => ({ label, href }));

/** Secondary links. */
export const SECONDARY_NAV: NavLink[] = NAV_SECONDARY.map(({ label, href }) => ({ label, href }));

/** Footer columns, with the legal links as their own column (old shape). */
export const FOOTER_COLUMNS: FooterColumn[] = [...NAV_FOOTER, { title: 'מידע נוסף', links: LEGAL_LINKS }];
