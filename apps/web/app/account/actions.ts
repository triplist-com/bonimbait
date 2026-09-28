'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getRegionIdBySlug, updateAccountProfile } from '@/lib/db/account';
import { type FieldErrors, type FormState, asStage, bool, isMemberRegionSlug, normalizePhone, str } from '@/lib/commerce/forms';

/** Save the member's own profile (RLS: update own row; role can't change). */
export async function saveProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) return { ok: false, message: 'פג תוקף ההתחברות. התחברו מחדש.', errors: {} };

  const errors: FieldErrors = {};
  const fullName = str(form, 'full_name', 120);
  const phoneRaw = str(form, 'phone', 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const stageRaw = str(form, 'stage', 30);
  const stage = stageRaw ? asStage(stageRaw) : null;
  const region = str(form, 'region', 60);
  if (fullName.length < 2) errors.full_name = 'נא למלא שם מלא';
  if (phoneRaw && !phone) errors.phone = 'נא להזין מספר טלפון תקין';
  if (stageRaw && !stage) errors.stage = 'שלב לא תקין';
  if (region && !isMemberRegionSlug(region)) errors.region = 'אזור לא תקין';
  if (Object.keys(errors).length) return { ok: false, message: 'נא לתקן את השדות המסומנים.', errors };

  const db = createClient();
  try {
    await updateAccountProfile(db, user.id, {
      full_name: fullName,
      phone,
      construction_stage: stage,
      region_id: region ? await getRegionIdBySlug(db, region) : null,
      whatsapp_opt_in: bool(form, 'whatsapp_opt_in'),
      newsletter_opt_in: bool(form, 'newsletter_opt_in'),
    });
  } catch (err) {
    console.error('[account] profile update failed', err);
    return { ok: false, message: 'השמירה נכשלה. נסו שוב.', errors: {} };
  }
  revalidatePath('/account/');
  return { ok: true, message: 'הפרטים נשמרו.', errors: {} };
}
