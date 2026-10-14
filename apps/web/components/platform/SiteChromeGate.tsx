'use client';

import { usePathname } from 'next/navigation';
import { isPlatformPath } from '@/lib/platform/paths';

/**
 * Renders the public site's chrome (header, footer, floating CTAs) everywhere
 * except /platform/*, which has its own shell (app/platform/layout.tsx).
 * Client-side on purpose: reading the path on the server would make every
 * page dynamic.
 */
export default function SiteChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return isPlatformPath(pathname) ? null : <>{children}</>;
}
