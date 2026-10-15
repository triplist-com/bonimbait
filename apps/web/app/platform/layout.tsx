import type { Metadata } from 'next';
import Link from 'next/link';
import PlatformNav from '@/components/platform/PlatformNav';

/**
 * Shell for /platform/*: the pitch site, the demo views and the design-system
 * page. Internal sales material, so never indexed (also disallowed in
 * robots.ts, and optionally gated by PITCH_ACCESS_CODE in middleware.ts).
 * The public site's header/footer are hidden here (SiteChromeGate in
 * app/layout.tsx). Deliberately neutral: the pitch squad designs it. Pages
 * own their width (container-page or full bleed).
 */
export const metadata: Metadata = {
  title: { template: '%s · בונים בית פלטפורמה', default: 'בונים בית · פלטפורמה' },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  alternates: { canonical: null },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white" data-shell="platform">
      <header className="border-b border-gray-200 bg-white">
        <div className="container-page flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
          <Link href="/platform/" className="flex items-center gap-2 rounded-lg py-1 text-gray-900">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
              ב
            </span>
            <span className="font-bold">בונים בית</span>
            <span className="text-sm text-gray-500">פלטפורמה</span>
          </Link>
          <PlatformNav />
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-gray-100">
        <p className="container-page py-4 text-xs text-gray-500">חומר פנימי להצגה. לא מופיע במנועי חיפוש.</p>
      </footer>
    </div>
  );
}
