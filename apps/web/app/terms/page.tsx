import { permanentRedirect } from 'next/navigation';

// Canonical site terms are the live Hebrew page (served from `pages`).
// The middleware 301s /terms/ via the `redirects` table; this is the fallback.
export default function TermsRedirect() {
  permanentRedirect('/תקנון-האתר/');
}
