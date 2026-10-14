'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/analytics/track';

/**
 * Sends `page_view` on the first load and on every client-side navigation
 * (path or query change). Mounted once in app/layout.tsx; renders nothing.
 * The referrer is the previous in-app path, or document.referrer on landing.
 */
function Tracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const q = searchParams?.get('q') ?? null;
  const lastKey = useRef<string | null>(null);
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const key = `${pathname}?${search}`;
    if (lastKey.current === key) return; // React strict mode runs effects twice
    lastKey.current = key;
    const referrer = previousPath.current ?? (document.referrer || null);
    previousPath.current = pathname;
    trackPageView({ referrer, q });
  }, [pathname, search, q]);

  return null;
}

export default function PageViewTracker() {
  // useSearchParams needs a Suspense boundary to keep pages static.
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
