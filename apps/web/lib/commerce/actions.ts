'use server';

/**
 * Server actions for the benefits shop and service plans: lead-form adapters
 * over the shared Leads pipeline, add-to-cart / buy-now and cart edits.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getPurchasablePlanPrice } from '@/lib/db/commerce';
import { unwrapMaybe } from '@/lib/db/client';
import { submitLeadAction } from '@/lib/leads/actions';
import type { LeadFormState } from '@/lib/leads/types';
import { onlinePaymentsEnabled } from '@/lib/payments';
import { addToCart, isUuid, removeFromCart, setQuantity } from './cart';
import { readCart, writeCart } from './cart-server';
import { bool, str } from './forms';

// Lead forms (shared pipeline: validation, spam guard, notification) ---------------

/**
 * Product "חזרו אליי" form -> `benefit` lead. The live RINNAI form has an
 * optional "urgent" checkbox the shared benefit schema doesn't know, so it is
 * carried as context (payload.urgent).
 */
export async function productLeadAction(prev: LeadFormState, form: FormData): Promise<LeadFormState> {
  const fd = new FormData();
  form.forEach((value, key) => {
    if (key !== 'urgent') fd.append(key, value);
  });
  if (bool(form, 'urgent')) fd.set('_ctx_urgent', 'true');
  return submitLeadAction(prev, fd);
}

/**
 * /membership-tiers/ "leave details" -> `service_plan` lead. The optional plan
 * select sends a slug; it is resolved to the plan id (never trusted as an id).
 */
export async function servicePlanLeadAction(prev: LeadFormState, form: FormData): Promise<LeadFormState> {
  const fd = new FormData();
  form.forEach((value, key) => {
    if (key !== 'plan' && key !== '_service_plan_id') fd.append(key, value);
  });
  const planSlug = str(form, 'plan', 60);
  if (planSlug && isSupabaseConfigured()) {
    const plan = unwrapMaybe(
      await createClient().from('service_plans').select('id, name').eq('slug', planSlug).eq('is_active', true).maybeSingle(),
    );
    if (plan) {
      fd.set('_service_plan_id', plan.id);
      fd.set('_ctx_plan_name', plan.name);
    }
  }
  return submitLeadAction(prev, fd);
}


// Cart --------------------------------------------------------------------------------

/** "הוסף לסל" on the product-category archive. */
export async function addProductToCart(form: FormData): Promise<void> {
  const productId = str(form, 'product_id', 60);
  const quantity = Number(str(form, 'quantity', 4) || '1');
  if (!isUuid(productId) || !isSupabaseConfigured() || !onlinePaymentsEnabled()) redirect('/cart/');
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
  if (!isUuid(priceId) || !isSupabaseConfigured() || !onlinePaymentsEnabled()) redirect('/membership-tiers/');
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
