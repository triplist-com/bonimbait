/**
 * Cookie cart. The cookie only holds item ids and quantities; prices,
 * availability and names are always re-read from the DB, so a tampered cookie
 * can at worst reference an item that is then rejected.
 *
 * Pure helpers (parse/serialize/mutate) are safe anywhere; reading/writing the
 * cookie itself is in cart-server.ts.
 */

export const CART_COOKIE = 'bb_cart';
export const CART_MAX_LINES = 20;
export const CART_MAX_QTY = 99;
/** 30 days, like the WooCommerce session. */
export const CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type CartItem =
  | { kind: 'product'; id: string; quantity: number }
  /** A service plan PRICE row (service_plan_prices.id); quantity is always 1. */
  | { kind: 'service_plan'; id: string; quantity: 1 };

export type Cart = { items: CartItem[] };

export const EMPTY_CART: Cart = { items: [] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function clampQty(q: unknown): number {
  const n = Math.floor(Number(q));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, CART_MAX_QTY);
}

/** Parse the cookie value; anything malformed yields an empty cart. */
export function parseCart(raw: string | undefined | null): Cart {
  if (!raw) return EMPTY_CART;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    try {
      data = JSON.parse(decodeURIComponent(raw));
    } catch {
      return EMPTY_CART;
    }
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as { i?: unknown }).i)) return EMPTY_CART;
  const items: CartItem[] = [];
  for (const entry of (data as { i: unknown[] }).i) {
    if (!Array.isArray(entry)) continue;
    const [kind, id, qty] = entry;
    if (!isUuid(id)) continue;
    if (kind === 'p') items.push({ kind: 'product', id, quantity: clampQty(qty) });
    else if (kind === 's') items.push({ kind: 'service_plan', id, quantity: 1 });
  }
  return { items: dedupe(items).slice(0, CART_MAX_LINES) };
}

/** Compact cookie encoding: {"i":[["p","<uuid>",2],["s","<uuid>",1]]}. */
export function serializeCart(cart: Cart): string {
  return JSON.stringify({ i: cart.items.map((it) => [it.kind === 'product' ? 'p' : 's', it.id, it.quantity]) });
}

function dedupe(items: CartItem[]): CartItem[] {
  const seen = new Map<string, CartItem>();
  for (const it of items) {
    const key = `${it.kind}:${it.id}`;
    const prev = seen.get(key);
    if (prev && prev.kind === 'product' && it.kind === 'product') {
      seen.set(key, { ...prev, quantity: Math.min(prev.quantity + it.quantity, CART_MAX_QTY) });
    } else if (!prev) {
      seen.set(key, it);
    }
  }
  return Array.from(seen.values());
}

export function addToCart(cart: Cart, item: CartItem): Cart {
  const normalized: CartItem =
    item.kind === 'product' ? { ...item, quantity: clampQty(item.quantity) } : { ...item, quantity: 1 };
  return { items: dedupe([...cart.items, normalized]).slice(0, CART_MAX_LINES) };
}

/** Set a product line's quantity; 0 removes it. Service plans can only be removed. */
export function setQuantity(cart: Cart, kind: CartItem['kind'], id: string, quantity: number): Cart {
  if (quantity <= 0) return removeFromCart(cart, kind, id);
  return {
    items: cart.items.map((it) =>
      it.kind === kind && it.id === id && it.kind === 'product' ? { ...it, quantity: clampQty(quantity) } : it,
    ),
  };
}

export function removeFromCart(cart: Cart, kind: CartItem['kind'], id: string): Cart {
  return { items: cart.items.filter((it) => !(it.kind === kind && it.id === id)) };
}

export function cartCount(cart: Cart): number {
  return cart.items.reduce((n, it) => n + it.quantity, 0);
}
