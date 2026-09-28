/**
 * Lead capture — every live form becomes a lead (replaces CF7 + Zapier):
 * consultation, contact, advertise, partner, join_pro, business_contact
 * (phone-reveal popup), benefit (product "חזרו אליי"), whatsapp_join,
 * service_plan.
 *
 * Public forms go through `submitLead()` in lib/leads/submit.ts (validation,
 * spam checks, service-role insert, notification). `createLead` is the thin
 * RLS-respecting insert kept for callers that already validated.
 *
 * Anyone may insert (RLS); workflow and notification fields are reset by the
 * leads_guard trigger for non-staff. Anonymous callers cannot read leads back,
 * so createLead does not `.select()` the inserted row.
 */
import { type DbClient, type Paginated, pageRange, unwrap, unwrapMaybe, check } from './client';
import type {
  ConstructionStage,
  Json,
  LeadNotifyStatus,
  LeadRouting,
  LeadRow,
  LeadStatus,
  LeadType,
  TablesInsert,
  TablesUpdate,
} from './types';

export type NewLead = {
  type: LeadType;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  regionId?: string | null;
  constructionStage?: ConstructionStage | null;
  payload?: Json;
  sourceUrl?: string | null;
  utm?: Json;
  businessId?: string | null;
  productId?: string | null;
  servicePlanId?: string | null;
  whatsappGroupId?: string | null;
  memberId?: string | null;
  ipHash?: string | null;
};

function toInsert(lead: NewLead): TablesInsert<'leads'> {
  return {
    type: lead.type,
    full_name: lead.fullName ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    message: lead.message ?? null,
    region_id: lead.regionId ?? null,
    construction_stage: lead.constructionStage ?? null,
    payload: lead.payload ?? {},
    source_url: lead.sourceUrl ?? null,
    utm: lead.utm ?? {},
    business_id: lead.businessId ?? null,
    product_id: lead.productId ?? null,
    service_plan_id: lead.servicePlanId ?? null,
    whatsapp_group_id: lead.whatsappGroupId ?? null,
    member_id: lead.memberId ?? null,
    ip_hash: lead.ipHash ?? null,
  };
}

/** RLS insert (anon/member client). Does not return the row. */
export async function createLead(db: DbClient, lead: NewLead): Promise<void> {
  const row = toInsert(lead);
  delete row.ip_hash; // reserved for the trusted path
  check(await db.from('leads').insert(row));
}

// Trusted (service-role) helpers used by lib/leads ------------------------------------

/** Service-role insert that returns the stored row (for notification + reveal). */
export async function insertLeadTrusted(adminDb: DbClient, lead: NewLead): Promise<LeadRow> {
  return unwrap(await adminDb.from('leads').insert(toInsert(lead)).select('*').single());
}

/** Leads from the same (hashed) IP since `sinceIso`: the rate-limit counter. */
export async function countRecentLeadsByIpHash(adminDb: DbClient, ipHash: string, sinceIso: string): Promise<number> {
  const result = await adminDb
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', sinceIso);
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

export async function getRegionBySlug(
  db: DbClient,
  slug: string,
): Promise<{ id: string; slug: string; name: string; whatsapp_group_id: string | null } | null> {
  return unwrapMaybe(
    await db.from('regions').select('id, slug, name, whatsapp_group_id').eq('slug', slug).maybeSingle(),
  );
}

/** Active WhatsApp group by slug, WITHOUT the invite link (public view). */
export async function getWhatsappGroupBySlug(
  db: DbClient,
  slug: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  return unwrapMaybe(
    await db.from('whatsapp_groups_public').select('id, slug, name').eq('slug', slug).maybeSingle(),
  );
}

/** The 11 area groups for the join form (no invite links). */
export async function listWhatsappGroupsPublic(
  db: DbClient,
): Promise<Array<{ id: string; slug: string; name: string; sort_order: number }>> {
  return unwrap(await db.from('whatsapp_groups_public').select('id, slug, name, sort_order').order('sort_order'));
}

export type LeadRoutingTarget = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  leadRouting: LeadRouting;
  leadEmail: string | null;
};

/** Business routing info for notifications (reads private business_contacts). */
export async function getLeadRoutingTarget(adminDb: DbClient, businessId: string): Promise<LeadRoutingTarget | null> {
  const business = unwrapMaybe(
    await adminDb.from('businesses').select('id, name, slug, lead_routing').eq('id', businessId).maybeSingle(),
  );
  if (!business) return null;
  const contact = unwrapMaybe(
    await adminDb.from('business_contacts').select('lead_email').eq('business_id', businessId).maybeSingle(),
  );
  return {
    businessId: business.id,
    businessName: business.name,
    businessSlug: business.slug,
    leadRouting: business.lead_routing,
    leadEmail: contact?.lead_email ?? null,
  };
}

export async function recordLeadNotification(
  adminDb: DbClient,
  id: string,
  result: { status: LeadNotifyStatus; channels: Json; error: string | null; forwardedTo: string | null },
): Promise<void> {
  check(
    await adminDb
      .from('leads')
      .update({
        notify_status: result.status,
        notify_channels: result.channels,
        notify_error: result.error,
        notified_at: new Date().toISOString(),
        forwarded_to: result.forwardedTo,
      })
      .eq('id', id),
  );
}

// Staff / business owners (Wave 3 admin) -----------------------------------------------

export type LeadListFilter = {
  page?: number;
  pageSize?: number;
  status?: LeadStatus | LeadStatus[];
  type?: LeadType | LeadType[];
  businessId?: string;
  notifyStatus?: LeadNotifyStatus;
  /** ISO timestamp or YYYY-MM-DD, inclusive. */
  from?: string;
  /** ISO timestamp or YYYY-MM-DD; a bare date includes that whole day (UTC). */
  to?: string;
  /** Free-text match on name, email or phone. */
  q?: string;
};

function endOfDay(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
}

/** Newest first. RLS decides what the caller sees (staff: all; pro: own business). */
export async function listLeads(db: DbClient, opts: LeadListFilter = {}): Promise<Paginated<LeadRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const { from, to } = pageRange(page, pageSize);
  let query = db
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (opts.status) query = Array.isArray(opts.status) ? query.in('status', opts.status) : query.eq('status', opts.status);
  if (opts.type) query = Array.isArray(opts.type) ? query.in('type', opts.type) : query.eq('type', opts.type);
  if (opts.businessId) query = query.eq('business_id', opts.businessId);
  if (opts.notifyStatus) query = query.eq('notify_status', opts.notifyStatus);
  if (opts.from) query = query.gte('created_at', opts.from);
  if (opts.to) query = query.lte('created_at', endOfDay(opts.to));
  if (opts.q) {
    // Strip PostgREST filter syntax characters before building the or() filter.
    const term = opts.q.replace(/[,()*%\\]/g, ' ').trim();
    if (term) query = query.or(`full_name.ilike.*${term}*,email.ilike.*${term}*,phone.ilike.*${term}*`);
  }
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

export async function getLeadById(db: DbClient, id: string): Promise<LeadRow | null> {
  return unwrapMaybe(await db.from('leads').select('*').eq('id', id).maybeSingle());
}

/** Counts per status (for admin tabs/badges). */
export async function countLeadsByStatus(
  db: DbClient,
  opts: { type?: LeadType } = {},
): Promise<Record<LeadStatus, number>> {
  const statuses: LeadStatus[] = ['new', 'in_progress', 'qualified', 'closed', 'spam'];
  const counts = await Promise.all(
    statuses.map(async (status) => {
      let q = db.from('leads').select('id', { count: 'exact', head: true }).eq('status', status);
      if (opts.type) q = q.eq('type', opts.type);
      const r = await q;
      if (r.error) throw new Error(r.error.message);
      return [status, r.count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<LeadStatus, number>;
}

export async function updateLeadStatus(db: DbClient, id: string, status: LeadStatus): Promise<LeadRow> {
  return updateLead(db, id, { status });
}

export async function updateLead(
  db: DbClient,
  id: string,
  patch: Pick<TablesUpdate<'leads'>, 'status' | 'assigned_to' | 'notes' | 'forwarded_to'>,
): Promise<LeadRow> {
  return unwrap(await db.from('leads').update(patch).eq('id', id).select('*').single());
}
