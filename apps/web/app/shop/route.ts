import { NextResponse } from 'next/server';

/**
 * WooCommerce's shop page. On the live site /shop/ 301s to the homepage, but
 * the mini-cart's "חזור לחנות" links here, so we 301 to the real shop front,
 * /הטבות-לקהילה/ (not in the live sitemap; no parity impact).
 */
export function GET(request: Request): NextResponse {
  return NextResponse.redirect(new URL(encodeURI('/הטבות-לקהילה/'), request.url), 301);
}
