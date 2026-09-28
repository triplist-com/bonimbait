import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatPrice } from '@/lib/db/commerce';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader from '@/components/admin/PageHeader';

export const metadata = { title: 'מסלולי ליווי' };

export default async function PlansPage() {
  const db = createClient();
  const [{ data: plans }, { data: prices }] = await Promise.all([
    db.from('service_plans').select('*').order('sort_order'),
    db.from('service_plan_prices').select('plan_id, price_agorot').order('sort_order'),
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader title="מסלולי ליווי (/membership-tiers/)" description="מחירים, טבלת ההשוואה והאם ניתן לרכוש באתר." />
      <DataTable
        rows={plans ?? []}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 'n',
            header: 'מסלול',
            render: (r) => (
              <Link href={`/admin/commerce/plans/${r.id}/`} className="font-medium hover:text-primary hover:underline">
                {r.name}
              </Link>
            ),
          },
          {
            key: 'p',
            header: 'מחירים (לפני מע"מ)',
            render: (r) =>
              (prices ?? [])
                .filter((p) => p.plan_id === r.id)
                .map((p) => formatPrice(p.price_agorot))
                .join(' / ') || '—',
          },
          { key: 'a', header: 'מוצג', render: (r) => <StatusBadge label={r.is_active ? 'פעיל' : 'מוסתר'} tone={r.is_active ? 'green' : 'gray'} /> },
          { key: 'o', header: 'רכישה באתר', render: (r) => <StatusBadge label={r.is_purchasable_online ? 'כן' : 'ייעוץ בלבד'} tone={r.is_purchasable_online ? 'blue' : 'gray'} /> },
        ]}
      />
    </div>
  );
}
