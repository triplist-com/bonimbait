'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/db/types';
import { ROLE_LABELS } from '@/lib/admin/labels';

type Item = { href: string; label: string; adminOnly?: boolean; exact?: boolean };
type Group = { title?: string; items: Item[] };

const GROUPS: Group[] = [
  { items: [{ href: '/admin/', label: 'לוח בקרה', exact: true }] },
  {
    title: 'תוכן',
    items: [
      { href: '/admin/posts/', label: 'מאמרים' },
      { href: '/admin/taxonomy/', label: 'קטגוריות, תגיות וכותבים' },
      { href: '/admin/pages/', label: 'עמודים' },
      { href: '/admin/videos/', label: 'עמודי וידאו' },
      { href: '/admin/media/', label: 'ספריית מדיה' },
    ],
  },
  {
    title: 'נבחרת המומלצים',
    items: [
      { href: '/admin/directory/businesses/', label: 'עסקים' },
      { href: '/admin/directory/ranking/', label: 'סדר הופעה' },
      { href: '/admin/directory/reviews/', label: 'ביקורות' },
      { href: '/admin/directory/requests/', label: 'בקשות הצטרפות וניהול' },
      { href: '/admin/directory/taxonomy/', label: 'תחומים ואזורים' },
    ],
  },
  { title: 'לידים', items: [{ href: '/admin/leads/', label: 'תיבת לידים' }] },
  {
    title: 'חנות ושירותים',
    items: [
      { href: '/admin/commerce/products/', label: 'מוצרים' },
      { href: '/admin/commerce/categories/', label: 'קטגוריות מוצרים' },
      { href: '/admin/commerce/plans/', label: 'מסלולי ליווי' },
      { href: '/admin/commerce/orders/', label: 'הזמנות ותשלומים' },
    ],
  },
  {
    title: 'הגדרות',
    items: [
      { href: '/admin/redirects/', label: 'הפניות (301)' },
      { href: '/admin/members/', label: 'משתמשים והרשאות', adminOnly: true },
      { href: '/admin/search-stats/', label: 'סטטיסטיקות חיפוש', adminOnly: true },
    ],
  },
];

export default function AdminSidebar({ email, role }: { email: string | null; role: Role }) {
  const pathname = usePathname() ?? '';
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const isAdmin = role === 'admin';

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-e border-gray-200 bg-white p-4">
      <Link href="/admin/" className="mb-5 block text-lg font-bold text-primary">
        ניהול האתר
      </Link>
      <nav className="flex flex-1 flex-col gap-4" aria-label="ניווט ניהול">
        {GROUPS.map((group, gi) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={gi}>
              {group.title && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.title}</p>}
              <ul className="flex flex-col gap-0.5">
                {items.map((link) => {
                  const active = link.exact ? path === link.href : path.startsWith(link.href);
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
