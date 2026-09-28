/**
 * Professionals directory ("נבחרת המומלצים"): businesses at /business/<slug>/,
 * specialties, work regions, and gated contact details.
 *
 * RLS: public reads published listings; owners read/update their own (the
 * businesses_guard trigger keeps slug/status/tier/routing/ranking out of
 * their reach); any signed-in user may submit a listing (forced 'pending').
 *
 * Phone numbers are lead-gated (live-site model): business_contacts is never
 * publicly readable. A server route records a 'business_contact' lead and
 * then calls revealBusinessContact() with the service-role client.
 */
import { type DbClient, type Paginated, pageRange, unwrap, unwrapMaybe, check } from './client';
import type {
  BusinessContactRow,
  BusinessRow,
  GalleryImage,
  Json,
  RegionRow,
  SpecialtyRow,
  TablesInsert,
  TablesUpdate,
} from './types';

export type BusinessSummary = Pick<
  BusinessRow,
  'id' | 'slug' | 'name' | 'tagline' | 'logo_url' | 'city' | 'primary_specialty_id' | 'is_featured' | 'sort_order'
>;

export type BusinessDetail = BusinessRow & {
  specialties: SpecialtyRow[];
  regions: RegionRow[];
};

/** Fields an owner may edit (others are ignored by the DB guard anyway). */
export type OwnerBusinessPatch = Partial<
  Pick<
    BusinessRow,
    | 'name'
    | 'tagline'
    | 'description_html'
    | 'primary_specialty_id'
    | 'city'
    | 'address'
    | 'website'
    | 'logo_url'
    | 'cover_image_url'
    | 'gallery'
    | 'social_links'
    | 'extra_links'
    | 'youtube_ids'
  >
>;

export type OwnerContactPatch = Partial<
  Pick<BusinessContactRow, 'phone' | 'whatsapp' | 'email' | 'other_phones' | 'lead_email'>
>;

const SUMMARY_COLUMNS = 'id, slug, name, tagline, logo_url, city, primary_specialty_id, is_featured, sort_order';

/**
 * Gallery images, flat. Accepts both stored shapes: [{url, alt}] (portal and
 * admin) and the migrated WordPress albums [{name, images: [url, ...]}].
 */
export function parseGallery(value: Json): GalleryImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): GalleryImage[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    if (typeof item.url === 'string') {
      return [{ url: item.url, alt: typeof item.alt === 'string' ? item.alt : null }];
    }
    if (Array.isArray(item.images)) {
      const album = typeof item.name === 'string' && item.name ? item.name : null;
      return item.images.flatMap((img): GalleryImage[] =>
        typeof img === 'string' ? [{ url: img, alt: album }] : [],
      );
    }
    return [];
  });
}

// Lookups -----------------------------------------------------------------------

export async function listSpecialties(db: DbClient): Promise<SpecialtyRow[]> {
  return unwrap(await db.from('specialties').select('*').order('sort_order').order('name'));
}

export async function getSpecialtyBySlug(db: DbClient, slug: string): Promise<SpecialtyRow | null> {
  return unwrapMaybe(await db.from('specialties').select('*').eq('slug', slug).maybeSingle());
}

async function loadRelations(db: DbClient, business: BusinessRow): Promise<BusinessDetail> {
  const [specialtyRows, regionRows] = await Promise.all([
    db.from('business_specialties').select('specialties(*)').eq('business_id', business.id),
    db.from('business_regions').select('regions(*)').eq('business_id', business.id),
  ]);
  return {
    ...business,
    specialties: unwrap(specialtyRows).flatMap((r) => (r.specialties ? [r.specialties] : [])),
    regions: unwrap(regionRows)
      .flatMap((r) => (r.regions ? [r.regions] : []))
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

// Public -----------------------------------------------------------------------

export async function getPublishedBusinessBySlug(db: DbClient, slug: string): Promise<BusinessDetail | null> {
  const business = unwrapMaybe(
    await db.from('businesses').select('*').eq('slug', slug).eq('status', 'published').maybeSingle(),
  );
  return business ? loadRelations(db, business) : null;
}

/**
 * Directory search, in live listing order (sort_order). A region filter also
 * matches businesses that serve "כל הארץ" unless includeNationwide = false.
 */
export async function listPublishedBusinesses(
  db: DbClient,
  opts: {
    page?: number;
    pageSize?: number;
    specialtyId?: string;
    regionId?: string;
    includeNationwide?: boolean;
    search?: string;
  } = {},
): Promise<Paginated<BusinessSummary>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 24;
  const { from, to } = pageRange(page, pageSize);

  let ids: string[] | null = null;
  if (opts.specialtyId) {
    const rows = unwrap(
      await db.from('business_specialties').select('business_id').eq('specialty_id', opts.specialtyId),
    );
    ids = rows.map((r) => r.business_id);
  }
  if (opts.regionId) {
    const regionIds = [opts.regionId];
    if (opts.includeNationwide !== false) {
      const nationwide = unwrap(await db.from('regions').select('id').eq('is_nationwide', true));
      regionIds.push(...nationwide.map((r) => r.id));
    }
    const rows = unwrap(await db.from('business_regions').select('business_id').in('region_id', regionIds));
    const inRegion = new Set(rows.map((r) => r.business_id));
    ids = ids ? ids.filter((id) => inRegion.has(id)) : Array.from(inRegion);
  }
  if (ids && ids.length === 0) return { items: [], total: 0, page, pageSize };

  let query = db
    .from('businesses')
    .select(SUMMARY_COLUMNS, { count: 'exact' })
    .eq('status', 'published')
    .order('is_featured', { ascending: false })
    .order('sort_order')
    .order('name')
    .range(from, to);
  if (ids) query = query.in('id', ids);
  if (opts.search) query = query.ilike('name', `%${opts.search}%`);
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

export async function listPublishedBusinessSlugs(
  db: DbClient,
): Promise<Array<Pick<BusinessRow, 'slug' | 'updated_at'>>> {
  return unwrap(await db.from('businesses').select('slug, updated_at').eq('status', 'published').order('slug'));
}

// Gated contact reveal (SERVICE ROLE) ----------------------------------------------

export type RevealedContact = {
  phone: string | null;
  whatsapp: string | null;
  otherPhones: string[];
  /** Where the lead should be forwarded: the business (direct) or null = site inbox. */
  forwardTo: string | null;
};

/**
 * Contact details for a published business, after the caller recorded a
 * 'business_contact' lead. Requires the service-role client (RLS hides
 * business_contacts from the public).
 */
export async function revealBusinessContact(adminDb: DbClient, businessId: string): Promise<RevealedContact | null> {
  const business = unwrapMaybe(
    await adminDb
      .from('businesses')
      .select('id, lead_routing')
      .eq('id', businessId)
      .eq('status', 'published')
      .maybeSingle(),
  );
  if (!business) return null;
  const contact = unwrapMaybe(
    await adminDb.from('business_contacts').select('*').eq('business_id', businessId).maybeSingle(),
  );
  return {
    phone: contact?.phone ?? null,
    whatsapp: contact?.whatsapp ?? null,
    otherPhones: contact?.other_phones ?? [],
    forwardTo: business.lead_routing === 'direct' ? contact?.lead_email ?? null : null,
  };
}

// Owner (pro) -------------------------------------------------------------------

export async function listOwnedBusinesses(db: DbClient, userId: string): Promise<BusinessRow[]> {
  return unwrap(await db.from('businesses').select('*').eq('owner_member_id', userId).order('created_at'));
}

/** Join-as-pro submission: created as 'pending' for moderation. */
export async function submitBusiness(
  db: DbClient,
  input: Pick<BusinessRow, 'slug' | 'name'> & OwnerBusinessPatch,
): Promise<BusinessRow> {
  return unwrap(await db.from('businesses').insert(input).select('*').single());
}

export async function updateOwnedBusiness(db: DbClient, id: string, patch: OwnerBusinessPatch): Promise<BusinessRow> {
  return unwrap(await db.from('businesses').update(patch).eq('id', id).select('*').single());
}

/** Owner or staff: read private contacts. */
export async function getBusinessContacts(db: DbClient, businessId: string): Promise<BusinessContactRow | null> {
  return unwrapMaybe(await db.from('business_contacts').select('*').eq('business_id', businessId).maybeSingle());
}

/** Owner or staff: create/update private contacts. */
export async function saveBusinessContacts(
  db: DbClient,
  businessId: string,
  patch: OwnerContactPatch,
): Promise<BusinessContactRow> {
  return unwrap(
    await db
      .from('business_contacts')
      .upsert({ business_id: businessId, ...patch }, { onConflict: 'business_id' })
      .select('*')
      .single(),
  );
}

/** Replace specialties of a business (owner or staff). */
export async function setBusinessSpecialties(db: DbClient, businessId: string, specialtyIds: string[]): Promise<void> {
  check(await db.from('business_specialties').delete().eq('business_id', businessId));
  if (specialtyIds.length === 0) return;
  check(
    await db
      .from('business_specialties')
      .insert(specialtyIds.map((specialty_id) => ({ business_id: businessId, specialty_id }))),
  );
}

/** Replace work regions of a business (owner or staff). */
export async function setBusinessRegions(db: DbClient, businessId: string, regionIds: string[]): Promise<void> {
  check(await db.from('business_regions').delete().eq('business_id', businessId));
  if (regionIds.length === 0) return;
  check(
    await db.from('business_regions').insert(regionIds.map((region_id) => ({ business_id: businessId, region_id }))),
  );
}

// Admin -----------------------------------------------------------------------

export async function listBusinessesForAdmin(
  db: DbClient,
  opts: { page?: number; pageSize?: number; status?: BusinessRow['status']; search?: string } = {},
): Promise<Paginated<BusinessRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const { from, to } = pageRange(page, pageSize);
  let query = db
    .from('businesses')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (opts.status) query = query.eq('status', opts.status);
  if (opts.search) query = query.ilike('name', `%${opts.search}%`);
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

export async function getBusinessById(db: DbClient, id: string): Promise<BusinessDetail | null> {
  const business = unwrapMaybe(await db.from('businesses').select('*').eq('id', id).maybeSingle());
  return business ? loadRelations(db, business) : null;
}

export async function createBusiness(db: DbClient, input: TablesInsert<'businesses'>): Promise<BusinessRow> {
  return unwrap(await db.from('businesses').insert(input).select('*').single());
}

export async function updateBusiness(db: DbClient, id: string, patch: TablesUpdate<'businesses'>): Promise<BusinessRow> {
  return unwrap(await db.from('businesses').update(patch).eq('id', id).select('*').single());
}

export async function saveSpecialty(
  db: DbClient,
  input: TablesInsert<'specialties'> & { id?: string },
): Promise<SpecialtyRow> {
  return unwrap(await db.from('specialties').upsert(input).select('*').single());
}

// Directory listing (Wave 2) ------------------------------------------------------

/** One business as used by the /recommended/ listing (filtering happens in memory). */
export type DirectoryEntry = Pick<
  BusinessRow,
  | 'id'
  | 'slug'
  | 'name'
  | 'tagline'
  | 'description_html'
  | 'logo_url'
  | 'cover_image_url'
  | 'city'
  | 'primary_specialty_id'
  | 'is_featured'
  | 'sort_order'
  | 'owner_member_id'
> & {
  specialtyIds: string[];
  regionIds: string[];
};

const DIRECTORY_COLUMNS =
  'id, slug, name, tagline, description_html, logo_url, cover_image_url, city, primary_specialty_id, is_featured, sort_order, owner_member_id';

/** PostgREST caps responses (max_rows, 1000 by default): page through join tables. */
async function selectAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = unwrap(await fetchPage(from, from + pageSize - 1));
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/**
 * Every published business with its specialty and region ids. The directory
 * has ~160 listings, so the listing filters and sorts in memory. That keeps
 * multi-filter + rating sort simple, with one round trip per table.
 */
export async function listDirectoryEntries(db: DbClient): Promise<DirectoryEntry[]> {
  const [businesses, specialtyLinks, regionLinks] = await Promise.all([
    selectAllPages((from, to) =>
      db.from('businesses').select(DIRECTORY_COLUMNS).eq('status', 'published').order('sort_order').range(from, to),
    ),
    selectAllPages((from, to) =>
      db
        .from('business_specialties')
        .select('business_id, specialty_id')
        .order('business_id')
        .order('specialty_id')
        .range(from, to),
    ),
    selectAllPages((from, to) =>
      db.from('business_regions').select('business_id, region_id').order('business_id').order('region_id').range(from, to),
    ),
  ]);
  const specialtiesBy = new Map<string, string[]>();
  specialtyLinks.forEach((link) => {
    specialtiesBy.set(link.business_id, [...(specialtiesBy.get(link.business_id) ?? []), link.specialty_id]);
  });
  const regionsBy = new Map<string, string[]>();
  regionLinks.forEach((link) => {
    regionsBy.set(link.business_id, [...(regionsBy.get(link.business_id) ?? []), link.region_id]);
  });
  return businesses.map((b) => ({
    ...b,
    specialtyIds: specialtiesBy.get(b.id) ?? [],
    regionIds: regionsBy.get(b.id) ?? [],
  }));
}

export async function listRegions(db: DbClient): Promise<RegionRow[]> {
  return unwrap(await db.from('regions').select('*').order('sort_order'));
}

// Business-page leads (Wave 2, SERVICE ROLE) -------------------------------------------

/**
 * Recent business_contact leads from one hashed IP, overall and for one
 * business. Rate-limits the phone reveal so numbers can't be scraped.
 */
export async function countRecentContactLeads(
  adminDb: DbClient,
  ipHash: string,
  businessId: string,
  sinceIso: string,
): Promise<{ total: number; forBusiness: number }> {
  const base = () =>
    adminDb
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'business_contact')
      .eq('ip_hash', ipHash)
      .gte('created_at', sinceIso);
  const [total, forBusiness] = await Promise.all([base(), base().eq('business_id', businessId)]);
  check(total);
  check(forBusiness);
  return { total: total.count ?? 0, forBusiness: forBusiness.count ?? 0 };
}

/** Is this slug used by any business, whatever its status? (SERVICE ROLE) */
export async function isBusinessSlugTaken(adminDb: DbClient, slug: string): Promise<boolean> {
  return unwrapMaybe(await adminDb.from('businesses').select('id').eq('slug', slug).maybeSingle()) !== null;
}

/** Recent anonymous (no member) pending reviews of a business: throttles anonymous review spam. */
export async function countRecentAnonymousReviews(adminDb: DbClient, businessId: string, sinceIso: string): Promise<number> {
  const res = await adminDb
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .is('member_id', null)
    .eq('source', 'member')
    .gte('created_at', sinceIso);
  check(res);
  return res.count ?? 0;
}
