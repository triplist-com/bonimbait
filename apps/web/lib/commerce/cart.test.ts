import { describe, expect, it } from 'vitest';
import { CART_MAX_QTY, addToCart, cartCount, parseCart, removeFromCart, serializeCart, setQuantity } from './cart';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('cart cookie', () => {
  it('round-trips', () => {
    const cart = addToCart(addToCart({ items: [] }, { kind: 'product', id: A, quantity: 2 }), {
      kind: 'service_plan',
      id: B,
      quantity: 1,
    });
    expect(parseCart(serializeCart(cart))).toEqual(cart);
    expect(cartCount(cart)).toBe(3);
  });

  it('treats malformed or tampered cookies as empty / drops bad lines', () => {
    expect(parseCart('not json').items).toEqual([]);
    expect(parseCart('{"i":"x"}').items).toEqual([]);
    const parsed = parseCart(JSON.stringify({ i: [['p', 'not-a-uuid', 1], ['x', A, 1], ['p', A, -4], ['s', B, 50]] }));
    expect(parsed.items).toEqual([
      { kind: 'product', id: A, quantity: 1 },
      { kind: 'service_plan', id: B, quantity: 1 },
    ]);
  });

  it('merges duplicate products and clamps quantity', () => {
    let cart = addToCart({ items: [] }, { kind: 'product', id: A, quantity: 60 });
    cart = addToCart(cart, { kind: 'product', id: A, quantity: 60 });
    expect(cart.items).toEqual([{ kind: 'product', id: A, quantity: CART_MAX_QTY }]);
  });

  it('never stacks a service plan', () => {
    let cart = addToCart({ items: [] }, { kind: 'service_plan', id: B, quantity: 1 });
    cart = addToCart(cart, { kind: 'service_plan', id: B, quantity: 1 });
    cart = setQuantity(cart, 'service_plan', B, 5);
    expect(cart.items).toEqual([{ kind: 'service_plan', id: B, quantity: 1 }]);
  });

  it('removes lines', () => {
    const cart = addToCart({ items: [] }, { kind: 'product', id: A, quantity: 1 });
    expect(removeFromCart(cart, 'product', A).items).toEqual([]);
    expect(setQuantity(cart, 'product', A, 0).items).toEqual([]);
  });
});
