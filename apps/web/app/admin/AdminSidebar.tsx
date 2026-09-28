'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [{ href: '/admin/', label: 'לוח בקרה' }];

export default function AdminSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-e border-gray-200 bg-white min-h-screen p-4 flex flex-col">
      <h2 className="text-lg font-bold text-primary mb-6">ניהול</h2>
      <nav className="flex flex-col gap-1 flex-1">
        {LINKS.map((link) => {
          const active = pathname === link.href || `${pathname}/` === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? 'bg-primary-50 text-primary font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-100 pt-3 text-xs text-gray-500">
        {email && <p className="mb-2 truncate" dir="ltr">{email}</p>}
        <form action="/auth/signout/" method="post">
          <button type="submit" className="text-gray-600 hover:text-gray-900 underline">
            התנתקות
          </button>
        </form>
      </div>
    </aside>
  );
}
