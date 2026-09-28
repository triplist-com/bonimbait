import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { findRedirect } from '@/lib/redirects/lookup';
import { wantsTrailingSlash } from '@/lib/site';
import { commerceRedirect } from '@/lib/commerce/middleware';

/**
 * Request pipeline:
 *  1. Legacy redirects from the `redirects` table (301/302/…; cached).
 *  2. Trailing-slash canonicalization for pages (WordPress parity) with a 301.
 *     next.config sets skipTrailingSlashRedirect so /api/* is never redirected
 *     (payment webhooks must not get a 308).
 *  3. Supabase session refresh.
 *  4. /admin requires a signed-in user (role is checked in app/admin/layout).
 *  5. Commerce: /checkout/ 302 -> /cart/ when the cart is empty (WooCommerce
 *     parity), signed-out /checkout/ and /account/ -> /login/.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname === '/api' || pathname.startsWith('/api/');

  // 1. Legacy redirects (never for API routes or the admin/auth area).
  if (!isApi && !pathname.startsWith('/admin') && !pathname.startsWith('/auth')) {
    // The admin redirect tester asks for a fresh map (shared secret header).
    const refreshSecret = process.env.REDIRECT_REFRESH_SECRET;
    const forceRefresh = Boolean(refreshSecret) && request.headers.get('x-bb-redirect-refresh') === refreshSecret;
    const hit = await findRedirect(pathname, { forceRefresh });
    if (hit) {
      const target = new URL(hit.to, request.url);
      if (!target.search && search) target.search = search;
      return NextResponse.redirect(target, hit.code);
    }
  }

  // 2. Trailing slash for page routes.
  // Plain URL on purpose: NextURL re-applies its own trailing-slash
  // formatting and would drop the slash we add.
  if (wantsTrailingSlash(pathname)) {
    const url = new URL(request.url);
    url.pathname = `${url.pathname}/`;
    return NextResponse.redirect(url, 301);
  }

  // 3. Session refresh.
  const { response, user } = await updateSession(request);

  // 4. Admin area: must be signed in (role enforced server-side in the layout).
  if (pathname.startsWith('/admin') && !user) {
    const login = new URL('/login/', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  // 5. Commerce redirects (lib/commerce/middleware.ts).
  const commerce = commerceRedirect(request, Boolean(user));
  if (commerce) return commerce;

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets served from /public.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json|robots.txt|sitemap.xml|images/|fonts/).*)',
  ],
};
