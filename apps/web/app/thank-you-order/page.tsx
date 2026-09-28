import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getUser } from '@/lib/auth/session';
import { getOrderWithItems } from '@/lib/db/commerce';
import { isUuid } from '@/lib/commerce/cart';
import { commerceMetadata } from '@/lib/commerce/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return commerceMetadata({
    title: 'תודה - בונים בית',
    description: 'תודה על רכישתך! בדקות הקרובות תישלח אליך הודעת מייל עם פרטי ההזמנה.',
    path: '/thank-you-order/',
    nofollow: true,
  });
}

/**
 * Order confirmation (live page 74244). /api/payments/return sends buyers
 * here with ?order=<uuid>; the order is read as the buyer (RLS: own orders),
 * so the number is only shown to its owner. Without a param it renders the
 * live page's generic text.
 */
export default async function ThankYouOrderPage({ searchParams }: { searchParams: { order?: string } }) {
  let orderNumber: number | null = null;
  let paid = false;
  if (isUuid(searchParams.order) && isSupabaseConfigured() && (await getUser())) {
    const order = await getOrderWithItems(createClient(), searchParams.order).catch(() => null);
    if (order) {
      orderNumber = order.order_number;
      paid = order.status === 'paid';
    }
  }

  return (
    <div className="container-page py-16 sm:py-24">
      <div className="mx-auto max-w-xl rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-card sm:p-12">
        <div aria-hidden="true" className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-3xl text-success">
          ✓
        </div>
        <h1 className="text-3xl font-bold text-gray-900">תודה על רכישתך!</h1>
        <p className="mt-4 text-gray-600">בדקות הקרובות תישלח אליך הודעת מייל עם פרטי ההזמנה.</p>
        <p className="mt-2 text-gray-800">
          מספר ההזמנה שלך הוא <strong>{orderNumber ?? '-'}</strong>.
        </p>
        {orderNumber !== null && !paid && (
          <p className="mt-2 text-sm text-amber-700">התשלום עדיין בעיבוד. נעדכן אותך במייל ברגע שיאושר.</p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/צור-קשר/" className="rounded-xl border border-primary px-5 py-2.5 font-semibold text-primary hover:bg-primary hover:text-white">
            שירות לקוחות
          </Link>
          <Link href="/" className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-700">
            חזרה לעמוד הבית
          </Link>
          {orderNumber !== null && (
            <Link href="/account/" className="rounded-xl px-5 py-2.5 font-semibold text-primary hover:underline">
              להזמנות שלי
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
