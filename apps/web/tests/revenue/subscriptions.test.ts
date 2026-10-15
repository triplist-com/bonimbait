import { describe, expect, it } from 'vitest';
import { MockProvider } from '@/lib/payments/mock';
import { addMonth, checkoutOrderNumber, decideTierPayment } from '@/lib/revenue/subscriptions';

const NOW = new Date('2026-10-15T09:00:00.000Z');

describe('addMonth', () => {
  it('keeps the day, clamped to the month end', () => {
    expect(addMonth(NOW).toISOString()).toBe('2026-11-15T09:00:00.000Z');
    expect(addMonth(new Date('2026-01-31T00:00:00Z')).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonth(new Date('2028-01-31T00:00:00Z')).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonth(new Date('2026-12-10T00:00:00Z')).toISOString()).toBe('2027-01-10T00:00:00.000Z');
  });
});

describe('decideTierPayment', () => {
  const sub = { status: 'pending' as const, provider_ref: 'mock_1', price_agorot: 149_000 };
  const paid = { providerRef: 'mock_1', status: 'succeeded' as const, amountAgorot: 149_000 };

  it('activates a paid pending subscription for one month', () => {
    expect(decideTierPayment(sub, paid, NOW)).toEqual({
      kind: 'activate',
      patch: {
        status: 'active',
        started_at: NOW.toISOString(),
        current_period_end: '2026-11-15T09:00:00.000Z',
        last_payment_at: NOW.toISOString(),
        cancelled_at: null,
      },
    });
  });

  it('is idempotent and refuses anything that does not add up', () => {
    expect(decideTierPayment({ ...sub, status: 'active' }, paid, NOW)).toEqual({ kind: 'already_active' });
    expect(decideTierPayment(sub, { ...paid, status: 'failed' }, NOW)).toEqual({ kind: 'not_paid' });
    expect(decideTierPayment(sub, { ...paid, amountAgorot: 49_000 }, NOW)).toEqual({ kind: 'reject', reason: 'amount_mismatch' });
    expect(decideTierPayment(sub, { ...paid, providerRef: 'mock_2' }, NOW)).toEqual({ kind: 'reject', reason: 'ref_mismatch' });
    expect(decideTierPayment({ ...sub, provider_ref: null }, paid, NOW)).toEqual({ kind: 'reject', reason: 'ref_mismatch' });
    expect(decideTierPayment({ ...sub, status: 'cancelled' }, paid, NOW)).toEqual({ kind: 'reject', reason: 'cancelled' });
  });

  it('round-trips the mock PaymentProvider: signed return URL -> verified -> activate', async () => {
    const provider = new MockProvider('test-secret');
    const subId = '00000000-0000-4000-8000-0000000000aa';
    const session = await provider.createCheckout({
      orderId: subId,
      orderNumber: checkoutOrderNumber(subId),
      amountAgorot: 149_000,
      currency: 'ILS',
      description: 'מסלול שותפים',
      customer: { name: 'עסק לדוגמה', email: 'owner@example.com' },
      successUrl: 'http://localhost:3113/api/partner-checkout/return/',
      cancelUrl: 'http://localhost:3113/api/partner-checkout/return/',
      notifyUrl: 'http://localhost:3113/api/partner-checkout/return/',
    });
    const verified = await provider.verifyCallback(new Request(session.redirectUrl));
    expect(verified).toMatchObject({ orderId: subId, status: 'succeeded', amountAgorot: 149_000 });
    const decision = decideTierPayment({ status: 'pending', provider_ref: session.providerRef, price_agorot: 149_000 }, verified, NOW);
    expect(decision.kind).toBe('activate');
    // A tampered return URL never verifies.
    const forged = new URL(session.redirectUrl);
    forged.searchParams.set('amount', '1');
    await expect(provider.verifyCallback(new Request(forged))).rejects.toThrow();
  });

  it('derives a stable 9-digit order number', () => {
    const n = checkoutOrderNumber('00000000-0000-4000-8000-0000000000aa');
    expect(n).toBe(checkoutOrderNumber('00000000-0000-4000-8000-0000000000aa'));
    expect(String(n)).toMatch(/^\d{9}$/);
  });
});
