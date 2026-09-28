'use server';

import { createLead } from '@/lib/db/leads';
import { isBusinessSlugTaken, setBusinessRegions, setBusinessSpecialties, submitBusiness } from '@/lib/db/businesses';
import { getUser } from '@/lib/auth/session';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { REGIONS } from '@/lib/constants/community';
import { absoluteUrl } from '@/lib/site';
import { isValidEmail, normalizeIsraeliPhone } from '@/lib/directory/format';
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
 * join_pro lead. A signed-in user also gets a draft listing that they own;
 * businesses_guard forces it to status 'pending' so an admin approves it.
 */
export async function joinProAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  if (text(formData, 'website_url', 200)) return { status: 'sent', draftCreated: false }; // honeypot

  const businessName = text(formData, 'business_name', 120);
  const phone = normalizeIsraeliPhone(text(formData, 'phone', 30));
  const email = text(formData, 'email', 254);
  const about = text(formData, 'about', 3000);
  const specialtyId = text(formData, 'specialty_id', 64);
  const regionSlugs = formData
    .getAll('regions')
    .filter((v): v is string => typeof v === 'string' && REGIONS.some((r) => r.slug === v));

  const fieldErrors: Record<string, string> = {};
  if (businessName.length < 2) fieldErrors.business_name = 'שדה חובה';
  if (!phone) fieldErrors.phone = 'נא להזין מינימום 9–10 ספרות';
  if (!isValidEmail(email)) fieldErrors.email = 'אימייל שגוי';
  if (regionSlugs.length === 0) fieldErrors.regions = 'יש לבחור לפחות אזור אחד';
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', message: 'נא לתקן את השדות המסומנים', fieldErrors };

  try {
    const db = createClient();
    const { data: regionRows } = await db.from('regions').select('id, slug').in('slug', regionSlugs);
    const regionIds = (regionRows ?? []).map((r) => r.id);
    let validSpecialtyId: string | null = null;
    if (/^[0-9a-f-]{36}$/i.test(specialtyId)) {
      const { data } = await db.from('specialties').select('id').eq('id', specialtyId).maybeSingle();
      validSpecialtyId = data?.id ?? null;
    }

    let businessId: string | null = null;
    const user = await getUser();
    if (user) {
      // Owned draft listing (RLS "member submit"; guard forces pending/owner).
      const business = await submitBusiness(db, {
        slug: await uniqueSlug(businessName),
        name: businessName,
        description_html: about ? textToHtml(about) : null,
        primary_specialty_id: validSpecialtyId,
      });
      businessId = business.id;
      await setBusinessRegions(db, business.id, regionIds);
      if (validSpecialtyId) await setBusinessSpecialties(db, business.id, [validSpecialtyId]);
      await db
        .from('business_contacts')
        .upsert({ business_id: business.id, phone, email }, { onConflict: 'business_id' });
    }

    await createLead(db, {
      type: 'join_pro',
      fullName: businessName,
      phone,
      email,
      message: about || null,
      regionId: regionIds.length === 1 ? regionIds[0] : null,
      businessId,
      sourceUrl: absoluteUrl('/join-us/'),
      payload: { business_name: businessName, regions: regionSlugs, specialty_id: validSpecialtyId },
    });
    return { status: 'sent', draftCreated: businessId !== null };
  } catch (err) {
    console.error('joinProAction failed', err);
    return { status: 'error', message: 'אירעה שגיאה בשליחה. נסו שוב בעוד רגע.' };
  }
}
