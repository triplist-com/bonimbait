/**
 * Pure state machine for applying a verified provider result to a payment and
 * its order. Used by lib/db/commerce.applyPaymentResult; kept pure so webhook
 * idempotency can be unit tested without a database.
 *
 * Rules:
 *  - Replaying the same result is a no-op (no writes).
 *  - A succeeded payment never goes back to failed/cancelled/pending (late or
 *    out-of-order callbacks can't un-pay an order). Only a refund moves it on.
 *  - A succeeded result must carry the amount we asked for.
 *  - The order becomes paid when any payment succeeds, failed when its
 *    pending attempt fails, refunded when a paid order's payment is refunded.
 */
import type { OrderStatus, PaymentStatus } from '@/lib/db/types';

export type PaymentSnapshot = { status: PaymentStatus; amountAgorot: number };
export type OrderSnapshot = { status: OrderStatus };
export type IncomingResult = { status: PaymentStatus; amountAgorot?: number | null };

export type Transition = {
  /** New payment status to write, or null when unchanged. */
  payment: PaymentStatus | null;
  /** New order status to write, or null when unchanged. */
  order: OrderStatus | null;
};

export class PaymentAmountMismatchError extends Error {
  constructor(expected: number, got: number) {
    super(`Payment amount mismatch: expected ${expected}, got ${got}`);
    this.name = 'PaymentAmountMismatchError';
  }
}

/** Allowed payment status moves. Same-status is handled as a no-op before this. */
const PAYMENT_MOVES: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['succeeded', 'failed', 'cancelled'],
  failed: ['succeeded'], // a late success after a timeout/failure still counts
  cancelled: ['succeeded'],
  succeeded: ['refunded'],
  refunded: [],
};

export function decidePaymentTransition(
  payment: PaymentSnapshot,
  order: OrderSnapshot,
  incoming: IncomingResult,
): Transition {
  if (
    incoming.status === 'succeeded' &&
    incoming.amountAgorot !== null &&
    incoming.amountAgorot !== undefined &&
    incoming.amountAgorot !== payment.amountAgorot
  ) {
    throw new PaymentAmountMismatchError(payment.amountAgorot, incoming.amountAgorot);
  }

  const paymentChanges =
    incoming.status !== payment.status && PAYMENT_MOVES[payment.status].includes(incoming.status);
  const effective: PaymentStatus = paymentChanges ? incoming.status : payment.status;

  let nextOrder: OrderStatus | null = null;
  if (effective === 'succeeded' && (order.status === 'pending' || order.status === 'failed')) nextOrder = 'paid';
  else if ((effective === 'failed' || effective === 'cancelled') && order.status === 'pending') nextOrder = 'failed';
  else if (effective === 'refunded' && order.status === 'paid') nextOrder = 'refunded';

  return { payment: paymentChanges ? incoming.status : null, order: nextOrder };
}
