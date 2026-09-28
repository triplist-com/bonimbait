import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { pageRange } from '@/lib/db/client';
import { formatPrice } from '@/lib/db/commerce';
import type { OrderStatus } from '@/lib/db/types';
import { ORDER_STATUS, formatDateTime } from '@/lib/admin/labels';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader, { FilterBar } from '@/components/admin/PageHeader';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';
import { Select, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'הזמנות' };

const STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[];

export default async function OrdersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const status = param(searchParams.status) as OrderStatus | undefined;
  const q = param(searchParams.q);
  const page = pageParam(searchParams.page);
  const pageSize = 50;
  const { from, to } = pageRange(page, pageSize);
  let query = createClient().from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
  if (status && STATUSES.includes(status)) query = query.eq('status', status);
  const term = q?.replace(/[%,()*\\]/g, ' ').trim();
  if (term) query = /^\d+$/.test(term) ? query.eq('order_number', Number(term)) : query.or(`customer_name.ilike.*${term}*,customer_email.ilike.*${term}*`);
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="max-w-6xl">
      <PageHeader title="הזמנות ותשלומים" description={`${count ?? 0} הזמנות. תשלומים מתעדכנים אוטומטית מספק התשלום.`} />
      <FilterBar action="/admin/commerce/orders/">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">סטטוס</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">הכול</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS[s].label}
              </option>
            ))}
          </Select>
        </label>
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-600">מספר הזמנה, שם או מייל</span>
          <TextInput name="q" defaultValue={q} />
        </label>
      </FilterBar>
      <DataTable
        rows={data ?? []}
        rowKey={(r) => r.id}
        empty="אין הזמנות."
        columns={[
          {
            key: 'n',
            header: 'הזמנה',
            render: (r) => (
              <Link href={`/admin/commerce/orders/${r.id}/`} className="font-medium text-primary hover:underline">
                #{r.order_number}
              </Link>
            ),
          },
          { key: 'd', header: 'תאריך', render: (r) => formatDateTime(r.created_at) },
          { key: 'c', header: 'לקוח', render: (r) => r.customer_name },
          { key: 'e', header: 'מייל', className: 'hidden md:table-cell', render: (r) => <span dir="ltr">{r.customer_email}</span> },
          { key: 't', header: 'סכום', render: (r) => formatPrice(r.total_agorot) },
          { key: 's', header: 'סטטוס', render: (r) => <StatusBadge info={ORDER_STATUS[r.status]} /> },
        ]}
      />
      <AdminPagination basePath="/admin/commerce/orders/" params={{ status, q }} page={page} pageSize={pageSize} total={count ?? 0} />
    </div>
  );
}
