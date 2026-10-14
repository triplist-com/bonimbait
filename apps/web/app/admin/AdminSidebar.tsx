'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/db/types';
import { ROLE_LABELS } from '@/lib/admin/labels';
import { isAdminNavActive, type AdminNavGroup } from '@/lib/admin/nav';

/** Renders the groups the layout resolved from lib/admin/nav.ts for this role. */
export default function AdminSidebar({ email, role, groups }: { email: string | null; role: Role; groups: AdminNavGroup[] }) {
  const pathname = usePathname() ?? '';

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-e border-gray-200 bg-white p-4">
      <Link href="/admin/" className="mb-5 block text-lg font-bold text-primary">
        ניהול האתר
      </Link>
      <nav className="flex flex-1 flex-col gap-4" aria-label="ניווט ניהול">
        {groups.map((group) => {
          return (
            <div key={group.id}>
              {group.title && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.title}</p>}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((link) => {
                  const active = isAdminNavActive(pathname, link);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? 'page' : undefined}
                        className={`block rounded-lg px-3 py-1.5 text-sm transition ${
                          active ? 'bg-primary-50 font-medium text-primary' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
        {email && (
          <p className="mb-1 truncate" dir="ltr">
            {email}
          </p>
        )}
        <p className="mb-2">{ROLE_LABELS[role]}</p>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-600 underline hover:text-gray-900">
            לאתר
          </Link>
          <form action="/auth/signout/" method="post">
            <button type="submit" className="text-gray-600 underline hover:text-gray-900">
              התנתקות
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
