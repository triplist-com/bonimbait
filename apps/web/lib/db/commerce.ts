/**
 * Construction-management service plans (/membership-tiers/), the benefits
 * shop (products + product categories), orders and payments.
 *
 * Catalog reads use the normal server client. Every WRITE to orders,
 * order_items and payments must use the service-role client
 * (createAdminClient) from a route handler that has authenticated the buyer:
 * RLS gives members read-only access so prices/payment state can't be forged.
 * Prices are always re-read from the DB here, never taken from the request.
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
  ServicePlanFeature,
  ServicePlanPriceRow,
  ServicePlanRow,
} from './types';

/** Israeli VAT rate applied to ex-VAT prices (service plans). Override with VAT_RATE. */
export const VAT_RATE = Number(process.env.VAT_RATE ?? 0.18);

/** Format agorot as a Hebrew ILS price, e.g. 690000 -> "‏6,900 ₪". */
export function formatPrice(agorot: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
    maximumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
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

// Benefits shop ---------------------------------------------------------------------

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

export async function listProductCategories(db: DbClient): Promise<ProductCategoryRow[]> {
  return unwrap(await db.from('product_categories').select('*').order('sort_order').order('name'));
}

export async function getProductCategoryBySlug(db: DbClient, slug: string): Promise<ProductCategoryRow | null> {
  return unwrapMaybe(await db.from('product_categories').select('*').eq('slug', slug).maybeSingle());
}

// Orders (member read) -----------------------------------------------------------

export type OrderWithItems = OrderRow & { items: OrderItemRow[]; payments: PaymentRow[] };

export async function listMyOrders(db: DbClient, userId: string): Promise<OrderRow[]> {
  return unwrap(await db.from('orders').select('*').eq('member_id', userId).order('created_at', { ascending: false }));
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

// Checkout (service role) ------------------------------------------------------------

export type CartLine =
  | { kind: 'product'; productId: string; quantity: number }
  | { kind: 'service_plan'; priceId: string };

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
  },
): Promise<OrderWithItems> {
  if (input.lines.length === 0) throw new Error('Cart is empty');

  const items: Array<Omit<OrderItemRow, 'id' | 'order_id' | 'total_agorot' | 'created_at'>> = [];
  let vat = 0;
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
      });
    } else {
      const price = unwrapMaybe(
        await adminDb.from('service_plan_prices').select('*').eq('id', line.priceId).maybeSingle(),
      );
      const plan = price
        ? unwrapMaybe(
            await adminDb
              .from('service_plans')
              .select('*')
              .eq('id', price.plan_id)
              .eq('is_active', true)
              .eq('is_purchasable_online', true)
              .maybeSingle(),
          )
        : null;
      if (!price || !plan) throw new Error(`Service plan not purchasable online: ${line.priceId}`);
      items.push({
        product_id: null,
        service_plan_price_id: price.id,
        description: price.label ? `${plan.name} — ${price.label}` : plan.name,
        quantity: 1,
        unit_price_agorot: price.price_agorot,
      });
      if (!price.vat_included) vat += Math.round(price.price_agorot * VAT_RATE);
    }
  }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price_agorot, 0);
  const order = unwrap(
    await adminDb
      .from('orders')
      .insert({
        member_id: input.memberId,
        customer_name: input.customer.name,
        customer_email: input.customer.email,
        customer_phone: input.customer.phone ?? null,
        subtotal_agorot: subtotal,
        vat_agorot: vat,
        total_agorot: subtotal + vat,
        billing: input.billing ?? {},
        notes: input.notes ?? null,
      })
      .select('*')
      .single(),
  );
  const inserted = unwrap(
    await adminDb
      .from('order_items')
      .insert(items.map((i) => ({ ...i, order_id: order.id })))
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

/**
 * Apply a verified provider result (callback/webhook). Idempotent: repeating
 * the same result is a no-op. Rejects amount mismatches. Returns the updated
 * payment and order.
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
): Promise<{ payment: PaymentRow; order: OrderRow }> {
  const payment = unwrapMaybe(
    await adminDb
      .from('payments')
      .select('*')
      .eq('provider', input.provider)
      .eq('provider_ref', input.providerRef)
      .maybeSingle(),
  );
  if (!payment) throw new Error(`Unknown payment ${input.provider}:${input.providerRef}`);
  if (input.status === 'succeeded' && input.amountAgorot != null && input.amountAgorot !== payment.amount_agorot) {
    throw new Error(`Amount mismatch for ${input.providerRef}: ${input.amountAgorot} != ${payment.amount_agorot}`);
  }

  const updatedPayment =
    payment.status === input.status
      ? payment
      : unwrap(
          await adminDb
            .from('payments')
            .update({ status: input.status, raw: input.raw ?? null, error_message: input.errorMessage ?? null })
            .eq('id', payment.id)
            .select('*')
            .single(),
        );

  const order = unwrap(await adminDb.from('orders').select('*').eq('id', payment.order_id).single());
  let nextStatus: OrderRow['status'] | null = null;
  if (input.status === 'succeeded' && order.status !== 'paid' && order.status !== 'refunded') nextStatus = 'paid';
  if (input.status === 'failed' && order.status === 'pending') nextStatus = 'failed';
  if (input.status === 'refunded' && order.status === 'paid') nextStatus = 'refunded';

  const updatedOrder = nextStatus
    ? unwrap(
        await adminDb
          .from('orders')
          .update({ status: nextStatus, paid_at: nextStatus === 'paid' ? new Date().toISOString() : order.paid_at })
          .eq('id', order.id)
          .select('*')
          .single(),
      )
    : order;

  return { payment: updatedPayment, order: updatedOrder };
}
