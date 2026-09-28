'use server';

import { headers } from 'next/headers';
import { countRecentContactLeads, revealBusinessContact } from '@/lib/db/businesses';
import { getUser } from '@/lib/auth/session';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { submitLead } from '@/lib/leads/submit';
import { clientIpFromHeaders, hashIp } from '@/lib/leads/spam';
import { HONEYPOT_FIELD } from '@/lib/leads/constants';
import { validateLead } from '@/lib/leads/schemas';
import { isConstructionStage, isRegionSlug } from '@/lib/constants/community';
import { whatsappLink } from '@/lib/directory/format';

/**
 * Anti-scraping limits for the phone reveal, on top of submitLead's generic
 * per-IP limit (a few leads per 10 minutes). Per hashed IP, rolling 24h:
 * generous for a visitor comparing a few pros, tight enough that the ~160
 * numbers can't be harvested from one address.
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

type Mode = 'phone' | 'contact';

function field(formData: FormData, name: string, max = 200): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function handleLead(mode: Mode, formData: FormData): Promise<LeadFormState> {
  const businessId = field(formData, 'business_id', 64);
  const region = field(formData, 'region', 40);
  const stage = field(formData, 'construction_stage', 40);

  // The shared business_contact schema keeps region/stage optional (the phone
  // popup doesn't ask for them); the contact form and the terms box are
  // enforced here.
  const fieldErrors: Record<string, string> = {};
  if (mode === 'phone' && formData.get('terms') !== 'on') fieldErrors.terms = 'יש לאשר את התקנון';
  if (mode === 'contact') {
    if (!isRegionSlug(region)) fieldErrors.region = 'שדה חובה';
    if (!isConstructionStage(stage)) fieldErrors.construction_stage = 'שדה חובה';
  }

  const payload = {
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    region: region || undefined,
    construction_stage: stage || undefined,
    terms: formData.get('terms'),
  };
  if (Object.keys(fieldErrors).length > 0) {
    // Report every problem at once, and never insert a lead that failed our checks.
    const shared = validateLead('business_contact', payload);
    return {
      status: 'error',
      message: 'נא לתקן את השדות המסומנים',
      fieldErrors: { ...(shared.ok ? {} : shared.fieldErrors), ...fieldErrors },
    };
  }

  const ip = clientIpFromHeaders(headers());
  const ipHash = hashIp(ip);
  if (ipHash && isServiceRoleConfigured() && /^[0-9a-f-]{36}$/i.test(businessId)) {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const recent = await countRecentContactLeads(createAdminClient(), ipHash, businessId, since);
    if (recent.forBusiness >= MAX_PER_BUSINESS || recent.total >= MAX_TOTAL) {
      return {
        status: 'error',
        message: 'התקבלו מכם פניות רבות מדי ב-24 השעות האחרונות. נסו שוב מחר או צרו קשר עם צוות בונים בית.',
      };
    }
  }

  const user = await getUser();
  const result = await submitLead({
    type: 'business_contact',
    payload,
    context: { kind: mode === 'phone' ? 'phone_reveal' : 'contact_form' },
    sourceUrl: headers().get('referer'),
    businessId,
    memberId: user?.id ?? null,
    ip,
    spam: { honeypot: formData.get(HONEYPOT_FIELD) },
  });

  if (!result.ok) {
    return result.error === 'validation' && result.fieldErrors && !result.fieldErrors._form
      ? { status: 'error', message: result.message, fieldErrors: result.fieldErrors }
      : { status: 'error', message: result.fieldErrors?._form ?? result.message };
  }

  // Honeypot hit (lead === null) or contact form: nothing to reveal.
  if (mode === 'contact' || !result.lead) return { status: 'contact_sent' };

  const contact = await revealBusinessContact(createAdminClient(), businessId);
  return {
    status: 'revealed',
    phone: contact?.phone ?? null,
    otherPhones: contact?.otherPhones ?? [],
    whatsapp: whatsappLink(contact?.whatsapp ?? null, contact?.phone ?? null),
  };
}

/** "הצג טלפון" popup: record the lead via submitLead, and only then return the phone. */
export async function revealPhoneAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  try {
    return await handleLead('phone', formData);
  } catch (err) {
    console.error('revealPhoneAction failed', err);
    return { status: 'error', message: 'אירעה שגיאה. נסו שוב בעוד רגע.' };
  }
}

/** "יצירת קשר עם …" form: record the lead (notify routes it per lead_routing). */
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
