import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatPrice } from '@/lib/db/commerce';
import type { LeadType } from '@/lib/db/types';
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { ORDER_STATUS, formatDateTime } from '@/lib/admin/labels';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader from '@/components/admin/PageHeader';

export const metadata = { title: 'לוח בקרה' };

function Card({ label, value, href, tone = 'text-gray-900' }: { label: string; value: number | string; href: string; tone?: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-gray-200 bg-white p-4 shadow-card transition hover:border-primary-200 hover:shadow-card-hover">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
    </Link>
  );
}

const QUICK = [
  { href: '/admin/posts/new/', label: 'מאמר חדש' },
  { href: '/admin/posts/', label: 'כל המאמרים' },
  { href: '/admin/media/', label: 'העלאת תמונות' },
  { href: '/admin/directory/businesses/', label: 'עסקים' },
  { href: '/admin/leads/?status=new', label: 'לידים חדשים' },
  { href: '/admin/redirects/', label: 'הפניות' },
];

export default async function AdminDashboard() {
  const db = createClient();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [newLeads, pendingReviews, pendingBusinesses, openRequests, recentOrders, paidMonth] = await Promise.all([
    db.from('leads').select('type').eq('status', 'new').limit(5000),
    db.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending').then((r) => r.count ?? 0),
    db.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'pending').then((r) => r.count ?? 0),
    db.from('leads').select('id', { count: 'exact', head: true }).in('type', ['claim_business', 'join_pro']).in('status', ['new', 'contacted', 'in_progress']),
    db.from('orders').select('id, order_number, customer_name, total_agorot, status, created_at').order('created_at', { ascending: false }).limit(6),
    db.from('orders').select('total_agorot').eq('status', 'paid').gte('created_at', since),
  ]);

  const byType = new Map<LeadType, number>();
  (newLeads.data ?? []).forEach((l) => byType.set(l.type, (byType.get(l.type) ?? 0) + 1));
  const totalNew = newLeads.data?.length ?? 0;
  const revenue = (paidMonth.data ?? []).reduce((a, o) => a + o.total_agorot, 0);

  return (
    <div className="max-w-6xl space-y-8">
      <PageHeader title="לוח בקרה" description="מה מחכה לטיפול באתר." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card label="לידים חדשים" value={totalNew} href="/admin/leads/?status=new" tone={totalNew ? 'text-primary' : undefined} />
        <Card label="ביקורות ממתינות" value={pendingReviews} href="/admin/directory/reviews/" tone={pendingReviews ? 'text-amber-600' : undefined} />
        <Card label="בקשות ניהול / הצטרפות" value={openRequests.count ?? 0} href="/admin/directory/requests/" tone={openRequests.count ? 'text-amber-600' : undefined} />
        <Card label="עסקים ממתינים לאישור" value={pendingBusinesses} href="/admin/directory/businesses/?status=pending" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <h2 className="mb-3 text-base font-semibold">לידים חדשים לפי סוג</h2>
          {totalNew === 0 ? (
            <p className="text-sm text-gray-500">אין לידים חדשים.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {LEAD_TYPES.filter((t) => byType.get(t)).map((t) => (
                <li key={t} className="flex items-center justify-between py-2">
                  <Link href={`/admin/leads/?type=${t}&status=new`} className="hover:text-primary hover:underline">
                    {LEAD_TYPE_LABELS[t]}
                  </Link>
                  <span className="font-semibold">{byType.get(t)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">הזמנות אחרונות</h2>
            <span className="text-xs text-gray-500">שולם ב-30 יום: {formatPrice(revenue)}</span>
          </div>
          {(recentOrders.data ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">אין הזמנות עדיין.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {(recentOrders.data ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/admin/commerce/orders/${o.id}/`} className="hover:text-primary hover:underline">
                    #{o.order_number} · {o.customer_name}
                  </Link>
                  <span className="flex items-center gap-2 text-gray-600">
                    {formatPrice(o.total_agorot)} <StatusBadge info={ORDER_STATUS[o.status]} />
                    <span className="hidden text-xs sm:inline">{formatDateTime(o.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold">קיצורי דרך</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-card hover:border-primary hover:text-primary">
              {q.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
