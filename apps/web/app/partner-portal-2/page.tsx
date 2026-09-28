import { redirect } from 'next/navigation';

/**
 * Duplicate portal page on the live site. The `redirects` table already
 * 302s /partner-portal-2/ to /partner-portal/ in middleware; this route is
 * the fallback when the redirects table is unavailable.
 */
export default function PartnerPortal2() {
  redirect('/partner-portal/');
}
