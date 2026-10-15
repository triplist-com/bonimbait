'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { PLATFORM_NAV, isPlatformNavActive } from '@/lib/platform/nav';

/** Links of the /platform shell, from lib/platform/nav.ts. Scrolls sideways on narrow phones. */
export default function PlatformNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="ניווט הפלטפורמה" className={cn('min-w-0', className)}>
      <ul className="scrollbar-none -mx-1 flex items-center gap-1 overflow-x-auto px-1 py-0.5 text-sm">
        {PLATFORM_NAV.map((item) => {
          const active = isPlatformNavActive(pathname, item);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-full px-3.5 font-semibold transition-colors',
                  active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
