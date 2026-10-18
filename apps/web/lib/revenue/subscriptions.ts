/**
 * Partner subscription transitions (pure, unit-tested). A tier purchase goes
 * through the existing PaymentProvider (mock until UPay):
 *
 *   pending  --paid, right amount-->  active (any other live subscription of
 *                                      the business is cancelled: upgrade or switch)
 *   pending  --failed / cancelled-->   stays pending (the partner can retry)
 *   active   --same payment again-->   no change (callbacks are idempotent)
 *
 * Periods are monthly; a renewal (UPay recurring, later) extends from the
 * current period end.
 */
import type { PaymentStatus } from '@/lib/payments/types';
import type { PartnerSubscriptionRow, PartnerSubscriptionStatus } from './types';

export const SUBSCRIPTION_STATUS_LABELS: Record<PartnerSubscriptionStatus, string> = {
  pending: 'ממתין לתשלום',
  active: 'פעיל',
  past_due: 'בפיגור תשלום',
  cancelled: 'בוטל',
};

/** Same day next month (clamped to the month's last day), UTC. */
export function addMonth(from: Date): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(from.getUTCDate(), lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}

export type VerifiedTierPayment = {
  providerRef: string;
  status: PaymentStatus;
  amountAgorot: number | null;
};

export type TierPaymentDecision =
  | { kind: 'activate'; patch: Pick<PartnerSubscriptionRow, 'status' | 'started_at' | 'current_period_end' | 'last_payment_at' | 'cancelled_at'> }
  | { kind: 'already_active' }
  | { kind: 'not_paid' }
  | { kind: 'reject'; reason: 'ref_mismatch' | 'amount_mismatch' | 'cancelled' };

export function decideTierPayment(
  sub: Pick<PartnerSubscriptionRow, 'status' | 'provider_ref' | 'price_agorot'>,
  payment: VerifiedTierPayment,
  now: Date = new Date(),
): TierPaymentDecision {
  if (!sub.provider_ref || sub.provider_ref !== payment.providerRef) return { kind: 'reject', reason: 'ref_mismatch' };
  if (sub.status === 'active' || sub.status === 'past_due') return { kind: 'already_active' };
  if (sub.status === 'cancelled') return { kind: 'reject', reason: 'cancelled' };
  if (payment.status !== 'succeeded') return { kind: 'not_paid' };
  if (payment.amountAgorot !== sub.price_agorot) return { kind: 'reject', reason: 'amount_mismatch' };
  return {
    kind: 'activate',
    patch: {
      status: 'active',
      started_at: now.toISOString(),
      current_period_end: addMonth(now).toISOString(),
      last_payment_at: now.toISOString(),
      cancelled_at: null,
    },
  };
}

/** A small positive order number for the provider (the subscription id is the real key). */
export function checkoutOrderNumber(subscriptionId: string): number {
  let h = 0;
  for (const ch of subscriptionId.replace(/-/g, '')) h = (h * 31 + ch.charCodeAt(0)) % 900_000_000;
  return 100_000_000 + h;
}
