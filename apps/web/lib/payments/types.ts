import type { Json, PaymentProviderName, PaymentStatus } from '@/lib/db/types';

export type { PaymentProviderName, PaymentStatus };

/** What the checkout route hands to a provider. Amounts are integer agorot. */
export type CheckoutRequest = {
  orderId: string;
  orderNumber: number;
  amountAgorot: number;
  currency: 'ILS';
  description: string;
  customer: { name: string; email: string; phone?: string | null };
  /** Absolute URL the buyer returns to after paying. */
  successUrl: string;
  /** Absolute URL the buyer returns to after cancelling / failing. */
  cancelUrl: string;
  /** Absolute URL for server-to-server notifications (IPN / webhook). */
  notifyUrl: string;
};

export type CheckoutSession = {
  provider: PaymentProviderName;
  /** Provider transaction/session id — stored in payments.provider_ref. */
  providerRef: string;
  /** Where to send the buyer's browser. */
  redirectUrl: string;
};

/** A provider callback/webhook after signature verification. */
export type VerifiedPayment = {
  provider: PaymentProviderName;
  providerRef: string;
  orderId: string | null;
  status: PaymentStatus;
  amountAgorot: number | null;
  raw: Json;
};

export type RefundRequest = {
  providerRef: string;
  /** Partial refund amount; omit for a full refund. */
  amountAgorot?: number;
  reason?: string;
};

export type RefundResult = {
  provider: PaymentProviderName;
  providerRef: string;
  status: 'refunded' | 'failed';
  raw: Json;
};

/**
 * Payment gateway abstraction. Checkout flow:
 *  1. route creates a pending order (lib/db/commerce.createPendingOrder)
 *  2. provider.createCheckout() -> store payments row with providerRef
 *  3. redirect buyer to session.redirectUrl
 *  4. buyer returns / provider notifies -> provider.verifyCallback(request)
 *  5. lib/db/commerce.applyPaymentResult() updates payment + order
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Verify an incoming return-URL request or webhook. MUST authenticate it
   * (signature / server-side lookup) and throw PaymentVerificationError if not.
   */
  verifyCallback(request: Request): Promise<VerifiedPayment>;
  refund(request: RefundRequest): Promise<RefundResult>;
}

export class PaymentVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentVerificationError';
  }
}

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentConfigurationError';
  }
}
