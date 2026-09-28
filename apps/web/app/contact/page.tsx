import { permanentRedirect } from 'next/navigation';

/**
 * The live contact page is /צור-קשר/. The middleware 301s /contact/ there via
 * the `redirects` table (migration 20260928130300); this route is the fallback
 * when the redirect table is unavailable.
 */
export default function ContactRedirect() {
  permanentRedirect(encodeURI('/צור-קשר/'));
}
