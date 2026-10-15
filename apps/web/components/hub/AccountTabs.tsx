import Link from 'next/link';
import { House, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';

/** "הבית שלי" | "פרטים והזמנות": the two halves of a member's area. Server-safe. */
export function AccountTabs({ current }: { current: 'hub' | 'account' }) {
  const tabs = [
    { id: 'hub', href: '/my-home/', label: 'הבית שלי', icon: House },
    { id: 'account', href: '/account/', label: 'פרטים והזמנות', icon: UserRound },
  ] as const;
  return (
    <nav aria-label="האזור האישי" className="mb-6">
      <ul className="inline-flex gap-1 rounded-2xl bg-ink-100 p-1">
        {tabs.map(({ id, href, label, icon: Icon }) => (
          <li key={id}>
            <Link
              href={href}
              prefetch={false}
              aria-current={current === id ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors',
                current === id ? 'bg-white text-ink-900 shadow-xs' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
