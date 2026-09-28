/**
 * Construction-management service plans (/membership-tiers/), the benefits
 * shop (products + product categories), cart pricing, orders and payments.
 *
 * Catalog reads use the normal server client. Every WRITE to orders,
 * order_items and payments must use the service-role client
 * (createAdminClient) from a route handler / server action that has
 * authenticated the buyer: RLS gives members read-only access so prices and
 * payment state can't be forged. Prices are always re-read from the DB here,
 * never taken from the request.
 */
import { type DbClient, unwrap, unwrapMaybe } from './client';
import type {
  Json,
  OrderItemRow,
  OrderRow,
  PaymentProviderName,
  PaymentRow,
  PaymentStatus,
  ProductCategoryRow,
  ProductRow,
  ProductTaxonomy,
  ServicePlanFeature,
  ServicePlanPriceRow,
  ServicePlanRow,
} from './types';
import { computeOrderTotals, formatAgorot, parseVatRate, type OrderTotals } from '@/lib/commerce/pricing';
import { decidePaymentTransition } from '@/lib/commerce/payment-transitions';
import type { Cart } from '@/lib/commerce/cart';

/** Israeli VAT rate applied to ex-VAT prices (service plans). Override with VAT_RATE. */
export const VAT_RATE = parseVatRate(process.env.VAT_RATE);

/** Format agorot as a Hebrew ILS price, e.g. 690000 -> "‏6,900 ₪". */
export function formatPrice(agorot: number): string {
  return formatAgorot(agorot);
}

export function effectivePrice(product: Pick<ProductRow, 'price_agorot' | 'sale_price_agorot'>): number {
  return product.sale_price_agorot ?? product.price_agorot;
}

// Service plans -------------------------------------------------------------------

export type ServicePlanWithPrices = ServicePlanRow & { prices: ServicePlanPriceRow[] };

export function parsePlanFeatures(value: Json): ServicePlanFeature[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item) && typeof item.label === 'string') {
      const v = item.value;
      return [
        {
          label: item.label,
          category: typeof item.category === 'string' ? item.category : undefined,
          value: typeof v === 'boolean' || typeof v === 'string' ? v : false,
        },
      ];
    }
    return [];
  });
}

export function parseStringList(value: Json): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function listActiveServicePlans(db: DbClient): Promise<ServicePlanWithPrices[]> {
  const [plans, prices] = await Promise.all([
    db.from('service_plans').select('*').eq('is_active', true).order('sort_order'),
    db.from('service_plan_prices').select('*').order('sort_order'),
  ]);
  const byPlan = new Map<string, ServicePlanPriceRow[]>();
  for (const price of unwrap(prices)) {
    byPlan.set(price.plan_id, [...(byPlan.get(price.plan_id) ?? []), price]);
  }
  return unwrap(plans).map((plan) => ({ ...plan, prices: byPlan.get(plan.id) ?? [] }));
}

export async function getServicePlanBySlug(db: DbClient, slug: string): Promise<ServicePlanWithPrices | null> {
  const plan = unwrapMaybe(await db.from('service_plans').select('*').eq('slug', slug).maybeSingle());
  if (!plan) return null;
  const prices = unwrap(await db.from('service_plan_prices').select('*').eq('plan_id', plan.id).order('sort_order'));
  return { ...plan, prices };
}

/** A purchasable plan price (active plan with is_purchasable_online), or null. */
export async function getPurchasablePlanPrice(
  db: DbClient,
  priceId: string,
): Promise<{ plan: ServicePlanRow; price: ServicePlanPriceRow } | null> {
  const price = unwrapMaybe(await db.from('service_plan_prices').select('*').eq('id', priceId).maybeSingle());
  if (!price) return null;
  const plan = unwrapMaybe(
    await db
      .from('service_plans')
      .select('*')
      .eq('id', price.plan_id)
      .eq('is_active', true)
      .eq('is_purchasable_online', true)
      .maybeSingle(),
  );
  return plan ? { plan, price } : null;
}

// Benefits shop ---------------------------------------------------------------------

export type ProductDetailSection = { title: string; html: string };

export function parseProductDetails(value: Json): ProductDetailSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === 'object' && !Array.isArray(item) && typeof item.title === 'string' && typeof item.html === 'string'
      ? [{ title: item.title, html: item.html }]
      : [],
  );
}

export async function listPublishedProducts(db: DbClient, opts: { categoryId?: string } = {}): Promise<ProductRow[]> {
  if (opts.categoryId) {
    const rows = unwrap(
      await db.from('product_category_assignments').select('product_id').eq('category_id', opts.categoryId),
    );
    if (rows.length === 0) return [];
    return unwrap(
      await db
        .from('products')
        .select('*')
        .eq('status', 'published')
        .in('id', rows.map((r) => r.product_id))
        .order('sort_order')
        .order('name'),
    );
  }
  return unwrap(await db.from('products').select('*').eq('status', 'published').order('sort_order').order('name'));
}

export async function getPublishedProductBySlug(db: DbClient, slug: string): Promise<ProductRow | null> {
  return unwrapMaybe(
    await db.from('products').select('*').eq('slug', slug).eq('status', 'published').maybeSingle(),
  );
}

export async function listProductCategories(
  db: DbClient,
  opts: { taxonomy?: ProductTaxonomy } = {},
): Promise<ProductCategoryRow[]> {
  let query = db.from('product_categories').select('*').order('sort_order').order('name');
  if (opts.taxonomy) query = query.eq('taxonomy', opts.taxonomy);
  return unwrap(await query);
}

export async function getProductCategoryBySlug(
  db: DbClient,
  slug: string,
  taxonomy?: ProductTaxonomy,
): Promise<ProductCategoryRow | null> {
  let query = db.from('product_categories').select('*').eq('slug', slug);
  if (taxonomy) query = query.eq('taxonomy', taxonomy);
  return unwrapMaybe(await query.maybeSingle());
}

/** Categories a product belongs to (both taxonomies). */
export async function listCategoriesForProduct(db: DbClient, productId: string): Promise<ProductCategoryRow[]> {
  const rows = unwrap(
    await db.from('product_category_assignments').select('category_id').eq('product_id', productId),
  );
  if (rows.length === 0) return [];
  return unwrap(
    await db
      .from('product_categories')
      .select('*')
      .in('id', rows.map((r) => r.category_id))
      .order('sort_order'),
  );
}

// Cart pricing ----------------------------------------------------------------------

export type PricedCartLine = {
  kind: 'product' | 'service_plan';
  /** products.id or service_plan_prices.id (the cart item id). */
  id: string;
  name: string;
  href: string | null;
  image: string | null;
  quantity: number;
  unitPriceAgorot: number;
  vatIncluded: boolean;
  lineTotalAgorot: number;
};

export type PricedCart = {
  lines: PricedCartLine[];
  /** Cart item ids that are no longer available (removed from pricing). */
  unavailable: string[];
  totals: OrderTotals;
};

/**
 * Price a cookie cart from the DB. Unavailable items (unpublished product,
 * not purchasable, plan not sold online) are dropped and reported.
 */
export async function priceCart(db: DbClient, cart: Cart, vatRate = VAT_RATE): Promise<PricedCart> {
  const productIds = cart.items.filter((i) => i.kind === 'product').map((i) => i.id);
  const priceIds = cart.items.filter((i) => i.kind === 'service_plan').map((i) => i.id);

  const [products, prices] = await Promise.all([
    productIds.length
      ? db.from('products').select('*').in('id', productIds).eq('status', 'published').eq('is_purchasable', true)
      : Promise.resolve({ data: [] as ProductRow[], error: null }),
    priceIds.length
      ? db.from('service_plan_prices').select('*').in('id', priceIds)
      : Promise.resolve({ data: [] as ServicePlanPriceRow[], error: null }),
  ]);
  const productById = new Map(unwrap(products).map((p) => [p.id, p]));
  const priceRows = unwrap(prices);
  const planIds = Array.from(new Set(priceRows.map((p) => p.plan_id)));
  const plans = planIds.length
    ? unwrap(
        await db
          .from('service_plans')
          .select('*')
          .in('id', planIds)
          .eq('is_active', true)
          .eq('is_purchasable_online', true),
      )
    : [];
  const planById = new Map(plans.map((p) => [p.id, p]));
  const priceById = new Map(priceRows.map((p) => [p.id, p]));

  const lines: PricedCartLine[] = [];
  const unavailable: string[] = [];
  for (const item of cart.items) {
    if (item.kind === 'product') {
      const p = productById.get(item.id);
      if (!p) {
        unavailable.push(item.id);
        continue;
      }
      const unit = effectivePrice(p);
      lines.push({
        kind: 'product',
        id: p.id,
        name: p.name,
        href: `/product/${p.slug}/`,
        image: p.featured_image,
        quantity: item.quantity,
        unitPriceAgorot: unit,
        vatIncluded: true,
        lineTotalAgorot: unit * item.quantity,
      });
    } else {
      const price = priceById.get(item.id);
      const plan = price ? planById.get(price.plan_id) : undefined;
      if (!price || !plan) {
        unavailable.push(item.id);
        continue;
      }
      lines.push({
        kind: 'service_plan',
        id: price.id,
        name: servicePlanLineName(plan, price),
        href: '/membership-tiers/',
        image: null,
        quantity: 1,
        unitPriceAgorot: price.price_agorot,
        vatIncluded: price.vat_included,
        lineTotalAgorot: price.price_agorot,
      });
    }
  }
  const totals = computeOrderTotals(
    lines.map((l) => ({ quantity: l.quantity, unitPriceAgorot: l.unitPriceAgorot, vatIncluded: l.vatIncluded })),
    vatRate,
  );
  return { lines, unavailable, totals };
}

function servicePlanLineName(plan: ServicePlanRow, price: ServicePlanPriceRow): string {
  return price.label ? `${plan.name} — ${price.label}` : plan.name;
}

// Orders (member read) -----------------------------------------------------------

export type OrderWithItems = OrderRow & { items: OrderItemRow[]; payments: PaymentRow[] };

export async function listMyOrders(db: DbClient, userId: string): Promise<OrderRow[]> {
  return unwrap(await db.from('orders').select('*').eq('member_id', userId).order('created_at', { ascending: false }));
}

export async function listOrderItems(db: DbClient, orderIds: string[]): Promise<OrderItemRow[]> {
  if (orderIds.length === 0) return [];
  return unwrap(await db.from('order_items').select('*').in('order_id', orderIds).order('created_at'));
}

export async function getOrderWithItems(db: DbClient, orderId: string): Promise<OrderWithItems | null> {
  const order = unwrapMaybe(await db.from('orders').select('*').eq('id', orderId).maybeSingle());
  if (!order) return null;
  const [items, payments] = await Promise.all([
    db.from('order_items').select('*').eq('order_id', orderId).order('created_at'),
    db.from('payments').select('*').eq('order_id', orderId).order('created_at'),
  ]);
  return { ...order, items: unwrap(items), payments: unwrap(payments) };
}

export type MemberServicePlan = {
  orderId: string;
  orderNumber: number;
  paidAt: string | null;
  planName: string;
  description: string;
};

/** Service plans the member has paid for (account area "my plan"). RLS: own orders. */
export async function listMyPaidServicePlans(db: DbClient, userId: string): Promise<MemberServicePlan[]> {
  const orders = unwrap(
    await db.from('orders').select('*').eq('member_id', userId).eq('status', 'paid').order('paid_at', { ascending: false }),
  );
  if (orders.length === 0) return [];
  const items = unwrap(
    await db
      .from('order_items')
      .select('*')
      .in('order_id', orders.map((o) => o.id))
      .not('service_plan_price_id', 'is', null),
  );
  if (items.length === 0) return [];
  const prices = unwrap(
    await db
      .from('service_plan_prices')
      .select('*')
      .in('id', items.map((i) => i.service_plan_price_id as string)),
  );
  const plans = unwrap(
    await db.from('service_plans').select('*').in('id', Array.from(new Set(prices.map((p) => p.plan_id)))),
  );
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const priceById = new Map(prices.map((p) => [p.id, p]));
  const planById = new Map(plans.map((p) => [p.id, p]));
  return items.flatMap((item) => {
    const order = orderById.get(item.order_id);
    const price = item.service_plan_price_id ? priceById.get(item.service_plan_price_id) : undefined;
    const plan = price ? planById.get(price.plan_id) : undefined;
    if (!order) return [];
    return [
      {
        orderId: order.id,
        orderNumber: order.order_number,
        paidAt: order.paid_at,
        planName: plan?.name ?? item.description,
        description: item.description,
      },
    ];
  });
}

// Checkout (service role) ------------------------------------------------------------

export type CartLine =
  | { kind: 'product'; productId: string; quantity: number }
  | { kind: 'service_plan'; priceId: string };

/** Convert cookie-cart items to checkout lines. */
export function cartToLines(cart: Cart): CartLine[] {
  return cart.items.map((it) =>
    it.kind === 'product'
      ? { kind: 'product', productId: it.id, quantity: it.quantity }
      : { kind: 'service_plan', priceId: it.id },
  );
}

/**
 * Create a pending order with server-side prices. Use the service-role client.
 * Throws if any line refers to an unavailable / non-purchasable item.
 * Product prices are VAT-inclusive (WooCommerce); service-plan prices are
 * ex-VAT, so VAT is added for them (VAT_RATE).
 */
export async function createPendingOrder(
  adminDb: DbClient,
  input: {
    memberId: string | null;
    customer: { name: string; email: string; phone?: string | null };
    lines: CartLine[];
    billing?: Json;
    notes?: string | null;
    vatRate?: number;
  },
): Promise<OrderWithItems> {
  if (input.lines.length === 0) throw new Error('Cart is empty');

  const items: Array<Omit<OrderItemRow, 'id' | 'order_id' | 'total_agorot' | 'created_at'> & { vatIncluded: boolean }> =
    [];
  for (const line of input.lines) {
    if (line.kind === 'product') {
      const product = unwrapMaybe(
        await adminDb
          .from('products')
          .select('*')
          .eq('id', line.productId)
          .eq('status', 'published')
          .eq('is_purchasable', true)
          .maybeSingle(),
      );
      if (!product) throw new Error(`Product unavailable: ${line.productId}`);
      items.push({
        product_id: product.id,
        service_plan_price_id: null,
        description: product.name,
        quantity: Math.max(1, Math.floor(line.quantity)),
        unit_price_agorot: effectivePrice(product),
        vatIncluded: true,
      });
    } else {
      const found = await getPurchasablePlanPrice(adminDb, line.priceId);
      if (!found) throw new Error(`Service plan not purchasable online: ${line.priceId}`);
      items.push({
        product_id: null,
        service_plan_price_id: found.price.id,
        description: servicePlanLineName(found.plan, found.price),
        quantity: 1,
        unit_price_agorot: found.price.price_agorot,
        vatIncluded: found.price.vat_included,
      });
    }
  }

  const totals = computeOrderTotals(
    items.map((i) => ({ quantity: i.quantity, unitPriceAgorot: i.unit_price_agorot, vatIncluded: i.vatIncluded })),
    input.vatRate ?? VAT_RATE,
  );
  const order = unwrap(
    await adminDb
      .from('orders')
      .insert({
        member_id: input.memberId,
        customer_name: input.customer.name,
        customer_email: input.customer.email,
        customer_phone: input.customer.phone ?? null,
        subtotal_agorot: totals.subtotalAgorot,
        vat_agorot: totals.vatAgorot,
        total_agorot: totals.totalAgorot,
        billing: input.billing ?? {},
        notes: input.notes ?? null,
      })
      .select('*')
      .single(),
  );
  const inserted = unwrap(
    await adminDb
      .from('order_items')
      .insert(items.map(({ vatIncluded: _vat, ...i }) => ({ ...i, order_id: order.id })))
      .select('*'),
  );
  return { ...order, items: inserted, payments: [] };
}

/** Record a checkout attempt at the provider (service role). */
export async function createPaymentAttempt(
  adminDb: DbClient,
  input: { orderId: string; provider: PaymentProviderName; providerRef: string; amountAgorot: number },
): Promise<PaymentRow> {
  return unwrap(
    await adminDb
      .from('payments')
      .insert({
        order_id: input.orderId,
        provider: input.provider,
        provider_ref: input.providerRef,
        amount_agorot: input.amountAgorot,
      })
      .select('*')
      .single(),
  );
}

/** Mark an order whose checkout could not start (provider error) as failed. */
export async function markOrderFailed(adminDb: DbClient, orderId: string): Promise<void> {
  const { error } = await adminDb.from('orders').update({ status: 'failed' }).eq('id', orderId).eq('status', 'pending');
  if (error) throw new Error(error.message);
}

/**
 * Apply a verified provider result (return URL or webhook). Idempotent:
 * replaying the same result writes nothing; the success-after-success race
 * between the browser return and the webhook is safe because order updates
 * are conditional on the status we read (compare-and-set). Rejects amount
 * mismatches (PaymentAmountMismatchError). See lib/commerce/payment-transitions.
 */
export async function applyPaymentResult(
  adminDb: DbClient,
  input: {
    provider: PaymentProviderName;
    providerRef: string;
    status: PaymentStatus;
    amountAgorot?: number | null;
    raw?: Json;
    errorMessage?: string | null;
  },
): Promise<{ payment: PaymentRow; order: OrderRow; changed: boolean }> {
  const payment = unwrapMaybe(
    await adminDb
      .from('payments')
      .select('*')
      .eq('provider', input.provider)
      .eq('provider_ref', input.providerRef)
      .maybeSingle(),
  );
  if (!payment) throw new Error(`Unknown payment ${input.provider}:${input.providerRef}`);
  const order = unwrap(await adminDb.from('orders').select('*').eq('id', payment.order_id).single());

  const next = decidePaymentTransition(
    { status: payment.status, amountAgorot: payment.amount_agorot },
    { status: order.status },
    { status: input.status, amountAgorot: input.amountAgorot },
  );

  let updatedPayment = payment;
  if (next.payment) {
    const res = await adminDb
      .from('payments')
      .update({ status: next.payment, raw: input.raw ?? null, error_message: input.errorMessage ?? null })
      .eq('id', payment.id)
      .eq('status', payment.status)
      .select('*')
      .maybeSingle();
    updatedPayment = unwrapMaybe(res) ?? unwrap(await adminDb.from('payments').select('*').eq('id', payment.id).single());
  }

  let updatedOrder = order;
  if (next.order) {
    const res = await adminDb
      .from('orders')
      .update({ status: next.order, paid_at: next.order === 'paid' ? new Date().toISOString() : order.paid_at })
      .eq('id', order.id)
      .eq('status', order.status)
      .select('*')
      .maybeSingle();
    updatedOrder = unwrapMaybe(res) ?? unwrap(await adminDb.from('orders').select('*').eq('id', order.id).single());
  }

  return { payment: updatedPayment, order: updatedOrder, changed: Boolean(next.payment || next.order) };
}
