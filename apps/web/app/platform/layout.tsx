import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import PlatformNav from '@/components/platform/PlatformNav';
import { Logo } from '@/components/ui/Logo';

/**
 * Shell for /platform/*: the pitch site, the guided tour, the demo views and
 * the design-system page. Internal sales material, so never indexed (also
 * disallowed in robots.ts, and optionally gated by PITCH_ACCESS_CODE in
 * middleware.ts). The public site's header/footer are hidden here
 * (SiteChromeGate in app/layout.tsx). Pages own their width (container-page or
 * full bleed). Designed by the pitch squad.
 */
export const metadata: Metadata = {
  title: { template: '%s · בונים בית פלטפורמה', default: 'בונים בית · פלטפורמה' },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  alternates: { canonical: null },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper" data-shell="platform">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="container-page flex flex-wrap items-center gap-x-5 gap-y-1.5 py-2.5 md:flex-nowrap">
          <Link href="/platform/" className="flex shrink-0 items-center gap-2 rounded-lg py-1 text-ink-900" aria-label="בונים בית OS: סקירה">
            <Logo accent className="h-7 w-auto sm:h-8" />
            <span dir="ltr" className="rounded-md bg-ink-900 px-1.5 py-0.5 text-[0.6875rem] font-extrabold tracking-wider text-white">
              OS
            </span>
          </Link>
          <PlatformNav className="order-last w-full md:order-none md:w-auto md:flex-1" />
          <Link
            href="/"
            className="ms-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            לאתר
            <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-ink-100 bg-white">
        <div className="container-page flex flex-col gap-1 py-5 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            בונים בית <span dir="ltr">OS</span> · חומר פנימי להצגה, לא מופיע במנועי חיפוש.
          </p>
          <p>כל מספר מחושב מהנתונים, נמדד, או לקוח מהעמודים הציבוריים של בונים בית. נתוני הדגמה מסומנים ככאלה.</p>
        </div>
      </footer>
    </div>
  );
}
