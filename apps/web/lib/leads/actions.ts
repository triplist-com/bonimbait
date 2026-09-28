'use server';

/**
 * Server Actions for lead forms (used by components/leads/LeadForm.tsx).
 *
 * `submitLeadAction` is generic: the form carries its lead type and options in
 * hidden fields (all validated server-side, so tampering only changes which
 * schema applies):
 *   _type             LeadType (required)
 *   _source           page path the form was submitted from
 *   _success          internal path to redirect to on success (optional)
 *   _business_id / _product_id / _service_plan_id   uuid links (optional)
 *   _ctx_<key>        small context values stored in payload (e.g. _ctx_product_name)
 *   _utm              JSON of utm_* / gclid / fbclid captured client-side
 *   company_website   honeypot; cf-turnstile-response: Turnstile token
 *
 * For `whatsapp_join` it also reveals the chosen group's invite link, read
 * server-side (the links are never sent to the browser before submission).
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { revealWhatsappInvite } from '@/lib/db/members';
import { getUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { submitLead } from './submit';
import { isLeadType } from './schemas';
import { clientIpFromHeaders } from './spam';
import { HONEYPOT_FIELD, TURNSTILE_FIELD } from './constants';
import type { LeadFormState } from './types';

/** Only same-site paths ("/x/", not "//evil" or "https://..."). */
function safeInternalPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value.slice(0, 500);
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === 'string' && v !== '' ? v : null;
}

function parseUtm(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export async function submitLeadAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const type = formData.get('_type');
  if (!isLeadType(type)) return { status: 'error', message: 'סוג טופס לא מוכר', submittedAt: Date.now() };

  const payload: Record<string, unknown> = {};
  const context: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value !== 'string') return;
    if (key.startsWith('_ctx_')) context[key.slice(5, 45)] = value.slice(0, 300);
    else if (!key.startsWith('_') && key !== HONEYPOT_FIELD && key !== TURNSTILE_FIELD) payload[key] = value;
  });

  let memberId: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      memberId = (await getUser())?.id ?? null;
    } catch {
      memberId = null;
    }
  }

  const result = await submitLead({
    type,
    payload,
    context,
    sourceUrl: str(formData, '_source'),
    businessId: str(formData, '_business_id'),
    productId: str(formData, '_product_id'),
    servicePlanId: str(formData, '_service_plan_id'),
    utm: parseUtm(str(formData, '_utm')),
    memberId,
    ip: clientIpFromHeaders(headers()),
    spam: { honeypot: formData.get(HONEYPOT_FIELD), turnstileToken: formData.get(TURNSTILE_FIELD) },
  });

  if (!result.ok) {
    return {
      status: 'error',
      message: result.message,
      fieldErrors: result.fieldErrors,
      submittedAt: Date.now(),
    };
  }

  let invite: LeadFormState['invite'];
  if (type === 'whatsapp_join' && result.lead?.whatsapp_group_id) {
    try {
      const found = await revealWhatsappInvite(createAdminClient(), { groupId: result.lead.whatsapp_group_id });
      if (found) invite = { name: found.name, url: found.inviteUrl };
    } catch (e) {
      console.error('[leads] invite reveal failed', e);
    }
  } else if (type === 'whatsapp_join' && result.lead === null) {
    // Honeypot hit: behave like success without revealing anything.
    return { status: 'success', submittedAt: Date.now() };
  }

  const success = safeInternalPath(formData.get('_success'));
  if (success) redirect(success); // throws NEXT_REDIRECT; must stay outside try/catch

  return { status: 'success', invite, submittedAt: Date.now() };
}
