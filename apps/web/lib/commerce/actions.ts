'use server';

/**
 * Server actions for the benefits shop and service plans: lead forms
 * ("השאירו פרטים"), add-to-cart / buy-now and cart edits.
 *
 * Leads are inserted as the visitor (RLS allows public inserts; the
 * leads_guard trigger resets workflow fields). Lead notifications are the
 * Leads workstream's concern (hook on the leads table).
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createLead } from '@/lib/db/leads';
import { getRegionIdBySlug } from '@/lib/db/account';
import { getPurchasablePlanPrice } from '@/lib/db/commerce';
import { unwrapMaybe } from '@/lib/db/client';
import { addToCart, isUuid, removeFromCart, setQuantity } from './cart';
import { readCart, writeCart } from './cart-server';
import { type FieldErrors, type FormState, asStage, bool, isMemberRegionSlug, str, validateContact } from './forms';

/** Where the live site sends product leads (page owned by the Leads workstream). */
const PRODUCT_LEAD_THANK_YOU = '/תודה-על-השארת-פרטים-מוצר/';
/** Generic lead thank-you page (/תודה-על-השארת-פרטים/ 301s here on live). */
const LEAD_THANK_YOU = '/thank-you/';

const UNAVAILABLE: FormState = {
  ok: false,
  message: 'השליחה אינה זמינה כרגע. נסו שוב מאוחר יותר או צרו קשר בטלפון.',
  errors: {},
};

function invalid(errors: FieldErrors): FormState {
  return { ok: false, message: 'נא לתקן את השדות המסומנים.', errors };
}

function sourceUrl(): string | null {
  return headers().get('referer');
}

function utmFrom(form: FormData) {
  const utm: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = str(form, key, 200);
    if (v) utm[key] = v;
  }
  return utm;
}

/** Honeypot: bots fill the hidden "website" field. Pretend success. */
function isBot(form: FormData): boolean {
  return str(form, 'website').length > 0;
}

// Product lead ("מעוניינים במוצר? השאירו פרטים ונחזור אליכם") --------------------

export async function submitProductLead(_prev: FormState, form: FormData): Promise<FormState> {
  if (isBot(form)) redirect(encodeURI(PRODUCT_LEAD_THANK_YOU));
  if (!isSupabaseConfigured()) return UNAVAILABLE;

  const errors: FieldErrors = {};
  const { fullName, email, phone } = validateContact(form, errors);
  const region = str(form, 'region', 60);
  const stage = asStage(str(form, 'stage', 30));
  const productId = str(form, 'product_id', 60);
  if (!isMemberRegionSlug(region)) errors.region = 'נא לבחור מיקום פרויקט';
  if (!stage) errors.stage = 'נא לבחור שלב בניה';
  if (!bool(form, 'privacy')) errors.privacy = 'יש לאשר את מדיניות הפרטיות';
  if (!isUuid(productId)) errors.form = 'מוצר לא נמצא';
  if (Object.keys(errors).length) return invalid(errors);

  const db = createClient();
  const product = unwrapMaybe(
    await db.from('products').select('id, name, slug').eq('id', productId).eq('status', 'published').maybeSingle(),
  );
  if (!product) return { ok: false, message: 'המוצר אינו זמין עוד.', errors: {} };

  try {
    await createLead(db, {
      type: 'benefit',
      fullName,
      email,
      phone,
      regionId: await getRegionIdBySlug(db, region),
      constructionStage: stage,
      productId: product.id,
      sourceUrl: sourceUrl(),
      utm: utmFrom(form),
      payload: {
        form: 'product',
        product_name: product.name,
        product_slug: product.slug,
        urgent: bool(form, 'urgent'),
        privacy_consent: true,
      },
    });
  } catch (err) {
    console.error('[commerce] product lead insert failed', err);
    return UNAVAILABLE;
  }
  redirect(encodeURI(PRODUCT_LEAD_THANK_YOU));
}

// Service-plan lead (/membership-tiers/ "השאירו פרטים") -------------------------------

export async function submitServicePlanLead(_prev: FormState, form: FormData): Promise<FormState> {
  if (isBot(form)) redirect(LEAD_THANK_YOU);
  if (!isSupabaseConfigured()) return UNAVAILABLE;

  const errors: FieldErrors = {};
  const { fullName, email, phone } = validateContact(form, errors);
  const region = str(form, 'region', 60);
  const planSlug = str(form, 'plan', 60);
  const message = str(form, 'message', 2000);
  if (!isMemberRegionSlug(region)) errors.region = 'נא לבחור אזור בנייה';
  if (!bool(form, 'privacy')) errors.privacy = 'יש לאשר את מדיניות הפרטיות';
  if (Object.keys(errors).length) return invalid(errors);

  const db = createClient();
  const plan = planSlug
    ? unwrapMaybe(await db.from('service_plans').select('id, name').eq('slug', planSlug).maybeSingle())
    : null;

  try {
    await createLead(db, {
      type: 'service_plan',
      fullName,
      email,
      phone,
      message: message || null,
      regionId: await getRegionIdBySlug(db, region),
      servicePlanId: plan?.id ?? null,
      sourceUrl: sourceUrl(),
      utm: utmFrom(form),
      payload: { form: 'membership-tiers', plan_slug: planSlug || null, plan_name: plan?.name ?? null, privacy_consent: true },
    });
  } catch (err) {
    console.error('[commerce] service plan lead insert failed', err);
    return UNAVAILABLE;
  }
  redirect(LEAD_THANK_YOU);
}

// Cart --------------------------------------------------------------------------------

/** "הוסף לסל" on the product-category archive. */
export async function addProductToCart(form: FormData): Promise<void> {
  const productId = str(form, 'product_id', 60);
  const quantity = Number(str(form, 'quantity', 4) || '1');
  if (!isUuid(productId) || !isSupabaseConfigured()) redirect('/cart/');
  const product = unwrapMaybe(
    await createClient()
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('status', 'published')
      .eq('is_purchasable', true)
      .maybeSingle(),
  );
  if (product) writeCart(addToCart(readCart(), { kind: 'product', id: product.id, quantity }));
  redirect('/cart/');
}

/** "רכישה אונליין" on /membership-tiers/ (only plans with is_purchasable_online). */
export async function buyServicePlan(form: FormData): Promise<void> {
  const priceId = str(form, 'price_id', 60);
  if (!isUuid(priceId) || !isSupabaseConfigured()) redirect('/membership-tiers/');
  const found = await getPurchasablePlanPrice(createClient(), priceId);
  if (!found) redirect('/membership-tiers/');
  writeCart(addToCart(readCart(), { kind: 'service_plan', id: found.price.id, quantity: 1 }));
  redirect('/checkout/');
}

export async function updateCartQuantity(form: FormData): Promise<void> {
  const id = str(form, 'id', 60);
  const kind = str(form, 'kind', 20) === 'service_plan' ? 'service_plan' : 'product';
  const quantity = Math.floor(Number(str(form, 'quantity', 4)));
  if (isUuid(id) && Number.isFinite(quantity)) writeCart(setQuantity(readCart(), kind, id, quantity));
  redirect('/cart/');
}

export async function removeCartLine(form: FormData): Promise<void> {
  const id = str(form, 'id', 60);
  const kind = str(form, 'kind', 20) === 'service_plan' ? 'service_plan' : 'product';
  if (isUuid(id)) writeCart(removeFromCart(readCart(), kind, id));
  redirect('/cart/');
}
