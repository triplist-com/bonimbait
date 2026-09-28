import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatPrice } from '@/lib/db/commerce';
import { PRODUCT_STATUS, formatDate } from '@/lib/admin/labels';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader, { ButtonLink } from '@/components/admin/PageHeader';

export const metadata = { title: 'מוצרים' };

export default async function ProductsPage() {
  const { data, error } = await createClient()
    .from('products')
    .select('id, slug, name, status, is_purchasable, price_agorot, sale_price_agorot, sort_order, updated_at')
    .order('sort_order')
    .order('name');
  if (error) throw new Error(error.message);
  return (
    <div className="max-w-6xl">
      <PageHeader title="מוצרים והטבות" description="מוצרי חנות ההטבות (/product/…)." actions={<ButtonLink href="/admin/commerce/products/new/">מוצר חדש</ButtonLink>} />
      <DataTable
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 'n',
            header: 'מוצר',
            render: (r) => (
              <Link href={`/admin/commerce/products/${r.id}/`} className="font-medium hover:text-primary hover:underline">
                {r.name}
              </Link>
            ),
          },
          { key: 's', header: 'סטטוס', render: (r) => <StatusBadge info={PRODUCT_STATUS[r.status]} /> },
          { key: 'm', header: 'מכירה', render: (r) => (r.is_purchasable ? 'סל קניות' : 'טופס ליד') },
          { key: 'p', header: 'מחיר', render: (r) => (r.price_agorot ? formatPrice(r.sale_price_agorot ?? r.price_agorot) : '—') },
          { key: 'o', header: 'סדר', render: (r) => r.sort_order },
          { key: 'u', header: 'עודכן', render: (r) => formatDate(r.updated_at) },
        ]}
      />
    </div>
  );
}
