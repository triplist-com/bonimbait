import { permanentRedirect } from 'next/navigation';

// The canonical About page is the live Hebrew slug. The middleware 301s /about/
// via the `redirects` table (supabase/migrations/20260928130000_content_redirects.sql);
// this stub is the fallback when that table is unavailable.
export default function AboutRedirect() {
  permanentRedirect('/אודותינו/');
}
