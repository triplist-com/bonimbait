import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getProfile } from '@/lib/auth/session';
import { VAT_RATE, formatPrice, priceCart } from '@/lib/db/commerce';
import { readCart } from '@/lib/commerce/cart-server';
import { commerceMetadata } from '@/lib/commerce/seo';
import OrderSummary from '@/components/commerce/OrderSummary';
import CheckoutForm from './CheckoutForm';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return commerceMetadata({ title: 'תשלום - בונים בית', path: '/checkout/', noindex: true });
}

/**
 * /checkout/: redirects to /cart/ when the cart is empty (as WooCommerce does:
 * live 302; Next's redirect() is a 307, same class for url_parity), and to
 * /login/ when signed out. Totals are re-priced from the DB on every render.
 */
export default async function CheckoutPage() {
  const cart = readCart();
  if (cart.items.length === 0 || !isSupabaseConfigured()) redirect('/cart/');

  const priced = await priceCart(createClient(), cart);
  if (priced.lines.length === 0) redirect('/cart/');

  const profile = await getProfile();
  if (!profile) redirect(`/login/?next=${encodeURIComponent('/checkout/')}`);

  const hasExVat = priced.lines.some((l) => !l.vatIncluded);

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-3xl font-bold text-gray-900">תשלום</h1>
      {priced.unavailable.length > 0 && (
        <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          חלק מהפריטים בסל אינם זמינים עוד.{' '}
          <Link href="/cart/" className="underline">
            עדכנו את הסל
          </Link>{' '}
          לפני התשלום.
        </p>
      )}
      <div className="mt-8 grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="billing" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
          <h2 id="billing" className="mb-4 text-xl font-bold text-gray-900">
            פרטי המזמין
          </h2>
          <CheckoutForm
            defaults={{ fullName: profile.full_name, email: profile.email, phone: profile.phone }}
            totalLabel={formatPrice(priced.totals.totalAgorot)}
          />
        </section>
        <aside aria-labelledby="order-review" className="h-fit rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
          <h2 id="order-review" className="mb-4 text-xl font-bold text-gray-900">
            ההזמנה שלך
          </h2>
          <ul className="mb-4 divide-y divide-gray-100">
            {priced.lines.map((line) => (
              <li key={`${line.kind}-${line.id}`} className="flex justify-between gap-4 py-3">
                <span className="text-gray-800">
                  {line.name}
                  {line.quantity > 1 && <span className="text-gray-500"> × {line.quantity}</span>}
                </span>
                <span className="whitespace-nowrap font-medium text-gray-900">
                  {formatPrice(line.lineTotalAgorot)}
                  {!line.vatIncluded && <span className="text-xs text-gray-500"> + מע״מ</span>}
                </span>
              </li>
            ))}
          </ul>
          <OrderSummary totals={priced.totals} vatRate={VAT_RATE} hasExVatLines={hasExVat} />
          <p className="mt-4 text-xs text-gray-500">התשלום מתבצע בעמוד מאובטח של חברת הסליקה. פרטי כרטיס האשראי אינם נשמרים באתר.</p>
        </aside>
      </div>
    </div>
  );
}
