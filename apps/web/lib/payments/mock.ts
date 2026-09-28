import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PaymentStatus } from '@/lib/db/types';
import {
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type RefundRequest,
  type RefundResult,
  type VerifiedPayment,
  PaymentConfigurationError,
  PaymentVerificationError,
} from './types';

const DEV_SECRET = 'bonimbait-mock-payments-dev-secret';

/**
 * Mock gateway for development and staging until UPay credentials exist.
 *
 * createCheckout() skips any payment page and redirects straight to
 * successUrl (or cancelUrl when PAYMENT_MOCK_OUTCOME=failed) with signed
 * query params: provider, ref, order, amount, status, sig. verifyCallback()
 * checks the HMAC, so return URLs can't be forged.
 *
 * Production builds require PAYMENT_MOCK_SECRET (no silent default).
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  private readonly secret: string;

  constructor(secret = process.env.PAYMENT_MOCK_SECRET) {
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new PaymentConfigurationError('PAYMENT_MOCK_SECRET is required for the mock provider in production');
    }
    this.secret = secret || DEV_SECRET;
  }

  private sign(fields: { ref: string; order: string; amount: string; status: string }): string {
    return createHmac('sha256', this.secret)
      .update(`${fields.ref}|${fields.order}|${fields.amount}|${fields.status}`)
      .digest('hex');
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const ref = `mock_${randomUUID()}`;
    const failed = process.env.PAYMENT_MOCK_OUTCOME === 'failed';
    const status: PaymentStatus = failed ? 'failed' : 'succeeded';
    const fields = { ref, order: request.orderId, amount: String(request.amountAgorot), status };

    const target = new URL(failed ? request.cancelUrl : request.successUrl);
    target.searchParams.set('provider', this.name);
    target.searchParams.set('ref', fields.ref);
    target.searchParams.set('order', fields.order);
    target.searchParams.set('amount', fields.amount);
    target.searchParams.set('status', fields.status);
    target.searchParams.set('sig', this.sign(fields));

    return { provider: this.name, providerRef: ref, redirectUrl: target.toString() };
  }

  async verifyCallback(request: Request): Promise<VerifiedPayment> {
    const params = await readParams(request);
    const ref = params.get('ref') ?? '';
    const order = params.get('order') ?? '';
    const amount = params.get('amount') ?? '';
    const status = params.get('status') ?? '';
    const sig = params.get('sig') ?? '';

    if (!ref || !order || !amount || !status || !sig) {
      throw new PaymentVerificationError('Missing mock payment parameters');
    }
    const expected = Buffer.from(this.sign({ ref, order, amount, status }), 'hex');
    const given = Buffer.from(sig, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new PaymentVerificationError('Invalid mock payment signature');
    }
    if (!isPaymentStatus(status)) throw new PaymentVerificationError(`Invalid status: ${status}`);

    return {
      provider: this.name,
      providerRef: ref,
      orderId: order,
      status,
      amountAgorot: Number(amount),
      raw: { ref, order, amount, status },
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    return {
      provider: this.name,
      providerRef: request.providerRef,
      status: 'refunded',
      raw: { mock: true, amountAgorot: request.amountAgorot ?? null, reason: request.reason ?? null },
    };
  }
}

function isPaymentStatus(value: string): value is PaymentStatus {
  return ['pending', 'succeeded', 'failed', 'cancelled', 'refunded'].includes(value);
}

/** Read params from the query string, a form POST or a JSON POST. */
async function readParams(request: Request): Promise<URLSearchParams> {
  const params = new URL(request.url).searchParams;
  if (request.method !== 'POST') return params;
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    for (const [k, v] of Object.entries(body)) if (v !== null && v !== undefined) params.set(k, String(v));
  } else if (type.includes('form')) {
    const form = await request.formData();
    form.forEach((v, k) => {
      if (typeof v === 'string') params.set(k, v);
    });
  }
  return params;
}
