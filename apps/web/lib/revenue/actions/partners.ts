'use server';

/**
 * Partner tiers and subscriptions in the admin. Tier prices and benefits are
 * admin-only; subscriptions (manual sales, status changes) are for editors and
 * up. Writes run with the staff member's session (RLS staff full access).
 */
import { revalidatePath } from 'next/cache';
import { ActionError, adminAction } from '@/lib/admin/guard';
import { bool, str } from '@/lib/admin/form';
import { asRevenueDb } from '../db';
import { LIVE_SUBSCRIPTION_STATUSES } from '../partner-tiers';
import { addMonth } from '../subscriptions';
import type { PartnerSubscriptionStatus } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidatePartners() {
  revalidatePath('/admin/partners/', 'layout');
  revalidatePath('/recommended/');
  revalidatePath('/partner-portal/');
}

export const saveTier = adminAction('admin', async ({ db }, fd: FormData) => {
  const id = str(fd, 'id', 64);
  if (!UUID_RE.test(id)) throw new ActionError('המסלול לא נמצא');
  const errors: Record<string, string> = {};
  const name = str(fd, 'name', 60);
  const badge = str(fd, 'badge_label', 60);
  const price = Number(str(fd, 'price_nis', 12).replace(/[,\s₪]/g, ''));
  const targetRaw = str(fd, 'monthly_impression_target', 12).replace(/[,\s]/g, '');
  const target = targetRaw === '' ? null : Number(targetRaw);
  const benefits = str(fd, 'benefits', 3000)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!name || name.length > 40) errors.name = 'שם המסלול: עד 40 תווים';
  if (!badge || badge.length > 40) errors.badge_label = 'התווית: עד 40 תווים';
  if (!Number.isInteger(price) || price < 0 || price > 1_000_000) errors.price_nis = 'מחיר בשקלים שלמים, עד 1,000,000';
  if (target !== null && (!Number.isInteger(target) || target < 0 || target > 10_000_000)) errors.monthly_impression_target = 'מספר חשיפות שלם';
  if (benefits.length > 12 || benefits.some((b) => b.length > 140)) errors.benefits = 'עד 12 שורות, כל אחת עד 140 תווים';
  if (Object.keys(errors).length) throw new ActionError('נא לתקן את השדות המסומנים', errors);

  const res = await asRevenueDb(db)
    .from('partner_tiers')
    .update({
      name,
      badge_label: badge,
      price_agorot: price * 100,
      monthly_impression_target: target,
      benefits,
      is_active: bool(fd, 'is_active'),
    })
    .eq('id', id);
  if (res.error) throw new Error(res.error.message);
  revalidatePartners();
  return { ok: true, message: 'המסלול נשמר.' };
});

/** End every other live subscription of the business (one live subscription per business). */
async function endOtherLive(db: ReturnType<typeof asRevenueDb>, businessId: string, keepId: string | null, now: Date) {
  let q = db
    .from('partner_subscriptions')
    .update({ status: 'cancelled', cancelled_at: now.toISOString() })
    .eq('business_id', businessId)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES]);
  if (keepId) q = q.neq('id', keepId);
  const res = await q;
  if (res.error) throw new Error(res.error.message);
}

export const createSubscription = adminAction('editor', async ({ db, profile }, fd: FormData) => {
  const businessId = str(fd, 'business_id', 64);
  const tierId = str(fd, 'tier_id', 64);
  const status = str(fd, 'status', 20) === 'pending' ? 'pending' : 'active';
  const note = str(fd, 'note', 500) || null;
  const errors: Record<string, string> = {};
  if (!UUID_RE.test(businessId)) errors.business_id = 'יש לבחור עסק';
  if (!UUID_RE.test(tierId)) errors.tier_id = 'יש לבחור מסלול';
  if (Object.keys(errors).length) throw new ActionError('נא לתקן את השדות המסומנים', errors);

  const rdb = asRevenueDb(db);
  const { data: tier } = await rdb.from('partner_tiers').select('id, price_agorot').eq('id', tierId).maybeSingle();
  if (!tier) throw new ActionError('המסלול לא נמצא');
  const now = new Date();
  if (status === 'active') await endOtherLive(rdb, businessId, null, now);
  const res = await rdb.from('partner_subscriptions').insert({
    business_id: businessId,
    tier_id: tierId,
    status,
    price_agorot: tier.price_agorot,
    provider: 'manual',
    started_at: status === 'active' ? now.toISOString() : null,
    current_period_end: status === 'active' ? addMonth(now).toISOString() : null,
    created_by: profile.id,
    note,
  });
  if (res.error) throw new Error(res.error.message);
  revalidatePartners();
  return { ok: true, message: status === 'active' ? 'המנוי הופעל.' : 'המנוי נוצר וממתין לתשלום.' };
});

const SETTABLE: readonly PartnerSubscriptionStatus[] = ['active', 'past_due', 'cancelled'];

export const setSubscriptionStatus = adminAction('editor', async ({ db }, id: string, status: PartnerSubscriptionStatus) => {
  if (!UUID_RE.test(id) || !SETTABLE.includes(status)) throw new ActionError('פעולה לא חוקית');
  const rdb = asRevenueDb(db);
  const { data: sub } = await rdb.from('partner_subscriptions').select('id, business_id, status, started_at, current_period_end').eq('id', id).maybeSingle();
  if (!sub) throw new ActionError('המנוי לא נמצא');
  const now = new Date();
  if (status === 'active') await endOtherLive(rdb, sub.business_id, sub.id, now);
  const res = await rdb
    .from('partner_subscriptions')
    .update({
      status,
      ...(status === 'active'
        ? { started_at: sub.started_at ?? now.toISOString(), current_period_end: sub.current_period_end ?? addMonth(now).toISOString(), cancelled_at: null }
        : {}),
      ...(status === 'cancelled' ? { cancelled_at: now.toISOString() } : {}),
    })
    .eq('id', id);
  if (res.error) throw new Error(res.error.message);
  revalidatePartners();
  return { ok: true, message: 'הסטטוס עודכן.' };
});
