'use server';

import type { Json, OrderStatus, ProductStatus, ProductTaxonomy } from '@/lib/db/types';
import { ActionError, adminAction } from '../guard';
import { bool, html, ids, int, jsonField, list, optInt, optStr, requireField, shekelsToAgorot, str, uuidOrNull } from '../form';
import { applySlugRedirect, removeRedirectsFrom } from '../redirects';
import { revalidateCommerce } from '../revalidate';
import { publicPath, resolveSlug, slugChangeNeedsRedirect } from '../slug';

const PRODUCT_STATUSES: ProductStatus[] = ['draft', 'published', 'archived'];

/** Benefit-shop product (/product/<slug>/). */
export const saveProduct = adminAction('editor', async ({ db }, fd: FormData) => {
  const id = uuidOrNull(optStr(fd, 'id'));
  const { data: existing } = id ? await db.from('products').select('*').eq('id', id).maybeSingle() : { data: null };
  if (id && !existing) throw new ActionError('המוצר לא נמצא');

  const name = requireField(str(fd, 'name', 300), 'שם המוצר', 'name');
  const slug = resolveSlug(str(fd, 'slug', 300), { existing: existing?.slug, fallback: name });
  if (!slug) throw new ActionError('כתובת לא תקינה', { slug: 'כתובת לא תקינה' });
  const { data: clash } = await db.from('products').select('id').eq('slug', slug).neq('id', id ?? '00000000-0000-0000-0000-000000000000').limit(1);
  if (clash?.length) throw new ActionError('כבר קיים מוצר עם הכתובת הזו', { slug: 'כתובת תפוסה' });
  const status = str(fd, 'status') as ProductStatus;
  if (!PRODUCT_STATUSES.includes(status)) throw new ActionError('סטטוס לא חוקי');

  const price = shekelsToAgorot(str(fd, 'price', 30)) ?? 0;
  const sale = shekelsToAgorot(str(fd, 'sale_price', 30));
  if (sale !== null && sale >= price) throw new ActionError('מחיר המבצע חייב להיות נמוך מהמחיר הרגיל', { sale_price: 'לא תקין' });
  const purchasable = bool(fd, 'is_purchasable');
  if (purchasable && price <= 0) throw new ActionError('מוצר לרכישה באתר חייב מחיר', { price: 'חובה' });

  // Accordion sections: detail_keys orders detail_title_<k> / detail_html_<k>.
  const details = list(fd, 'detail_keys')
    .map((k) => ({ title: str(fd, `detail_title_${k}`, 300), html: html(fd, `detail_html_${k}`) }))
    .filter((d) => d.title || d.html);

  const fields = {
    name,
    slug,
    subtitle: optStr(fd, 'subtitle', 300),
    short_description: optStr(fd, 'short_description', 5000),
    description_html: html(fd, 'description_html') || null,
    is_purchasable: purchasable,
    price_agorot: price,
    sale_price_agorot: sale,
    sku: optStr(fd, 'sku', 100),
    stock_quantity: optInt(fd, 'stock_quantity'),
    partner_business_id: uuidOrNull(optStr(fd, 'partner_business_id')),
    featured_image: optStr(fd, 'featured_image', 2000),
    images: jsonField<Array<{ url: string; alt?: string | null }>>(fd, 'images', []) as unknown as Json,
    tag_label: optStr(fd, 'tag_label', 100),
    lead_heading: optStr(fd, 'lead_heading', 300),
    lead_urgent_option: bool(fd, 'lead_urgent_option'),
    details: details as unknown as Json,
    status,
    sort_order: int(fd, 'sort_order', 0),
    seo_title: optStr(fd, 'seo_title', 300),
    seo_description: optStr(fd, 'seo_description', 1000),
    seo_canonical: optStr(fd, 'seo_canonical', 1000),
  };
  const { data: product, error } = existing
    ? await db.from('products').update(fields).eq('id', existing.id).select('*').single()
    : await db.from('products').insert(fields).select('*').single();
  if (error) throw new Error(error.message);

  const categoryIds = ids(fd, 'category_ids');
  const del = await db.from('product_category_assignments').delete().eq('product_id', product.id);
  if (del.error) throw new Error(del.error.message);
  if (categoryIds.length) {
    const ins = await db.from('product_category_assignments').insert(categoryIds.map((category_id) => ({ product_id: product.id, category_id })));
    if (ins.error) throw new Error(ins.error.message);
  }

  let message = 'המוצר נשמר.';
  if (existing && slugChangeNeedsRedirect({ oldSlug: existing.slug, newSlug: slug, wasPublished: existing.status === 'published' }) && bool(fd, 'create_redirect')) {
    await applySlugRedirect(db, publicPath('product', existing.slug), publicPath('product', slug), `admin: product slug renamed (${product.id})`);
    message = 'המוצר נשמר ונוצרה הפניה 301 מהכתובת הקודמת.';
  }
  if (product.status === 'published') await removeRedirectsFrom(db, publicPath('product', slug));
  revalidateCommerce([slug, existing?.slug]);
  return { ok: true, message, data: existing ? undefined : { redirect: `/admin/commerce/products/${product.id}/` } };
});

export const saveProductCategory = adminAction('editor', async ({ db }, fd: FormData) => {
  const name = requireField(str(fd, 'name', 200), 'שם', 'name');
  const id = uuidOrNull(optStr(fd, 'id'));
  const taxonomy = (str(fd, 'taxonomy') === 'category_product' ? 'category_product' : 'product_cat') as ProductTaxonomy;
  const row = {
    name,
    slug: resolveSlug(str(fd, 'slug', 200), { existing: optStr(fd, 'original_slug'), fallback: name }),
    taxonomy,
    description: optStr(fd, 'description', 5000),
    sort_order: int(fd, 'sort_order', 0),
    seo_title: optStr(fd, 'seo_title', 300),
    seo_description: optStr(fd, 'seo_description', 1000),
  };
  const { error } = id ? await db.from('product_categories').update(row).eq('id', id) : await db.from('product_categories').insert(row);
  if (error) throw new Error(error.message);
  revalidateCommerce();
  return { ok: true, message: 'הקטגוריה נשמרה.' };
});

export const deleteProductCategory = adminAction('editor', async ({ db }, id: string) => {
  const { error } = await db.from('product_categories').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidateCommerce();
  return { ok: true, message: 'הקטגוריה נמחקה.' };
});

type PriceInput = { id?: string; label?: string; min_sqm?: string | number | null; max_sqm?: string | number | null; price: string; vat_included?: boolean };
type FeatureInput = { category?: string; label: string; value: boolean | string };

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new ActionError('שטח חייב להיות מספר שלם');
  return n;
}

/** Construction-management plan: card, comparison table, prices, online purchase toggle. */
export const saveServicePlan = adminAction('editor', async ({ db }, fd: FormData) => {
  const id = uuidOrNull(optStr(fd, 'id'));
  if (!id) throw new ActionError('המסלול לא נמצא');
  const name = requireField(str(fd, 'name', 200), 'שם', 'name');

  const features = jsonField<FeatureInput[]>(fd, 'features', [])
    .filter((f) => f && typeof f.label === 'string' && f.label.trim())
    .map((f) => ({
      label: f.label.trim(),
      ...(f.category?.trim() ? { category: f.category.trim() } : {}),
      value: typeof f.value === 'boolean' ? f.value : String(f.value ?? '').trim() || false,
    }));

  const { error } = await db
    .from('service_plans')
    .update({
      name,
      track_label: optStr(fd, 'track_label', 200),
      subtitle: optStr(fd, 'subtitle', 300),
      description_html: html(fd, 'description_html') || null,
      highlights: list(fd, 'highlights') as Json,
      features: features as unknown as Json,
      cta_label: optStr(fd, 'cta_label', 100),
      compare_label: optStr(fd, 'compare_label', 100),
      is_featured: bool(fd, 'is_featured'),
      is_purchasable_online: bool(fd, 'is_purchasable_online'),
      is_active: bool(fd, 'is_active'),
      sort_order: int(fd, 'sort_order', 0),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const prices = jsonField<PriceInput[]>(fd, 'prices', []);
  if (bool(fd, 'is_purchasable_online') && prices.length === 0) throw new ActionError('מסלול לרכישה באתר חייב מחיר');
  const { data: current } = await db.from('service_plan_prices').select('id').eq('plan_id', id);
  const keep = new Set<string>();
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    const agorot = shekelsToAgorot(String(p.price ?? ''));
    if (agorot === null) throw new ActionError('לכל מחיר חובה סכום');
    const row = {
      plan_id: id,
      label: p.label?.trim() || null,
      min_sqm: numOrNull(p.min_sqm),
      max_sqm: numOrNull(p.max_sqm),
      price_agorot: agorot,
      vat_included: Boolean(p.vat_included),
      sort_order: i,
    };
    if (p.id && uuidOrNull(p.id)) {
      keep.add(p.id);
      const r = await db.from('service_plan_prices').update(row).eq('id', p.id).eq('plan_id', id);
      if (r.error) throw new Error(r.error.message);
    } else {
      const r = await db.from('service_plan_prices').insert(row);
      if (r.error) throw new Error(r.error.message);
    }
  }
  const remove = (current ?? []).map((c) => c.id).filter((pid) => !keep.has(pid));
  if (remove.length) {
    const r = await db.from('service_plan_prices').delete().in('id', remove);
    if (r.error) throw new Error(r.error.message);
  }
  revalidateCommerce();
  return { ok: true, message: 'המסלול נשמר.' };
});

const ORDER_STATUSES: OrderStatus[] = ['pending', 'paid', 'failed', 'cancelled', 'refunded'];

/**
 * Manual order status change (e.g. paid by bank transfer, refunded by phone).
 * Admin only. It records who did it in the order notes; it does not talk to
 * the payment provider.
 */
export const setOrderStatus = adminAction('admin', async ({ db, profile }, id: string, fd: FormData) => {
  const status = str(fd, 'status') as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) throw new ActionError('סטטוס לא חוקי');
  const { data: order } = await db.from('orders').select('id, status, notes, paid_at').eq('id', id).maybeSingle();
  if (!order) throw new ActionError('ההזמנה לא נמצאה');
  if (order.status === status) return { ok: true, message: 'אין שינוי.' };
  const reason = optStr(fd, 'reason', 500);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const line = `[${stamp}] ${profile.email ?? profile.id}: ${order.status} -> ${status}${reason ? ` (${reason})` : ''}`;
  const { error } = await db
    .from('orders')
    .update({
      status,
      notes: [order.notes, line].filter(Boolean).join('\n'),
      paid_at: status === 'paid' ? order.paid_at ?? new Date().toISOString() : order.paid_at,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true, message: 'סטטוס ההזמנה עודכן.' };
});

