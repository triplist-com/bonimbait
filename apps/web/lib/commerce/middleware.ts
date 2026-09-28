/**
 * Commerce redirects that must be real HTTP redirects. Edge-safe (no
 * server-only imports). Called from middleware.ts after the session refresh.
 *
 * Why middleware: the root app/loading.tsx wraps every page in Suspense, so a
 * redirect() thrown while rendering is delivered as 200 + client-side
 * redirect. Live parity requires /checkout/ -> 302 /cart/ when the cart is
 * empty (WooCommerce behaviour), and signed-out visitors should get a real
 * redirect to /login/.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { CART_COOKIE, parseCart } from './cart';

/** Returns a redirect response, or null to continue. */
export function commerceRedirect(request: NextRequest, isSignedIn: boolean): NextResponse | null {
  // nextUrl may or may not keep the trailing slash (trailingSlash: true); compare without it.
  const path = request.nextUrl.pathname.replace(/\/+$/, '') || '/';

  if (path === '/checkout') {
    const cart = parseCart(request.cookies.get(CART_COOKIE)?.value);
    if (cart.items.length === 0) return NextResponse.redirect(new URL('/cart/', request.url), 302);
    if (!isSignedIn) return toLogin(request, '/checkout/');
    return null;
  }

  if ((path === '/account' || path.startsWith('/account/')) && !isSignedIn) {
    return toLogin(request, `${path}/`);
  }
  return null;
}

function toLogin(request: NextRequest, next: string): NextResponse {
  const login = new URL('/login/', request.url);
  login.searchParams.set('next', next);
  return NextResponse.redirect(login, 302);
}
