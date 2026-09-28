'use server';

import { headers } from 'next/headers';
import { getPublishedBusinessBySlug } from '@/lib/db/businesses';
import { getUser } from '@/lib/auth/session';
import { submitLead } from '@/lib/leads/submit';
import { clientIpFromHeaders } from '@/lib/leads/spam';
import { HONEYPOT_FIELD } from '@/lib/leads/constants';
import { absoluteUrl } from '@/lib/site';
import { businessPath, decodeSlug } from '@/lib/directory/format';
import { createPublicClient } from '@/lib/directory/server';

export type ClaimState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> };

/** Form value, or undefined when absent (the shared zod schemas reject null). */
const val = (formData: FormData, name: string) => formData.get(name) ?? undefined;

/**
 * "Claim this business": records a claim_business lead for the signed-in
 * member through the shared submitLead(). An admin verifies it and assigns
 * owner_member_id + role 'pro' (Wave 3 admin).
 */
export async function claimBusinessAction(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const user = await getUser();
  if (!user) return { status: 'error', message: 'יש להתחבר כדי לבקש את ניהול העסק.' };

  const slug = decodeSlug(String(formData.get('slug') ?? '').slice(0, 300));
  const business = await getPublishedBusinessBySlug(createPublicClient(), slug);
  if (!business) return { status: 'error', message: 'העסק לא נמצא.' };
  if (business.owner_member_id) return { status: 'error', message: 'לעסק הזה כבר יש מנהל רשום.' };

  const result = await submitLead({
    type: 'claim_business',
    payload: {
      full_name: val(formData, 'full_name'),
      phone: val(formData, 'phone'),
      email: val(formData, 'email'),
      role_in_business: val(formData, 'role'),
      message: val(formData, 'message'),
    },
    context: { account_email: user.email ?? null },
    businessId: business.id,
    memberId: user.id,
    sourceUrl: absoluteUrl(businessPath(business.slug)),
    ip: clientIpFromHeaders(headers()),
    spam: { honeypot: formData.get(HONEYPOT_FIELD) },
  });
  if (!result.ok) {
    return { status: 'error', message: result.fieldErrors?._form ?? result.message, fieldErrors: result.fieldErrors };
  }
  return { status: 'sent' };
}
