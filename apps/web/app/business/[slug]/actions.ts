'use server';

import { countRecentContactLeads, getBusinessForLead, insertTrustedLead } from '@/lib/db/businesses';
import { getUser } from '@/lib/auth/session';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { CONTACT_EMAIL, absoluteUrl } from '@/lib/site';
import { isConstructionStage, isRegionSlug } from '@/lib/constants/community';
import { businessPath, isValidEmail, normalizeIsraeliPhone, whatsappLink } from '@/lib/directory/format';
import { clientIpHash, refererUrl } from '@/lib/directory/server';

/**
 * Rate limits for the lead-gated phone reveal (per hashed IP, rolling 24h).
 * Generous for a real visitor comparing a few pros, tight enough that the
 * ~160 numbers can't be harvested from one address.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_BUSINESS = 3;
const MAX_TOTAL = 10;

export type LeadFormState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }
  | { status: 'contact_sent' }
  | {
      status: 'revealed';
      phone: string | null;
      otherPhones: string[];
      whatsapp: string | null;
    };

function field(formData: FormData, name: string, max = 200): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

type Mode = 'phone' | 'contact';

async function handleLead(mode: Mode, formData: FormData): Promise<LeadFormState> {
  // Honeypot: bots fill every field. Pretend success without revealing anything.
  if (field(formData, 'website_url')) return { status: 'contact_sent' };

  const businessId = field(formData, 'business_id', 64);
  const fullName = field(formData, 'full_name', 120);
  const email = field(formData, 'email', 254);
  const phone = normalizeIsraeliPhone(field(formData, 'phone', 30));
  const region = field(formData, 'region', 40);
  const stage = field(formData, 'stage', 40);

  const fieldErrors: Record<string, string> = {};
  if (fullName.length < 2) fieldErrors.full_name = 'שדה חובה';
  if (!isValidEmail(email)) fieldErrors.email = 'אימייל שגוי';
  if (!phone) fieldErrors.phone = 'נא להזין מספר טלפון תקין (מינימום 9–10 ספרות)';
  if (mode === 'phone' && formData.get('terms') !== 'on') fieldErrors.terms = 'יש לאשר את התקנון';
  if (mode === 'contact') {
    if (!isRegionSlug(region)) fieldErrors.region = 'שדה חובה';
    if (!isConstructionStage(stage)) fieldErrors.stage = 'שדה חובה';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'נא לתקן את השדות המסומנים', fieldErrors };
  }
  if (!/^[0-9a-f-]{36}$/i.test(businessId) || !isServiceRoleConfigured()) {
    return { status: 'error', message: 'לא ניתן לשלוח את הפנייה כרגע. נסו שוב מאוחר יותר.' };
  }

  const admin = createAdminClient();
  const found = await getBusinessForLead(admin, businessId);
  if (!found) return { status: 'error', message: 'בעל המקצוע לא נמצא.' };

  const ipHash = clientIpHash();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const recent = await countRecentContactLeads(admin, ipHash, businessId, since);
  if (recent.forBusiness >= MAX_PER_BUSINESS || recent.total >= MAX_TOTAL) {
    return {
      status: 'error',
      message: 'התקבלו מכם פניות רבות מדי ב-24 השעות האחרונות. נסו שוב מחר או צרו קשר עם צוות בונים בית.',
    };
  }

  const { business, contact } = found;
  const direct = business.lead_routing === 'direct' && !!contact?.lead_email;
  const user = await getUser();

  let regionId: string | null = null;
  if (isRegionSlug(region)) {
    const { data } = await admin.from('regions').select('id').eq('slug', region).maybeSingle();
    regionId = data?.id ?? null;
  }

  await insertTrustedLead(admin, {
    type: 'business_contact',
    full_name: fullName,
    email,
    phone,
    business_id: business.id,
    region_id: regionId,
    construction_stage: isConstructionStage(stage) ? stage : null,
    member_id: user?.id ?? null,
    // 'site' routing: the lead goes to the site inbox (info@); 'direct': to the business.
    forwarded_to: direct ? contact!.lead_email : CONTACT_EMAIL,
    source_url: refererUrl(absoluteUrl(businessPath(business.slug))),
    payload: {
      kind: mode === 'phone' ? 'phone_reveal' : 'contact_form',
      ip_hash: ipHash,
      lead_routing: business.lead_routing,
      terms_accepted: mode === 'phone',
    },
  });

  if (mode === 'contact') return { status: 'contact_sent' };

  const phoneNumber = contact?.phone ?? null;
  return {
    status: 'revealed',
    phone: phoneNumber,
    otherPhones: contact?.other_phones ?? [],
    whatsapp: whatsappLink(contact?.whatsapp ?? null, phoneNumber),
  };
}

/** "הצג טלפון" popup: record the lead, then return the phone (service role). */
export async function revealPhoneAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  try {
    return await handleLead('phone', formData);
  } catch (err) {
    console.error('revealPhoneAction failed', err);
    return { status: 'error', message: 'אירעה שגיאה. נסו שוב בעוד רגע.' };
  }
}

/** "יצירת קשר עם …" form: record the lead (routed per lead_routing). */
export async function contactBusinessAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  try {
    return await handleLead('contact', formData);
  } catch (err) {
    console.error('contactBusinessAction failed', err);
    return { status: 'error', message: 'אירעה שגיאה. נסו שוב בעוד רגע.' };
  }
}

/** Prefill for signed-in members (name/email/phone from their profile). */
export async function getLeadPrefill(): Promise<{ fullName: string; email: string; phone: string } | null> {
  const user = await getUser();
  if (!user) return null;
  const { data } = await createClient().from('profiles').select('full_name, email, phone').eq('id', user.id).maybeSingle();
  return { fullName: data?.full_name ?? '', email: data?.email ?? user.email ?? '', phone: data?.phone ?? '' };
}
