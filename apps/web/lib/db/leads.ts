/**
 * Lead capture — every live form becomes a lead (replaces CF7 + Zapier):
 * consultation, contact, advertise, partner, join_pro, business_contact
 * (phone-reveal popup), benefit (product "חזרו אליי"), whatsapp_join,
 * service_plan.
 *
 * Anyone may insert (RLS); workflow fields are reset by the leads_guard
 * trigger for non-staff. Anonymous callers cannot read leads back, so
 * createLead does not `.select()` the inserted row. Flows that reveal gated
 * data (phone, WhatsApp invite) insert the lead first, then call the
 * service-role reveal helpers in businesses.ts / members.ts.
 */
import { type DbClient, type Paginated, pageRange, unwrap, check } from './client';
import type { ConstructionStage, Json, LeadRow, LeadStatus, LeadType, TablesUpdate } from './types';

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
};

export async function createLead(db: DbClient, lead: NewLead): Promise<void> {
  check(
    await db.from('leads').insert({
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
    }),
  );
}

// Staff / business owners ---------------------------------------------------------------

export async function listLeads(
  db: DbClient,
  opts: { page?: number; pageSize?: number; status?: LeadStatus; type?: LeadType; businessId?: string } = {},
): Promise<Paginated<LeadRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const { from, to } = pageRange(page, pageSize);
  let query = db
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (opts.status) query = query.eq('status', opts.status);
  if (opts.type) query = query.eq('type', opts.type);
  if (opts.businessId) query = query.eq('business_id', opts.businessId);
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

export async function updateLead(
  db: DbClient,
  id: string,
  patch: Pick<TablesUpdate<'leads'>, 'status' | 'assigned_to' | 'notes' | 'forwarded_to'>,
): Promise<LeadRow> {
  return unwrap(await db.from('leads').update(patch).eq('id', id).select('*').single());
}
