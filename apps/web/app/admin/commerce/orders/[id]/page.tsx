import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { formatPrice, getOrderWithItems } from '@/lib/db/commerce';
import type { OrderStatus } from '@/lib/db/types';
import { setOrderStatus } from '@/lib/admin/actions/commerce';
import { ORDER_STATUS, PAYMENT_STATUS, formatDateTime } from '@/lib/admin/labels';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import DataTable from '@/components/admin/DataTable';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Section, Select, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'פרטי הזמנה' };

export default async function OrderPage({ params }: { params: { id: string } }) {
  const db = createClient();
  const [order, me] = await Promise.all([getOrderWithItems(db, params.id).catch(() => null), getProfile()]);
  if (!order) notFound();
  const billing = order.billing && typeof order.billing === 'object' && !Array.isArray(order.billing) ? Object.entries(order.billing) : [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        back={{ href: '/admin/commerce/orders/', label: 'כל ההזמנות' }}
        title={`הזמנה #${order.order_number}`}
        description={
          <span className="flex items-center gap-2">
            {formatDateTime(order.created_at)} <StatusBadge info={ORDER_STATUS[order.status]} />
          </span>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Section title="פריטים">
            <DataTable
              rows={order.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'd', header: 'פריט', render: (r) => r.description },
                { key: 'q', header: 'כמות', render: (r) => r.quantity },
                { key: 'u', header: 'מחיר יחידה', render: (r) => formatPrice(r.unit_price_agorot) },
                { key: 't', header: 'סה"כ', render: (r) => formatPrice(r.total_agorot) },
              ]}
            />
            <dl className="ms-auto w-64 space-y-1 text-sm">
              <div className="flex justify-between"><dt>ביניים</dt><dd>{formatPrice(order.subtotal_agorot)}</dd></div>
              {order.discount_agorot > 0 && <div className="flex justify-between"><dt>הנחה</dt><dd>−{formatPrice(order.discount_agorot)}</dd></div>}
              <div className="flex justify-between"><dt>מע&quot;מ</dt><dd>{formatPrice(order.vat_agorot)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>סה&quot;כ</dt><dd>{formatPrice(order.total_agorot)}</dd></div>
            </dl>
          </Section>
          <Section title="ניסיונות תשלום">
            <DataTable
              rows={order.payments}
              rowKey={(r) => r.id}
              empty="אין ניסיונות תשלום."
              columns={[
                { key: 'd', header: 'תאריך', render: (r) => formatDateTime(r.created_at) },
                { key: 'p', header: 'ספק', render: (r) => r.provider },
                { key: 'r', header: 'אסמכתא', render: (r) => <span dir="ltr" className="text-xs">{r.provider_ref ?? '—'}</span> },
                { key: 'a', header: 'סכום', render: (r) => formatPrice(r.amount_agorot) },
                { key: 's', header: 'סטטוס', render: (r) => <StatusBadge info={PAYMENT_STATUS[r.status]} /> },
                { key: 'e', header: 'שגיאה', render: (r) => r.error_message ?? '' },
              ]}
            />
          </Section>
        </div>
        <aside className="space-y-5">
          <Section title="לקוח">
            <p className="text-sm">{order.customer_name}</p>
            <p className="text-sm" dir="ltr">{order.customer_email}</p>
            <p className="text-sm" dir="ltr">{order.customer_phone}</p>
            {billing.map(([k, v]) => (
              <p key={k} className="text-xs text-gray-600">
                {k}: {typeof v === 'string' ? v : JSON.stringify(v)}
              </p>
            ))}
            {order.member_id && me?.role === 'admin' && (
              <Link href={`/admin/members/${order.member_id}/`} className="text-sm text-primary hover:underline">
                לפרופיל המשתמש
              </Link>
            )}
          </Section>
          {order.notes && (
            <Section title="הערות">
              <p className="whitespace-pre-line text-xs text-gray-700">{order.notes}</p>
            </Section>
          )}
          {me?.role === 'admin' && (
            <Section title="שינוי סטטוס ידני">
              <p className="text-xs text-gray-500">למשל תשלום בהעברה בנקאית או זיכוי שבוצע מחוץ לאתר. השינוי לא מבצע חיוב או זיכוי בפועל.</p>
              <ConfirmDialog
                trigger="שינוי סטטוס…"
                triggerClassName="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                title={`שינוי סטטוס להזמנה #${order.order_number}`}
                confirmLabel="עדכון"
                tone="primary"
                onConfirm={setOrderStatus.bind(null, order.id)}
              >
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600">סטטוס חדש</span>
                  <Select name="status" defaultValue={order.status}>
                    {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {ORDER_STATUS[s].label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600">סיבה</span>
                  <TextInput name="reason" />
                </label>
              </ConfirmDialog>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
