'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import type { Role } from '@/lib/db/types';
import { ROLE_LABELS } from '@/lib/admin/labels';
import { isAdminNavActive, type AdminNavGroup } from '@/lib/admin/nav';

type Props = { email: string | null; role: Role; groups: AdminNavGroup[] };

function NavGroups({ groups, pathname, roomy, onNavigate }: { groups: AdminNavGroup[]; pathname: string; roomy?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-4" aria-label="ניווט ניהול">
      {groups.map((group) => (
        <div key={group.id}>
          {group.title && <p className="mb-1 px-3 text-xs font-semibold text-ink-500">{group.title}</p>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((link) => {
              const active = isAdminNavActive(pathname, link);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-lg px-3 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600',
                      roomy ? 'py-2.5' : 'py-1.5',
                      active ? 'bg-primary-50 font-semibold text-primary-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Account({ email, role }: Pick<Props, 'email' | 'role'>) {
  return (
    <div className="border-t border-ink-100 pt-3 text-xs text-ink-500">
      {email && (
        <p className="mb-1 truncate" dir="ltr">
          {email}
        </p>
      )}
      <p className="mb-2">{ROLE_LABELS[role]}</p>
      <div className="flex items-center gap-3">
        <Link href="/" className="text-ink-600 underline hover:text-ink-900">
          לאתר
        </Link>
        <form action="/auth/signout/" method="post">
          <button type="submit" className="text-ink-600 underline hover:text-ink-900">
            התנתקות
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * The admin navigation from lib/admin/nav.ts (resolved for this role by the
 * layout). From lg up it is a fixed sidebar; below lg a top bar opens it as
 * a side sheet, so admin pages get the full width of a phone.
 */
export default function AdminSidebar({ email, role, groups }: Props) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);

  // Close the drawer once a link has navigated.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink-100 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
        <Link href="/admin/" className="text-base font-bold text-primary-700">
          ניהול האתר
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-800 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
        >
          <Menu className="size-5" aria-hidden="true" />
          תפריט
        </button>
      </div>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-e border-ink-200 bg-white p-4 lg:flex">
        <Link href="/admin/" className="mb-5 block text-lg font-bold text-primary-700">
          ניהול האתר
        </Link>
        <div className="flex-1">
          <NavGroups groups={groups} pathname={pathname} />
        </div>
        <div className="mt-4">
          <Account email={email} role={role} />
        </div>
      </aside>

      <Sheet side="start" open={open} onClose={() => setOpen(false)} title="ניהול האתר" className="lg:hidden" bodyClassName="flex flex-col gap-6">
        <NavGroups groups={groups} pathname={pathname} roomy onNavigate={() => setOpen(false)} />
        <Account email={email} role={role} />
      </Sheet>
    </>
  );
}
