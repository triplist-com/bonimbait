'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PLATFORM_NAV, isPlatformNavActive } from '@/lib/platform/nav';

/** Links of the /platform shell, from lib/platform/nav.ts. */
export default function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="ניווט הפלטפורמה">
      <ul className="flex items-center gap-1 text-sm sm:gap-2">
        {PLATFORM_NAV.map((item) => {
          const active = isPlatformNavActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                  active ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Link href="/" className="rounded-lg px-3 py-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900">
            לאתר
          </Link>
        </li>
      </ul>
    </nav>
  );
}
