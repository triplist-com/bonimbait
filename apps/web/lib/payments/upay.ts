import 'server-only';

import {
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type RefundRequest,
  type RefundResult,
  type VerifiedPayment,
  PaymentConfigurationError,
} from './types';

/**
 * UPay (upay.co.il) — the gateway the live WooCommerce checkout uses
 * (`payment_method_upay`). STUB until the site owner provides merchant
 * credentials and the terminal/API documentation.
 *
 * Expected env (names are provisional; confirm with UPay docs):
 *   UPAY_API_URL        base URL of the UPay API (sandbox vs production)
 *   UPAY_MERCHANT_ID    merchant / terminal identifier
 *   UPAY_API_KEY        API key or password for server calls
 *   UPAY_WEBHOOK_SECRET shared secret (if UPay signs IPN callbacks)
 *
 * What we need from UPay before implementing (Wave 2 checklist):
 *  1. Credentials: sandbox + production merchant/terminal id, API user/key,
 *     and whether calls are authenticated by key, username+password or HMAC.
 *  2. "Create payment page" endpoint: URL, method, request format (JSON / form),
 *     and the exact field names for amount (ILS or agorot? decimals?),
 *     currency, our order reference (we send orders.id + order_number),
 *     description, customer name/email/phone, language (he), max
 *     installments, and success / cancel(failure) / IPN(notify) URLs.
 *     Response: the hosted page URL and UPay's transaction/session id
 *     (stored as payments.provider_ref).
 *  3. Return-URL contract: which params UPay appends to success/cancel URLs
 *     (transaction id, status code, amount, our reference, signature?) and
 *     whether it is a GET redirect or an auto-submitted POST form.
 *  4. IPN/webhook contract: payload format, retry policy and timeouts,
 *     expected response (200 + body?), and HOW TO AUTHENTICATE it:
 *     signature algorithm + which fields/order are signed + where the
 *     signature is sent (header vs field) — or, if unsigned, a "get
 *     transaction status by id" endpoint we can call server-side instead.
 *  5. Status codes: the full list of transaction statuses / error codes and
 *     their meaning (approved, declined, cancelled by user, pending/3DS,
 *     refunded, chargeback) so we can map them to PaymentStatus.
 *  6. Refunds: full / partial refund endpoint and fields.
 *  7. Invoices/receipts: does UPay issue the tax invoice (חשבונית מס/קבלה)
 *     itself, or must we integrate an invoicing service? VAT fields needed?
 *  8. Allowed IPs / domains to whitelist for callbacks, and test cards.
 */
export class UpayProvider implements PaymentProvider {
  readonly name = 'upay' as const;

  private readonly apiUrl = process.env.UPAY_API_URL ?? '';
  private readonly merchantId = process.env.UPAY_MERCHANT_ID ?? '';
  private readonly apiKey = process.env.UPAY_API_KEY ?? '';

  private assertConfigured(): void {
    if (!this.apiUrl || !this.merchantId || !this.apiKey) {
      throw new PaymentConfigurationError(
        'UPay is not configured (UPAY_API_URL, UPAY_MERCHANT_ID, UPAY_API_KEY). Use PAYMENT_PROVIDER=mock.',
      );
    }
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    this.assertConfigured();
    // TODO(upay): create a payment/transaction via the UPay API:
    //   - amount in ILS (request.amountAgorot / 100), currency ILS
    //   - our reference = request.orderId (and orderNumber for the invoice)
    //   - customer name/email/phone, description
    //   - success / cancel / IPN URLs (request.successUrl, cancelUrl, notifyUrl)
    //   - Hebrew payment page, installments policy (confirm with owner)
    // Return UPay's transaction id as providerRef and its hosted page URL.
    void request;
    throw new PaymentConfigurationError('UpayProvider.createCheckout is not implemented yet');
  }

  async verifyCallback(request: Request): Promise<VerifiedPayment> {
    this.assertConfigured();
    // TODO(upay): parse the IPN / return-URL payload (form POST or query),
    // authenticate it (signature with UPAY_WEBHOOK_SECRET, or re-query the
    // transaction status from the UPay API by id — preferred), and map UPay
    // status codes to PaymentStatus. Never trust amount/status from the
    // browser without server-side verification.
    void request;
    throw new PaymentConfigurationError('UpayProvider.verifyCallback is not implemented yet');
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    this.assertConfigured();
    // TODO(upay): call the UPay refund/cancel endpoint for request.providerRef
    // (full or partial by amountAgorot) and map the response.
    void request;
    throw new PaymentConfigurationError('UpayProvider.refund is not implemented yet');
  }
}
