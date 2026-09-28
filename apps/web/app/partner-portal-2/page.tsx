import { redirect } from 'next/navigation';

/**
 * Duplicate portal page on the live site. The `redirects` table already
 * 302s /partner-portal-2/ to /partner-portal/ in middleware; this route is
 * the fallback when the redirects table is unavailable.
 */
// Redirect from generateMetadata so it is a real 3xx (the root loading.tsx
// would otherwise stream the page with a 200 first).
export function generateMetadata(): never {
  redirect('/partner-portal/');
}

export default function PartnerPortal2() {
  redirect('/partner-portal/');
}
