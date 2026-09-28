import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { commerceRedirect } from '@/lib/commerce/middleware';
import { CART_COOKIE, serializeCart } from '@/lib/commerce/cart';

const ITEM = { kind: 'product' as const, id: '11111111-1111-4111-8111-111111111111', quantity: 1 };

function req(path: string, cart?: boolean): NextRequest {
  const r = new NextRequest(new URL(path, 'http://localhost:3103'));
  if (cart) r.cookies.set(CART_COOKIE, serializeCart({ items: [ITEM] }));
  return r;
}

describe('commerceRedirect', () => {
  it('302s /checkout/ to /cart/ when the cart is empty (live parity), signed in or not', () => {
    for (const signedIn of [false, true]) {
      const res = commerceRedirect(req('/checkout/'), signedIn);
      expect(res?.status).toBe(302);
      expect(new URL(res!.headers.get('location')!).pathname).toBe('/cart/');
    }
  });

  it('sends signed-out buyers with a cart to login, then back to checkout', () => {
    const res = commerceRedirect(req('/checkout/', true), false);
    expect(res?.status).toBe(302);
    const loc = new URL(res!.headers.get('location')!);
    expect(loc.pathname).toBe('/login/');
    expect(loc.searchParams.get('next')).toBe('/checkout/');
  });

  it('lets signed-in buyers with a cart through', () => {
    expect(commerceRedirect(req('/checkout/', true), true)).toBeNull();
  });

  it('guards the account area', () => {
    expect(commerceRedirect(req('/account/'), false)?.status).toBe(302);
    expect(commerceRedirect(req('/account/orders/x/'), false)?.headers.get('location')).toContain('next=%2Faccount%2Forders%2Fx%2F');
    expect(commerceRedirect(req('/account/'), true)).toBeNull();
    expect(commerceRedirect(req('/cart/'), false)).toBeNull();
  });
});
