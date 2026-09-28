'use server';

import { headers } from 'next/headers';
import { isBusinessSlugTaken, setBusinessRegions, setBusinessSpecialties, submitBusiness } from '@/lib/db/businesses';
import { getUser } from '@/lib/auth/session';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { REGIONS } from '@/lib/constants/community';
import { absoluteUrl } from '@/lib/site';
import { submitLead } from '@/lib/leads/submit';
import { validateLead } from '@/lib/leads/schemas';
import { clientIpFromHeaders } from '@/lib/leads/spam';
import { HONEYPOT_FIELD } from '@/lib/leads/constants';
import { textToHtml } from '@/lib/directory/html';

export type JoinState =
  | { status: 'idle' }
  | { status: 'sent'; draftCreated: boolean }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> };

function text(formData: FormData, name: string, max: number): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** URL slug from a business name; Hebrew is kept (stored decoded, like the WP slugs). */
function slugify(name: string): string {
  return (
    name
      .normalize('NFC')
      .toLowerCase()
      .replace(/[״"׳'`]/g, '')
      .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'business'
  );
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  if (!isServiceRoleConfigured()) return `${base}-${Date.now().toString(36)}`;
  const admin = createAdminClient();
  for (let i = 1; i < 50; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await isBusinessSlugTaken(admin, candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Professional registration ("הרשמה לבעלי מקצוע"). Always records a
 * join_pro lead through the shared submitLead() (validation, honeypot,
 * rate limit, notification). A signed-in user also gets a draft listing that
 * they own; businesses_guard forces it to status 'pending' so an admin
 * approves it, and the lead is linked to it.
 */
export async function joinProAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const businessName = text(formData, 'business_name', 120);
  const about = text(formData, 'about', 3000);
  const specialtyId = text(formData, 'specialty_id', 64);
  const regionSlugs = formData
    .getAll('regions')
    .filter((v): v is string => typeof v === 'string' && REGIONS.some((r) => r.slug === v));

  // Several work regions are allowed (the live CF7 form had one select); the
  // shared join_pro schema stores one, so the first goes in `region` and the
  // full list in the payload.
  const payload = {
    business_name: businessName,
    phone: formData.get('phone'),
    email: formData.get('email'),
    region: regionSlugs[0],
    message: about || undefined,
  };
  if (regionSlugs.length === 0) {
    const shared = validateLead('join_pro', payload);
    return {
      status: 'error',
      message: 'נא לתקן את השדות המסומנים',
      fieldErrors: { ...(shared.ok ? {} : shared.fieldErrors), regions: 'יש לבחור לפחות אזור אחד' },
    };
  }

  const user = await getUser();
  const result = await submitLead({
    type: 'join_pro',
    payload,
    context: { regions: regionSlugs.join(','), specialty_id: /^[0-9a-f-]{36}$/i.test(specialtyId) ? specialtyId : null },
    sourceUrl: absoluteUrl('/join-us/'),
    memberId: user?.id ?? null,
    ip: clientIpFromHeaders(headers()),
    spam: { honeypot: formData.get(HONEYPOT_FIELD) },
  });
  if (!result.ok) {
    const fieldErrors = result.fieldErrors ? { ...result.fieldErrors } : undefined;
    if (fieldErrors?.region) {
      fieldErrors.regions = fieldErrors.region;
      delete fieldErrors.region;
    }
    return { status: 'error', message: fieldErrors?._form ?? result.message, fieldErrors };
  }
  if (!result.lead || !user) return { status: 'sent', draftCreated: false };

  try {
    const db = createClient();
    const { data: regionRows } = await db.from('regions').select('id').in('slug', regionSlugs);
    let validSpecialtyId: string | null = null;
    if (/^[0-9a-f-]{36}$/i.test(specialtyId)) {
      const { data } = await db.from('specialties').select('id').eq('id', specialtyId).maybeSingle();
      validSpecialtyId = data?.id ?? null;
    }
    // Owned draft listing (RLS "member submit"; guard forces pending/owner).
    const business = await submitBusiness(db, {
      slug: await uniqueSlug(businessName),
      name: businessName,
      description_html: about ? textToHtml(about) : null,
      primary_specialty_id: validSpecialtyId,
    });
    await setBusinessRegions(db, business.id, (regionRows ?? []).map((r) => r.id));
    if (validSpecialtyId) await setBusinessSpecialties(db, business.id, [validSpecialtyId]);
    await db
      .from('business_contacts')
      .upsert({ business_id: business.id, phone: result.lead.phone, email: result.lead.email }, { onConflict: 'business_id' });
    if (isServiceRoleConfigured()) {
      await createAdminClient().from('leads').update({ business_id: business.id }).eq('id', result.lead.id);
    }
    return { status: 'sent', draftCreated: true };
  } catch (err) {
    // The lead is already recorded; the draft can be created by an admin.
    console.error('joinProAction: draft business failed', err);
    return { status: 'sent', draftCreated: false };
  }
}
