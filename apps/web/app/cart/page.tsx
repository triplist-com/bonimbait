import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { type PricedCart, VAT_RATE, formatPrice, listPublishedProducts, priceCart } from '@/lib/db/commerce';
import { readCart } from '@/lib/commerce/cart-server';
import { removeCartLine, updateCartQuantity } from '@/lib/commerce/actions';
import { commerceMetadata } from '@/lib/commerce/seo';
import { CART_MAX_QTY } from '@/lib/commerce/cart';
import ProductCard from '@/components/commerce/ProductCard';
import OrderSummary from '@/components/commerce/OrderSummary';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return commerceMetadata({ title: 'סל קניות - בונים בית', path: '/cart/' });
}

const PAYMENT_MESSAGES: Record<string, string> = {
  failed: 'התשלום לא הושלם. הסל שלכם נשמר — אפשר לנסות שוב.',
  error: 'לא הצלחנו לאמת את התשלום. אם חויבתם, צרו איתנו קשר ונבדוק מיד.',
};

export default async function CartPage({ searchParams }: { searchParams: { payment?: string } }) {
  const cart = readCart();
  const priced: PricedCart | null =
    cart.items.length > 0 && isSupabaseConfigured() ? await priceCart(createClient(), cart) : null;
  const lines = priced?.lines ?? [];
  const notice = searchParams.payment ? PAYMENT_MESSAGES[searchParams.payment] : undefined;

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-3xl font-bold text-gray-900">סל קניות</h1>
      {notice && (
        <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          {notice}
        </p>
      )}
      {priced && priced.unavailable.length > 0 && (
        <p role="status" className="mt-4 rounded-xl border border-gray-200 bg-surface-50 px-4 py-3 text-gray-700">
          חלק מהפריטים בסל אינם זמינים עוד והוסרו מהחישוב.
        </p>
      )}

      {lines.length === 0 ? <EmptyCart /> : <FilledCart priced={priced as PricedCart} />}
    </div>
  );
}

function FilledCart({ priced }: { priced: PricedCart }) {
  const hasExVat = priced.lines.some((l) => !l.vatIncluded);
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
      <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-card">
        {priced.lines.map((line) => (
          <li key={`${line.kind}-${line.id}`} className="flex flex-wrap items-center gap-4 p-4">
            {line.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={line.image} alt="" className="h-20 w-28 rounded-xl object-cover" />
            ) : (
              <div className="flex h-20 w-28 items-center justify-center rounded-xl bg-primary-50 text-sm font-semibold text-primary">
                ניהול בנייה
              </div>
            )}
            <div className="min-w-0 flex-1">
              {line.href ? (
                <Link href={line.href} className="font-semibold text-gray-900 hover:text-primary">
                  {line.name}
                </Link>
              ) : (
                <p className="font-semibold text-gray-900">{line.name}</p>
              )}
              <p className="text-sm text-gray-500">
                {formatPrice(line.unitPriceAgorot)} {line.vatIncluded ? '' : '+ מע״מ'}
              </p>
            </div>
            {line.kind === 'product' ? (
              <form action={updateCartQuantity} className="flex items-center gap-2">
                <input type="hidden" name="id" value={line.id} />
                <input type="hidden" name="kind" value="product" />
                <label className="sr-only" htmlFor={`qty-${line.id}`}>
                  כמות
                </label>
                <input
                  id={`qty-${line.id}`}
                  name="quantity"
                  type="number"
                  min={0}
                  max={CART_MAX_QTY}
                  defaultValue={line.quantity}
                  className="w-20 rounded-xl border border-gray-200 px-3 py-2 text-center"
                />
                <button type="submit" className="rounded-xl border border-gray-200 px-3 py-2 text-sm hover:border-primary hover:text-primary">
                  עדכון
                </button>
              </form>
            ) : (
              <span className="text-sm text-gray-500">כמות: 1</span>
            )}
            <p className="w-28 text-end font-semibold text-gray-900">{formatPrice(line.lineTotalAgorot)}</p>
            <form action={removeCartLine}>
              <input type="hidden" name="id" value={line.id} />
              <input type="hidden" name="kind" value={line.kind} />
              <button type="submit" className="text-sm text-red-600 hover:underline" aria-label={`הסרת ${line.name} מהסל`}>
                הסרה
              </button>
            </form>
          </li>
        ))}
      </ul>
      <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h2 className="mb-4 text-xl font-bold text-gray-900">סיכום הזמנה</h2>
        <OrderSummary totals={priced.totals} vatRate={VAT_RATE} hasExVatLines={hasExVat} />
        <Link
          href="/checkout/"
          className="mt-6 block rounded-xl bg-primary px-4 py-3 text-center font-semibold text-white transition hover:bg-primary-700"
        >
          המשך לתשלום
        </Link>
        <Link href="/הטבות-לקהילה/" className="mt-3 block text-center text-sm text-primary hover:underline">
          חזור לחנות
        </Link>
      </aside>
    </div>
  );
}

async function EmptyCart() {
  const suggestions = isSupabaseConfigured() ? await listPublishedProducts(createClient()) : [];
  return (
    <div className="mt-8">
      <div className="rounded-2xl border border-gray-100 bg-surface-50 p-8 text-center">
        <p className="text-lg font-semibold text-gray-900">עגלת הקניות שלך ריקה כעת!</p>
        <Link
          href="/הטבות-לקהילה/"
          className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-700"
        >
          חזור לחנות
        </Link>
      </div>
      {suggestions.length > 0 && (
        <section className="mt-12" aria-labelledby="cart-suggestions">
          <h2 id="cart-suggestions" className="mb-6 text-2xl font-bold text-gray-900">
            אולי הפריטים הבאים יעניינו אותך…
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((p) => (
              <ProductCard key={p.id} product={p} showExcerpt={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
