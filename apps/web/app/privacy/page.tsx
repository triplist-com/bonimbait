import { permanentRedirect } from 'next/navigation';

// Canonical privacy policy is the live Hebrew page (served from `pages`).
// The middleware 301s /privacy/ via the `redirects` table; this is the fallback.
export default function PrivacyRedirect() {
  permanentRedirect('/מדיניות-פרטיות/');
}
