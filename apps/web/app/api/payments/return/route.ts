import { NextResponse } from 'next/server';
import { CART_COOKIE } from '@/lib/commerce/cart';
import { handlePaymentCallback } from '@/lib/commerce/payment-callback';

export const dynamic = 'force-dynamic';

/**
 * Browser return from the payment page (successUrl / cancelUrl). Verifies the
 * signed payload, applies it idempotently (the webhook may have arrived
 * first), then sends the buyer on:
 *  - paid   -> /thank-you-order/?order=<id>, cart cleared
 *  - other  -> /cart/?payment=failed (cart kept for a retry)
 */
async function handle(request: Request): Promise<NextResponse> {
  const outcome = await handlePaymentCallback(request);
  const base = new URL(request.url);

  if (outcome.kind === 'applied' && outcome.order.status === 'paid') {
    const target = new URL('/thank-you-order/', base);
    target.searchParams.set('order', outcome.order.id);
    const res = NextResponse.redirect(target, 303);
    res.cookies.set(CART_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  const target = new URL('/cart/', base);
  target.searchParams.set('payment', outcome.kind === 'applied' ? 'failed' : 'error');
  return NextResponse.redirect(target, 303);
}

export const GET = handle;
export const POST = handle;
