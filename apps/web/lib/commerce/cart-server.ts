import 'server-only';

import { cookies } from 'next/headers';
import { CART_COOKIE, CART_MAX_AGE_SECONDS, type Cart, EMPTY_CART, parseCart, serializeCart } from './cart';

/** Current request's cart (Server Components, Server Actions, Route Handlers). */
export function readCart(): Cart {
  return parseCart(cookies().get(CART_COOKIE)?.value);
}

/** Persist the cart. Only callable from Server Actions / Route Handlers. */
export function writeCart(cart: Cart): void {
  if (cart.items.length === 0) {
    clearCart();
    return;
  }
  cookies().set(CART_COOKIE, serializeCart(cart), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CART_MAX_AGE_SECONDS,
  });
}

export function clearCart(): void {
  cookies().set(CART_COOKIE, '', { path: '/', maxAge: 0 });
}

export { EMPTY_CART };
