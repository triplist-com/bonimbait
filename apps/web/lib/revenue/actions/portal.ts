'use server';

/**
 * Portal actions for business owners (role pro). Ownership is enforced twice:
 * here, and by RLS (deals: "owner insert" only for the owner's business and
 * leads that reached it).
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { startTierCheckout } from '../checkout';
import { revenueUserDb } from '../db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(fd: FormData, name: string, max = 200): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** "שדרגו": start the tier checkout and send the owner to the payment page. */
export async function upgradeTierAction(fd: FormData): Promise<void> {
  const businessId = field(fd, 'business_id', 64);
  const profile = await getProfile();
  if (!profile) redirect('/login/?next=%2Fpartner-portal%2F');
  let target = `/partner-portal/?b=${encodeURIComponent(businessId)}&checkout=failed`;
  if (hasRole(profile.role, 'pro') && UUID_RE.test(businessId)) {
    try {
      const res = await startTierCheckout({
        businessId,
        tierSlug: field(fd, 'tier', 40),
        userId: profile.id,
        customer: { name: profile.full_name ?? '', email: profile.email ?? '' },
      });
      if (res.ok) target = res.redirectUrl;
      else console.error(`[revenue] tier checkout refused: ${res.error}`);
    } catch (err) {
      console.error(`[revenue] tier checkout failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  redirect(target); // outside try: NEXT_REDIRECT must propagate
}

export type DealResult = { ok: boolean; message: string };

/** "סגרנו עסקה": the partner reports a deal, optionally for one of its leads. */
export async function reportDealAction(fd: FormData): Promise<DealResult> {
  const profile = await getProfile();
  if (!profile || !hasRole(profile.role, 'pro')) return { ok: false, message: 'יש להתחבר כבעל העסק.' };
  const businessId = field(fd, 'business_id', 64);
  const leadId = field(fd, 'lead_id', 64);
  if (!UUID_RE.test(businessId) || (leadId && !UUID_RE.test(leadId))) return { ok: false, message: 'הפרטים אינם תקינים.' };
  const rawValue = field(fd, 'value_nis', 14).replace(/[,\s₪]/g, '');
  const value = rawValue === '' ? null : Number(rawValue);
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1_000_000_000)) return { ok: false, message: 'סכום העסקה בשקלים שלמים.' };
  const note = field(fd, 'note', 500) || null;

  const { error } = await revenueUserDb()
    .from('partner_deals')
    .insert({ business_id: businessId, lead_id: leadId || null, value_agorot: value === null ? null : value * 100, note });
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return { ok: false, message: 'כבר סימנתם עסקה על הפנייה הזו.' };
    if (/row-level security|permission/i.test(error.message)) return { ok: false, message: 'אין לך הרשאה לסמן עסקה על הפנייה הזו.' };
    console.error(`[revenue] deal report failed: ${error.message}`);
    return { ok: false, message: 'השמירה נכשלה. נסו שוב.' };
  }
  revalidatePath('/partner-portal/');
  revalidatePath('/partner-portal/report/');
  return { ok: true, message: 'העסקה נרשמה. תודה!' };
}
