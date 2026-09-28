import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { applyPaymentResult } from '@/lib/db/commerce';
import type { OrderRow } from '@/lib/db/types';
import {
  PaymentConfigurationError,
  PaymentVerificationError,
  getPaymentProvider,
  getPaymentProviderForCallback,
} from '@/lib/payments';
import { PaymentAmountMismatchError } from './payment-transitions';

export type CallbackOutcome =
  | { kind: 'applied'; order: OrderRow; changed: boolean }
  | { kind: 'rejected'; status: 400 | 404 | 409 | 503; reason: string };

/**
 * Verify a provider callback (browser return or server webhook) and apply it
 * idempotently. The provider is the active one; a `provider` query param
 * naming another provider is rejected (mock callbacks are refused once UPay
 * is live).
 */
export async function handlePaymentCallback(request: Request): Promise<CallbackOutcome> {
  try {
    const named = new URL(request.url).searchParams.get('provider');
    const provider = named ? getPaymentProviderForCallback(named) : getPaymentProvider();
    const verified = await provider.verifyCallback(request);
    const result = await applyPaymentResult(createAdminClient(), {
      provider: verified.provider,
      providerRef: verified.providerRef,
      status: verified.status,
      amountAgorot: verified.amountAgorot,
      raw: verified.raw,
      errorMessage: verified.status === 'failed' ? 'Payment declined by provider' : null,
    });
    if (verified.orderId && verified.orderId !== result.order.id) {
      console.error('[payments] callback order mismatch', verified.orderId, result.order.id);
    }
    return { kind: 'applied', order: result.order, changed: result.changed };
  } catch (err) {
    if (err instanceof PaymentVerificationError) return { kind: 'rejected', status: 400, reason: err.message };
    if (err instanceof PaymentConfigurationError) return { kind: 'rejected', status: 503, reason: err.message };
    if (err instanceof PaymentAmountMismatchError) {
      console.error('[payments] amount mismatch', err.message);
      return { kind: 'rejected', status: 409, reason: err.message };
    }
    if (err instanceof Error && err.message.startsWith('Unknown payment')) {
      return { kind: 'rejected', status: 404, reason: err.message };
    }
    throw err;
  }
}
