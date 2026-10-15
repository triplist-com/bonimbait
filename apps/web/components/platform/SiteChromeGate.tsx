'use client';

import { usePathname } from 'next/navigation';
import { isPlatformPath } from '@/lib/platform/paths';

function isAdminPath(pathname: string | null): boolean {
  return pathname === '/admin' || (pathname?.startsWith('/admin/') ?? false);
}

/**
 * Renders the public site's chrome (header, footer, floating CTAs) everywhere
 * except /platform/* (the pitch shell, app/platform/layout.tsx) and /admin/*
 * (the admin shell has its own sidebar with "back to site" and sign-out).
 * Client-side on purpose: reading the path on the server would make every
 * page dynamic.
 */
export default function SiteChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ownShell = isPlatformPath(pathname) || isAdminPath(pathname);
  return ownShell ? null : <>{children}</>;
}
