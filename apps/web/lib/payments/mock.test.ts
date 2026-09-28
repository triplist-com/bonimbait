import { afterEach, describe, expect, it } from 'vitest';
import { MockProvider } from './mock';
import { PaymentVerificationError, type CheckoutRequest } from './types';

const request: CheckoutRequest = {
  orderId: '33333333-3333-4333-8333-333333333333',
  orderNumber: 10001,
  amountAgorot: 814_200,
  currency: 'ILS',
  description: 'test',
  customer: { name: 'Test', email: 't@example.com' },
  successUrl: 'http://localhost:3103/api/payments/return?result=success',
  cancelUrl: 'http://localhost:3103/api/payments/return?result=cancel',
  notifyUrl: 'http://localhost:3103/api/payments/webhook',
};

afterEach(() => {
  delete process.env.PAYMENT_MOCK_OUTCOME;
});

describe('MockProvider', () => {
  it('signs the return URL and verifies it', async () => {
    const provider = new MockProvider('secret');
    const session = await provider.createCheckout(request);
    expect(session.redirectUrl.startsWith(request.successUrl.split('?')[0])).toBe(true);
    const verified = await provider.verifyCallback(new Request(session.redirectUrl));
    expect(verified).toMatchObject({ status: 'succeeded', amountAgorot: 814_200, orderId: request.orderId });
  });

  it('verifies the same payload posted to the webhook as JSON', async () => {
    const provider = new MockProvider('secret');
    const session = await provider.createCheckout(request);
    const params = Object.fromEntries(new URL(session.redirectUrl).searchParams);
    const webhook = new Request(request.notifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    expect((await provider.verifyCallback(webhook)).status).toBe('succeeded');
  });

  it('rejects a tampered amount or status', async () => {
    const provider = new MockProvider('secret');
    const url = new URL((await provider.createCheckout(request)).redirectUrl);
    url.searchParams.set('amount', '1');
    await expect(provider.verifyCallback(new Request(url))).rejects.toBeInstanceOf(PaymentVerificationError);
  });

  it('rejects a callback signed with another secret', async () => {
    const url = (await new MockProvider('a').createCheckout(request)).redirectUrl;
    await expect(new MockProvider('b').verifyCallback(new Request(url))).rejects.toBeInstanceOf(PaymentVerificationError);
  });

  it('routes failures to the cancel URL', async () => {
    process.env.PAYMENT_MOCK_OUTCOME = 'failed';
    const session = await new MockProvider('secret').createCheckout(request);
    expect(new URL(session.redirectUrl).searchParams.get('result')).toBe('cancel');
    expect(new URL(session.redirectUrl).searchParams.get('status')).toBe('failed');
  });
});
