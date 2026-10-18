import 'server-only';

/**
 * Buying a partner tier from the portal, through the existing PaymentProvider
 * (lib/payments: mock until UPay is configured).
 *
 *   startTierCheckout()     owner only: a pending subscription at the tier's
 *                           current price, then the provider's checkout URL
 *   completeTierCheckout()  the provider's return/webhook: verify, then
 *                           activate (lib/revenue/subscriptions.ts decides)
 *
 * Subscriptions are written with the service role (RLS lets owners only read
 * them); ownership is checked with the owner's own session first.
 */
import { absoluteUrl } from '@/lib/site';
import {
  PaymentConfigurationError,
  PaymentVerificationError,
  getPaymentProvider,
  getPaymentProviderForCallback,
  onlinePaymentsEnabled,
} from '@/lib/payments';
import { revenueAdminDb, revenueUserDb, isServiceRoleConfigured } from './db';
import { checkoutOrderNumber, decideTierPayment } from './subscriptions';
import { LIVE_SUBSCRIPTION_STATUSES } from './partner-tiers';

export type StartCheckoutResult = { ok: true; redirectUrl: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startTierCheckout(input: {
  businessId: string;
  tierSlug: string;
  userId: string;
  customer: { name: string; email: string };
}): Promise<StartCheckoutResult> {
  if (!UUID_RE.test(input.businessId) || !isServiceRoleConfigured()) return { ok: false, error: 'לא ניתן להתחיל תשלום כרגע.' };
  // No online payments here (e.g. the mock provider on production): never
  // leave a pending subscription behind for a checkout that can't happen.
  if (!onlinePaymentsEnabled()) return { ok: false, error: 'התשלום אונליין סגור כרגע.' };
  // Ownership through the owner's session (RLS): only their own business comes back.
  const own = await revenueUserDb()
    .from('businesses')
    .select('id, name, status, owner_member_id')
    .eq('id', input.businessId)
    .eq('owner_member_id', input.userId)
    .maybeSingle();
  if (!own.data) return { ok: false, error: 'אין לך הרשאה לנהל את העסק הזה.' };
  if (own.data.status === 'suspended') return { ok: false, error: 'העסק מושהה. צרו קשר עם צוות בונים בית.' };

  const admin = revenueAdminDb();
  const { data: tier } = await admin
    .from('partner_tiers')
    .select('id, slug, name, price_agorot, is_active')
    .eq('slug', input.tierSlug)
    .eq('is_active', true)
    .maybeSingle();
  if (!tier) return { ok: false, error: 'המסלול לא נמצא.' };

  const live = await admin
    .from('partner_subscriptions')
    .select('id, tier_id')
    .eq('business_id', input.businessId)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES])
    .maybeSingle();
  if (live.data?.tier_id === tier.id) return { ok: false, error: 'העסק כבר במסלול הזה.' };

  const created = await admin
    .from('partner_subscriptions')
    .insert({ business_id: input.businessId, tier_id: tier.id, status: 'pending', price_agorot: tier.price_agorot, created_by: input.userId })
    .select('id')
    .single();
  if (created.error || !created.data) throw new Error(created.error?.message ?? 'subscription insert failed');
  const subId = created.data.id;

  const provider = getPaymentProvider();
  const returnUrl = absoluteUrl('/api/partner-checkout/return/');
  const session = await provider.createCheckout({
    orderId: subId,
    orderNumber: checkoutOrderNumber(subId),
    amountAgorot: tier.price_agorot,
    currency: 'ILS',
    description: `בונים בית: מסלול ${tier.name} (חודשי)`,
    customer: { name: input.customer.name || own.data.name, email: input.customer.email },
    successUrl: returnUrl,
    cancelUrl: returnUrl,
    notifyUrl: returnUrl,
  });
  const upd = await admin.from('partner_subscriptions').update({ provider: session.provider, provider_ref: session.providerRef }).eq('id', subId);
  if (upd.error) throw new Error(upd.error.message);
  return { ok: true, redirectUrl: session.redirectUrl };
}

export type CompleteCheckoutResult =
  | { kind: 'activated'; businessId: string; tierId: string }
  | { kind: 'not_paid'; businessId: string }
  | { kind: 'rejected'; status: 400 | 404 | 409 | 503; reason: string };

export async function completeTierCheckout(request: Request): Promise<CompleteCheckoutResult> {
  try {
    const named = new URL(request.url).searchParams.get('provider');
    const provider = named ? getPaymentProviderForCallback(named) : getPaymentProvider();
    const verified = await provider.verifyCallback(request);
    if (!verified.orderId || !UUID_RE.test(verified.orderId)) return { kind: 'rejected', status: 404, reason: 'unknown subscription' };

    const admin = revenueAdminDb();
    const { data: sub } = await admin
      .from('partner_subscriptions')
      .select('id, business_id, tier_id, status, provider_ref, price_agorot')
      .eq('id', verified.orderId)
      .maybeSingle();
    if (!sub) return { kind: 'rejected', status: 404, reason: 'unknown subscription' };

    const now = new Date();
    const decision = decideTierPayment(sub, { providerRef: verified.providerRef, status: verified.status, amountAgorot: verified.amountAgorot }, now);
    if (decision.kind === 'already_active') return { kind: 'activated', businessId: sub.business_id, tierId: sub.tier_id };
    if (decision.kind === 'not_paid') return { kind: 'not_paid', businessId: sub.business_id };
    if (decision.kind === 'reject') return { kind: 'rejected', status: decision.reason === 'amount_mismatch' ? 409 : 400, reason: decision.reason };

    // Upgrade or switch: end any other live subscription first (one live per business).
    const ended = await admin
      .from('partner_subscriptions')
      .update({ status: 'cancelled', cancelled_at: now.toISOString() })
      .eq('business_id', sub.business_id)
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES])
      .neq('id', sub.id);
    if (ended.error) throw new Error(ended.error.message);
    const act = await admin.from('partner_subscriptions').update(decision.patch).eq('id', sub.id).eq('status', 'pending');
    if (act.error) throw new Error(act.error.message);
    return { kind: 'activated', businessId: sub.business_id, tierId: sub.tier_id };
  } catch (err) {
    if (err instanceof PaymentVerificationError) return { kind: 'rejected', status: 400, reason: err.message };
    if (err instanceof PaymentConfigurationError) return { kind: 'rejected', status: 503, reason: err.message };
    throw err;
  }
}
