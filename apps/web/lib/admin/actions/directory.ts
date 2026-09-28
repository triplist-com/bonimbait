'use server';

import {
  createBusiness,
  getBusinessById,
  saveBusinessContacts,
  saveSpecialty,
  setBusinessRegions,
  setBusinessSpecialties,
  updateBusiness,
} from '@/lib/db/businesses';
import { moderateReview, overallFromScores } from '@/lib/db/reviews';
import { getLeadById, updateLead } from '@/lib/db/leads';
import type { BusinessStatus, Json, LeadRouting, TablesInsert } from '@/lib/db/types';
import type { DbClient } from '@/lib/db/client';
import { ActionError, adminAction } from '../guard';
import { bool, ids, int, jsonField, list, optStr, requireField, str, uuidOrNull } from '../form';
import { applySlugRedirect, removeRedirectsFrom } from '../redirects';
import { revalidateBusiness, revalidateDirectory } from '../revalidate';
import { cleanSlug, publicPath, resolveSlug, slugChangeNeedsRedirect } from '../slug';
import { youtubeIdFrom } from '../editor/codec';

const BUSINESS_STATUSES: BusinessStatus[] = ['draft', 'pending', 'published', 'suspended'];

function socialLinks(fd: FormData): Json {
  const out: Record<string, string> = {};
  for (const line of str(fd, 'social_links', 5000).split('\n')) {
    const m = line.match(/^\s*([^:：]+?)\s*[:：]\s*(\S.*)$/);
    if (m) out[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return out;
}

/** Full business edit (every field, including private contacts and ranking). */
export const saveBusinessAction = adminAction('editor', async ({ db }, fd: FormData) => {
  const id = uuidOrNull(optStr(fd, 'id'));
  const existing = id ? await getBusinessById(db, id) : null;
  if (id && !existing) throw new ActionError('העסק לא נמצא');

  const name = requireField(str(fd, 'name', 200), 'שם העסק', 'name');
  const slug = resolveSlug(str(fd, 'slug', 300), { existing: existing?.slug, fallback: name });
  if (!slug) throw new ActionError('כתובת לא תקינה', { slug: 'כתובת לא תקינה' });
  const { data: clash } = await db.from('businesses').select('id').eq('slug', slug).neq('id', id ?? '00000000-0000-0000-0000-000000000000').limit(1);
  if (clash?.length) throw new ActionError('כבר קיים עסק עם הכתובת הזו', { slug: 'כתובת תפוסה' });

  const status = str(fd, 'status') as BusinessStatus;
  if (!BUSINESS_STATUSES.includes(status)) throw new ActionError('סטטוס לא חוקי');
  const routing = (str(fd, 'lead_routing') === 'direct' ? 'direct' : 'site') as LeadRouting;
  const leadEmail = optStr(fd, 'lead_email', 300);
  if (routing === 'direct' && !leadEmail) {
    throw new ActionError('בניתוב ישיר לעסק חובה למלא מייל ללידים', { lead_email: 'שדה חובה בניתוב ישיר' });
  }

  // Owner by email (profiles are readable by staff).
  let ownerId: string | null = null;
  const ownerEmail = optStr(fd, 'owner_email', 300);
  if (ownerEmail) {
    const { data: owner } = await db.from('profiles').select('id').ilike('email', ownerEmail).maybeSingle();
    if (!owner) throw new ActionError('לא נמצא משתמש רשום עם המייל הזה', { owner_email: 'משתמש לא נמצא' });
    ownerId = owner.id;
  }

  const gallery = jsonField<Array<{ url: string; alt?: string | null }>>(fd, 'gallery', []).filter((g) => g && typeof g.url === 'string' && g.url);
  const youtube = list(fd, 'youtube_ids').map((v) => youtubeIdFrom(v)).filter((v): v is string => Boolean(v));
  const primarySpecialty = uuidOrNull(optStr(fd, 'primary_specialty_id'));
  const specialties = ids(fd, 'specialty_ids');
  if (primarySpecialty && !specialties.includes(primarySpecialty)) specialties.unshift(primarySpecialty);

  const fields = {
    name,
    slug,
    tagline: optStr(fd, 'tagline', 300),
    description_html: optStr(fd, 'description_html', 100_000),
    primary_specialty_id: primarySpecialty,
    city: optStr(fd, 'city', 200),
    address: optStr(fd, 'address', 300),
    website: optStr(fd, 'website', 500),
    logo_url: optStr(fd, 'logo_url', 2000),
    cover_image_url: optStr(fd, 'cover_image_url', 2000),
    gallery: gallery.map((g) => ({ url: g.url, alt: g.alt ?? null })) as Json,
    social_links: socialLinks(fd),
    extra_links: list(fd, 'extra_links') as Json,
    youtube_ids: youtube,
    lead_routing: routing,
    owner_member_id: ownerId,
    tier: (['free', 'basic', 'premium'].includes(str(fd, 'tier')) ? str(fd, 'tier') : 'free') as 'free' | 'basic' | 'premium',
    status,
    is_featured: bool(fd, 'is_featured'),
    sort_order: int(fd, 'sort_order', 0),
    seo_title: optStr(fd, 'seo_title', 300),
    seo_description: optStr(fd, 'seo_description', 1000),
    seo_canonical: optStr(fd, 'seo_canonical', 1000),
    published_at: status === 'published' ? existing?.published_at ?? new Date().toISOString() : existing?.published_at ?? null,
  };

  const business = existing ? await updateBusiness(db, existing.id, fields) : await createBusiness(db, fields as TablesInsert<'businesses'>);
  await setBusinessSpecialties(db, business.id, specialties);
  await setBusinessRegions(db, business.id, ids(fd, 'region_ids'));
  await saveBusinessContacts(db, business.id, {
    phone: optStr(fd, 'phone', 50),
    whatsapp: optStr(fd, 'whatsapp', 50),
    email: optStr(fd, 'email', 300),
    other_phones: list(fd, 'other_phones'),
    lead_email: leadEmail,
  });

  let message = 'העסק נשמר.';
  if (existing && slugChangeNeedsRedirect({ oldSlug: existing.slug, newSlug: slug, wasPublished: existing.status === 'published' }) && bool(fd, 'create_redirect')) {
    await applySlugRedirect(db, publicPath('business', existing.slug), publicPath('business', slug), `admin: business slug renamed (${business.id})`);
    message = 'העסק נשמר ונוצרה הפניה 301 מהכתובת הקודמת.';
  }
  if (business.status === 'published') await removeRedirectsFrom(db, publicPath('business', slug));
  revalidateBusiness([slug, existing?.slug]);
  return { ok: true, message, data: existing ? undefined : { redirect: `/admin/directory/businesses/${business.id}/` } };
});

/** Listing order: ids in display order; sort_order becomes 10, 20, 30, ... */
export const saveRanking = adminAction('editor', async ({ db }, orderedIds: string[]) => {
  if (!Array.isArray(orderedIds) || orderedIds.some((i) => !uuidOrNull(i))) throw new ActionError('רשימה לא תקינה');
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db.from('businesses').update({ sort_order: (i + 1) * 10 }).eq('id', orderedIds[i]);
    if (error) throw new Error(error.message);
  }
  revalidateDirectory();
  return { ok: true, message: 'סדר ההופעה נשמר.' };
});

// Specialties and regions ---------------------------------------------------------------

export const saveSpecialtyAction = adminAction('editor', async ({ db }, fd: FormData) => {
  const name = requireField(str(fd, 'name', 200), 'שם', 'name');
  const id = uuidOrNull(optStr(fd, 'id'));
  await saveSpecialty(db, {
    ...(id ? { id } : {}),
    name,
    slug: cleanSlug(str(fd, 'slug', 200) || name),
    sort_order: int(fd, 'sort_order', 0),
    description: optStr(fd, 'description', 2000),
    seo_title: optStr(fd, 'seo_title', 300),
    seo_description: optStr(fd, 'seo_description', 1000),
  });
  revalidateDirectory();
  return { ok: true, message: 'התחום נשמר.' };
});

export const deleteSpecialty = adminAction('editor', async ({ db }, id: string) => {
  const { count } = await db.from('business_specialties').select('business_id', { count: 'exact', head: true }).eq('specialty_id', id);
  if (count) throw new ActionError(`לא ניתן למחוק: ${count} עסקים משויכים לתחום הזה.`);
  const { error } = await db.from('specialties').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidateDirectory();
  return { ok: true, message: 'התחום נמחק.' };
});

export const saveRegion = adminAction('editor', async ({ db }, fd: FormData) => {
  const name = requireField(str(fd, 'name', 200), 'שם', 'name');
  const id = uuidOrNull(optStr(fd, 'id'));
  const row = {
    name,
    slug: cleanSlug(str(fd, 'slug', 100) || name),
    sort_order: int(fd, 'sort_order', 0),
    aliases: list(fd, 'aliases'),
    is_nationwide: bool(fd, 'is_nationwide'),
  };
  const { error } = id ? await db.from('regions').update(row).eq('id', id) : await db.from('regions').insert(row);
  if (error) throw new Error(error.message);
  revalidateDirectory();
  return { ok: true, message: 'האזור נשמר.' };
});

export const deleteRegion = adminAction('admin', async ({ db }, id: string) => {
  const { count } = await db.from('business_regions').select('business_id', { count: 'exact', head: true }).eq('region_id', id);
  if (count) throw new ActionError(`לא ניתן למחוק: ${count} עסקים משויכים לאזור הזה.`);
  const { error } = await db.from('regions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidateDirectory();
  return { ok: true, message: 'האזור נמחק.' };
});

// Reviews ------------------------------------------------------------------------------

async function revalidateReviewBusiness(db: DbClient, businessId: string) {
  const { data } = await db.from('businesses').select('slug').eq('id', businessId).maybeSingle();
  revalidateBusiness([data?.slug]);
}

export const setReviewStatus = adminAction('editor', async ({ db, profile }, id: string, status: 'approved' | 'rejected') => {
  if (status !== 'approved' && status !== 'rejected') throw new ActionError('סטטוס לא חוקי');
  const review = await moderateReview(db, id, status, profile.id);
  await revalidateReviewBusiness(db, review.business_id);
  return { ok: true, message: status === 'approved' ? 'הביקורת אושרה ופורסמה.' : 'הביקורת נדחתה.' };
});

function score(fd: FormData, name: string): number {
  const n = Number(str(fd, name, 10));
  if (!Number.isFinite(n) || n < 0 || n > 10) throw new ActionError('ציון חייב להיות בין 0 ל-10', { [name]: '0–10' });
  return n;
}

export const editReview = adminAction('editor', async ({ db }, fd: FormData) => {
  const id = uuidOrNull(optStr(fd, 'id'));
  if (!id) throw new ActionError('ביקורת לא נמצאה');
  const scores = {
    score_value: score(fd, 'score_value'),
    score_availability: score(fd, 'score_availability'),
    score_attitude: score(fd, 'score_attitude'),
    score_reliability: score(fd, 'score_reliability'),
  };
  const { data, error } = await db
    .from('reviews')
    .update({
      author_name: optStr(fd, 'author_name', 200),
      title: optStr(fd, 'title', 300),
      body: optStr(fd, 'body', 10_000),
      ...scores,
      rating: overallFromScores(scores),
    })
    .eq('id', id)
    .select('business_id')
    .single();
  if (error) throw new Error(error.message);
  await revalidateReviewBusiness(db, data.business_id);
  return { ok: true, message: 'הביקורת עודכנה.' };
});

// Claims and join requests (admin: they grant the pro role) --------------------------------

function appendNote(existing: string | null, line: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return [existing, `[${stamp}] ${line}`].filter(Boolean).join('\n');
}

/**
 * Approve a claim_business / join_pro request: the member becomes the
 * business owner and a `pro`, the business is published, the lead is won.
 */
export const approveBusinessRequest = adminAction('admin', async ({ db, profile }, leadId: string) => {
  const lead = await getLeadById(db, leadId);
  if (!lead || (lead.type !== 'claim_business' && lead.type !== 'join_pro')) throw new ActionError('הבקשה לא נמצאה');
  if (!lead.member_id) throw new ActionError('הבקשה נשלחה ללא חשבון משתמש, ולכן אי אפשר לשייך עסק. צרו קשר עם הפונה.');
  if (!lead.business_id) throw new ActionError('לבקשה אין עסק מקושר. צרו את העסק בעמוד "עסקים" ושייכו אותו לבעלים במייל.');

  const business = await getBusinessById(db, lead.business_id);
  if (!business) throw new ActionError('העסק המקושר לא נמצא');
  if (business.owner_member_id && business.owner_member_id !== lead.member_id) {
    throw new ActionError('לעסק כבר יש בעלים אחר. הסירו אותו בעריכת העסק לפני האישור.');
  }

  const { data: member, error: memberError } = await db.from('profiles').select('id, role, email').eq('id', lead.member_id).maybeSingle();
  if (memberError) throw new Error(memberError.message);
  if (!member) throw new ActionError('המשתמש של הבקשה לא נמצא');

  await updateBusiness(db, business.id, {
    owner_member_id: member.id,
    status: 'published',
    published_at: business.published_at ?? new Date().toISOString(),
  });
  if (member.role === 'member') {
    const { error } = await db.from('profiles').update({ role: 'pro' }).eq('id', member.id);
    if (error) throw new Error(error.message);
  }
  await updateLead(db, lead.id, {
    status: 'won',
    notes: appendNote(lead.notes, `אושר על ידי ${profile.email ?? profile.id}: ${member.email ?? member.id} מנהל/ת את "${business.name}"`),
  });
  revalidateBusiness([business.slug]);
  return { ok: true, message: `אושר. ${member.email ?? 'המשתמש'} מנהל/ת כעת את "${business.name}" ויכול/ה להיכנס לפורטל העסק.` };
});

export const rejectBusinessRequest = adminAction('admin', async ({ db, profile }, leadId: string, fd?: FormData) => {
  const lead = await getLeadById(db, leadId);
  if (!lead || (lead.type !== 'claim_business' && lead.type !== 'join_pro')) throw new ActionError('הבקשה לא נמצאה');
  const reason = fd ? optStr(fd, 'reason', 1000) : null;
  await updateLead(db, lead.id, {
    status: 'lost',
    notes: appendNote(lead.notes, `נדחה על ידי ${profile.email ?? profile.id}${reason ? `: ${reason}` : ''}`),
  });
  return { ok: true, message: 'הבקשה נדחתה.' };
});
