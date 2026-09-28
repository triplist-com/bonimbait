'use server';

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/session';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { cartToLines, createPaymentAttempt, createPendingOrder, markOrderFailed } from '@/lib/db/commerce';
import { getPaymentProvider } from '@/lib/payments';
import { readCart } from '@/lib/commerce/cart-server';
import { type FieldErrors, type FormState, bool, str, validateContact } from '@/lib/commerce/forms';
import { absoluteUrl } from '@/lib/site';

/**
 * Place an order:
 *  1. require a signed-in member (the live checkout is behind the account popup)
 *  2. create a pending order + items with DB prices (service role; never client prices)
 *  3. provider.createCheckout() -> payments row -> redirect to the provider page
 * The provider comes back via /api/payments/return (browser) and
 * /api/payments/webhook (server-to-server); both verify and apply idempotently.
 */
export async function placeOrder(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect(`/login/?next=${encodeURIComponent('/checkout/')}`);

  const cart = readCart();
  if (cart.items.length === 0) redirect('/cart/');
  if (!isServiceRoleConfigured()) {
    return { ok: false, message: 'התשלום אינו זמין כרגע. נסו שוב מאוחר יותר.', errors: {} };
  }

  const errors: FieldErrors = {};
  const { fullName, email, phone } = validateContact(form, errors);
  const notes = str(form, 'notes', 1000);
  const city = str(form, 'city', 100);
  if (!bool(form, 'terms')) errors.terms = 'יש לאשר את תקנון האתר';
  if (Object.keys(errors).length) return { ok: false, message: 'נא לתקן את השדות המסומנים.', errors };

  const admin = createAdminClient();
  let order;
  try {
    order = await createPendingOrder(admin, {
      memberId: user.id,
      customer: { name: fullName, email, phone },
      lines: cartToLines(cart),
      billing: { city: city || null },
      notes: notes || null,
    });
  } catch (err) {
    console.error('[checkout] createPendingOrder failed', err);
    return { ok: false, message: 'חלק מהפריטים בסל אינם זמינים עוד. חזרו לסל ועדכנו אותו.', errors: {} };
  }

  let redirectUrl: string;
  try {
    const provider = getPaymentProvider();
    const session = await provider.createCheckout({
      orderId: order.id,
      orderNumber: order.order_number,
      amountAgorot: order.total_agorot,
      currency: 'ILS',
      description: `הזמנה ${order.order_number} — בונים בית`,
      customer: { name: fullName, email, phone },
      successUrl: absoluteUrl('/api/payments/return?result=success'),
      cancelUrl: absoluteUrl('/api/payments/return?result=cancel'),
      notifyUrl: absoluteUrl('/api/payments/webhook'),
    });
    await createPaymentAttempt(admin, {
      orderId: order.id,
      provider: session.provider,
      providerRef: session.providerRef,
      amountAgorot: order.total_agorot,
    });
    redirectUrl = session.redirectUrl;
  } catch (err) {
    console.error('[checkout] payment provider error', err);
    await markOrderFailed(admin, order.id).catch(() => undefined);
    return { ok: false, message: 'לא הצלחנו להתחבר לספק התשלומים. נסו שוב בעוד מספר דקות.', errors: {} };
  }
  redirect(redirectUrl);
}
