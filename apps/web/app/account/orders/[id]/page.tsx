import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { VAT_RATE, formatPrice, getOrderWithItems } from '@/lib/db/commerce';
import { isUuid } from '@/lib/commerce/cart';
import { commerceMetadata } from '@/lib/commerce/seo';
import OrderSummary from '@/components/commerce/OrderSummary';
import { ORDER_STATUS_LABELS } from '@/lib/commerce/order-status';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  return commerceMetadata({ title: 'פרטי הזמנה - בונים בית', path: `/account/orders/${params.id}/`, noindex: true });
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireRole('member', `/account/orders/${params.id}/`);
  if (!isUuid(params.id)) notFound();
  // RLS limits this to the member's own orders; the member_id check is defence in depth.
  const order = await getOrderWithItems(createClient(), params.id);
  if (!order || order.member_id !== profile.id) notFound();

  return (
    <div className="container-page max-w-3xl py-8 sm:py-12">
      <Link href="/account/" className="text-sm text-primary hover:underline">
        ‹ חזרה לחשבון שלי
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-gray-900">הזמנה #{order.order_number}</h1>
      <p className="mt-1 text-gray-600">
        סטטוס: <strong>{ORDER_STATUS_LABELS[order.status]}</strong>
      </p>
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <ul className="mb-4 divide-y divide-gray-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-3">
              <span>
                {item.description}
                {item.quantity > 1 && <span className="text-gray-500"> × {item.quantity}</span>}
              </span>
              <span className="font-medium">{formatPrice(item.total_agorot)}</span>
            </li>
          ))}
        </ul>
        <OrderSummary
          totals={{ subtotalAgorot: order.subtotal_agorot, vatAgorot: order.vat_agorot, totalAgorot: order.total_agorot }}
          vatRate={VAT_RATE}
          hasExVatLines={order.vat_agorot > 0}
        />
      </div>
    </div>
  );
}
