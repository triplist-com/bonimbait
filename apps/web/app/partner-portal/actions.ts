'use server';

import { revalidatePath } from 'next/cache';
import {
  saveBusinessContacts,
  setBusinessRegions,
  setBusinessSpecialties,
  updateOwnedBusiness,
} from '@/lib/db/businesses';
import type { BusinessRow, GalleryImage } from '@/lib/db/types';
import { getProfile } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { SUPABASE_URL } from '@/lib/supabase/env';
import { businessPath, isValidEmail, normalizeIsraeliPhone } from '@/lib/directory/format';
import { textToHtml } from '@/lib/directory/html';

export type PortalState = { status: 'idle' } | { status: 'saved'; message: string } | { status: 'error'; message: string };

const MAX_GALLERY = 30;

function text(formData: FormData, name: string, max: number): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * The caller must be a 'pro' (or staff) who owns the business. Writes then
 * run as the user, so RLS and businesses_guard still decide what sticks
 * (slug, status, routing, ranking are protected).
 */
async function requireOwnedBusiness(formData: FormData): Promise<Pick<BusinessRow, 'id' | 'slug' | 'status' | 'gallery' | 'logo_url'>> {
  const profile = await getProfile();
  if (!profile || !hasRole(profile.role, 'pro')) throw new Error('forbidden');
  const id = text(formData, 'business_id', 64);
  const { data } = await createClient()
    .from('businesses')
    .select('id, slug, status, gallery, logo_url')
    .eq('id', id)
    .eq('owner_member_id', profile.id)
    .maybeSingle();
  if (!data || data.status === 'suspended') throw new Error('forbidden');
  return data;
}

function done(slug: string, message: string): PortalState {
  revalidatePath('/partner-portal/');
  revalidatePath(businessPath(slug));
  revalidatePath('/recommended/');
  return { status: 'saved', message };
}

function fail(err: unknown): PortalState {
  if (err instanceof Error && err.message === 'forbidden') {
    return { status: 'error', message: 'אין לך הרשאה לערוך את העסק הזה.' };
  }
  console.error('partner portal action failed', err);
  return { status: 'error', message: 'השמירה נכשלה. נסו שוב.' };
}

function safeUrl(value: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function saveDetailsAction(_prev: PortalState, formData: FormData): Promise<PortalState> {
  try {
    const business = await requireOwnedBusiness(formData);
    const website = text(formData, 'website', 300);
    if (website && !safeUrl(website)) return { status: 'error', message: 'כתובת האתר אינה תקינה (יש להתחיל ב-https://).' };
    const about = text(formData, 'about', 8000);
    await updateOwnedBusiness(createClient(), business.id, {
      tagline: text(formData, 'tagline', 200) || null,
      description_html: about ? textToHtml(about) : null,
      city: text(formData, 'city', 80) || null,
      website: website ? safeUrl(website) : null,
    });
    return done(business.slug, 'הפרטים נשמרו.');
  } catch (err) {
    return fail(err);
  }
}

export async function saveContactsAction(_prev: PortalState, formData: FormData): Promise<PortalState> {
  try {
    const business = await requireOwnedBusiness(formData);
    const phoneRaw = text(formData, 'phone', 30);
    const phone = normalizeIsraeliPhone(phoneRaw);
    if (phoneRaw && !phone) return { status: 'error', message: 'מספר הטלפון אינו תקין.' };
    const whatsappRaw = text(formData, 'whatsapp', 30);
    const whatsapp = normalizeIsraeliPhone(whatsappRaw);
    if (whatsappRaw && !whatsapp) return { status: 'error', message: 'מספר הוואטסאפ אינו תקין.' };
    const email = text(formData, 'email', 254);
    if (email && !isValidEmail(email)) return { status: 'error', message: 'כתובת האימייל אינה תקינה.' };
    const leadEmail = text(formData, 'lead_email', 254);
    if (leadEmail && !isValidEmail(leadEmail)) return { status: 'error', message: 'כתובת האימייל לפניות אינה תקינה.' };
    const otherPhones = text(formData, 'other_phones', 200)
      .split(/[,\n]/)
      .map((p) => normalizeIsraeliPhone(p))
      .filter((p): p is string => !!p)
      .slice(0, 3);

    await saveBusinessContacts(createClient(), business.id, {
      phone,
      // Empty = the public WhatsApp button falls back to the phone number.
      whatsapp,
      email: email || null,
      lead_email: leadEmail || null,
      other_phones: otherPhones,
    });
    return done(business.slug, 'פרטי הקשר נשמרו.');
  } catch (err) {
    return fail(err);
  }
}

export async function saveTaxonomyAction(_prev: PortalState, formData: FormData): Promise<PortalState> {
  try {
    const business = await requireOwnedBusiness(formData);
    const db = createClient();
    const wanted = (name: string) => formData.getAll(name).filter((v): v is string => typeof v === 'string');
    const [specialties, regions] = await Promise.all([
      db.from('specialties').select('id').in('id', wanted('specialties').slice(0, 10)),
      db.from('regions').select('id').in('id', wanted('regions')),
    ]);
    const specialtyIds = (specialties.data ?? []).map((s) => s.id);
    const regionIds = (regions.data ?? []).map((r) => r.id);
    if (specialtyIds.length === 0) return { status: 'error', message: 'יש לבחור לפחות התמחות אחת.' };
    if (regionIds.length === 0) return { status: 'error', message: 'יש לבחור לפחות אזור שירות אחד.' };
    await setBusinessSpecialties(db, business.id, specialtyIds);
    await setBusinessRegions(db, business.id, regionIds);
    const primary = text(formData, 'primary_specialty_id', 64);
    await updateOwnedBusiness(db, business.id, {
      primary_specialty_id: specialtyIds.includes(primary) ? primary : specialtyIds[0],
    });
    return done(business.slug, 'ההתמחויות והאזורים נשמרו.');
  } catch (err) {
    return fail(err);
  }
}

/**
 * Gallery + logo. Images are uploaded by the browser straight to Storage
 * (media/businesses/<id>/…, allowed for the owner by storage RLS); here we
 * only accept URLs already on the business or inside that folder.
 */
export async function saveMediaAction(_prev: PortalState, formData: FormData): Promise<PortalState> {
  try {
    const business = await requireOwnedBusiness(formData);
    const folder = `${SUPABASE_URL}/storage/v1/object/public/media/businesses/${business.id}/`;
    const existing = new Set(
      (Array.isArray(business.gallery) ? business.gallery : [])
        .map((g) => (g && typeof g === 'object' && !Array.isArray(g) ? g.url : null))
        .filter((u): u is string => typeof u === 'string'),
    );
    const allowed = (url: string) => existing.has(url) || (url.startsWith(folder) && !url.includes('..'));

    let parsed: unknown;
    try {
      parsed = JSON.parse(text(formData, 'gallery', 50_000) || '[]');
    } catch {
      return { status: 'error', message: 'נתוני הגלריה אינם תקינים.' };
    }
    if (!Array.isArray(parsed)) return { status: 'error', message: 'נתוני הגלריה אינם תקינים.' };
    const gallery: GalleryImage[] = [];
    for (const item of parsed.slice(0, MAX_GALLERY)) {
      const url = item && typeof item === 'object' && typeof (item as GalleryImage).url === 'string' ? (item as GalleryImage).url : null;
      if (!url || !allowed(url)) return { status: 'error', message: 'אחת התמונות אינה שייכת לעסק.' };
      const alt = (item as GalleryImage).alt;
      gallery.push({ url, alt: typeof alt === 'string' ? alt.slice(0, 150) : null });
    }

    const logo = text(formData, 'logo_url', 1000);
    if (logo && logo !== business.logo_url && !allowed(logo)) {
      return { status: 'error', message: 'הלוגו אינו שייך לעסק.' };
    }

    await updateOwnedBusiness(createClient(), business.id, { gallery, logo_url: logo || null });
    return done(business.slug, 'התמונות נשמרו.');
  } catch (err) {
    return fail(err);
  }
}
