import { NextResponse } from 'next/server';

/**
 * Browser returns from a payment (/api/payments/return, /api/partner-checkout/return)
 * must be full page loads.
 *
 * When a checkout server action calls redirect() with a same-host URL (the mock
 * provider skips the payment page and sends the buyer straight back), Next
 * fetches that URL on the server with `RSC: 1` to stream the next page. It
 * follows our 303 there, so the address bar keeps the signed return URL and
 * the 303's Set-Cookie (the cleared cart) never reaches the browser.
 *
 * Answering that fetch with an empty 204, and applying nothing, makes Next fall
 * back to a full navigation to the same URL: the payment is applied once, and
 * the redirect and its cookies reach the browser. Real gateways (UPay) send the
 * buyer back with a full page load, which carries no RSC header.
 */
export function isRscFetch(request: Request): boolean {
  return request.headers.get('rsc') === '1';
}

export function rscFetchFallback(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
