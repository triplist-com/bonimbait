'use server';

import { createLead } from '@/lib/db/leads';
import { getPublishedBusinessBySlug } from '@/lib/db/businesses';
import { getUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { absoluteUrl } from '@/lib/site';
import { businessPath, decodeSlug, isValidEmail, normalizeIsraeliPhone } from '@/lib/directory/format';

export type ClaimState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> };

function text(formData: FormData, name: string, max: number): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * "Claim this business": records a claim_business lead for the signed-in
 * user (leads_guard sets member_id = caller). An admin verifies it and
 * assigns owner_member_id + role 'pro' (Wave 3 admin).
 */
export async function claimBusinessAction(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const user = await getUser();
  if (!user) return { status: 'error', message: 'יש להתחבר כדי לבקש את ניהול העסק.' };

  const slug = decodeSlug(text(formData, 'slug', 300));
  const fullName = text(formData, 'full_name', 120);
  const phone = normalizeIsraeliPhone(text(formData, 'phone', 30));
  const email = text(formData, 'email', 254);
  const role = text(formData, 'role', 80);
  const message = text(formData, 'message', 2000);

  const fieldErrors: Record<string, string> = {};
  if (fullName.length < 2) fieldErrors.full_name = 'שדה חובה';
  if (!phone) fieldErrors.phone = 'נא להזין מספר טלפון תקין';
  if (!isValidEmail(email)) fieldErrors.email = 'אימייל שגוי';
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', message: 'נא לתקן את השדות המסומנים', fieldErrors };

  try {
    const db = createClient();
    const business = await getPublishedBusinessBySlug(db, slug);
    if (!business) return { status: 'error', message: 'העסק לא נמצא.' };
    if (business.owner_member_id) return { status: 'error', message: 'לעסק הזה כבר יש מנהל רשום.' };
    await createLead(db, {
      type: 'claim_business',
      businessId: business.id,
      fullName,
      phone,
      email,
      message: message || null,
      sourceUrl: absoluteUrl(businessPath(business.slug)),
      payload: { role_in_business: role || null, account_email: user.email ?? null },
    });
    return { status: 'sent' };
  } catch (err) {
    console.error('claimBusinessAction failed', err);
    return { status: 'error', message: 'אירעה שגיאה בשליחה. נסו שוב בעוד רגע.' };
  }
}
