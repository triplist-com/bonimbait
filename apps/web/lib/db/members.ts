/**
 * Member profiles, roles, regions and WhatsApp community groups.
 * Members may update only their own profile (RLS); role changes are admin-only
 * (DB trigger profiles_guard_role).
 */
import { type DbClient, type Paginated, pageRange, unwrap, unwrapMaybe } from './client';
import type { ProfileRow, RegionRow, Role, WhatsappGroupPublicRow } from './types';

/** Fields a member may edit on their own profile. */
export type OwnProfilePatch = Partial<
  Pick<ProfileRow, 'full_name' | 'phone' | 'construction_stage' | 'region_id' | 'whatsapp_opt_in' | 'avatar_url'>
>;

// Regions -----------------------------------------------------------------------

/** Master region list. Members pick from the 13 non-nationwide regions. */
export async function listRegions(db: DbClient, opts: { includeNationwide?: boolean } = {}): Promise<RegionRow[]> {
  let query = db.from('regions').select('*').order('sort_order');
  if (!opts.includeNationwide) query = query.eq('is_nationwide', false);
  return unwrap(await query);
}

export async function getRegionBySlug(db: DbClient, slug: string): Promise<RegionRow | null> {
  return unwrapMaybe(await db.from('regions').select('*').eq('slug', slug).maybeSingle());
}

/** Map any live label ("אזור מרכז", "עכו - נהריה", slug, ...) to a region id. */
export async function resolveRegionId(db: DbClient, label: string): Promise<string | null> {
  const { data, error } = await db.rpc('resolve_region', { label });
  if (error) throw new Error(error.message);
  return data ?? null;
}

// WhatsApp groups ---------------------------------------------------------------------

/** Group names for the join form (no invite links — those are lead-gated). */
export async function listWhatsappGroups(db: DbClient): Promise<WhatsappGroupPublicRow[]> {
  return unwrap(await db.from('whatsapp_groups_public').select('*').order('sort_order'));
}

/**
 * Invite link for a group, after the caller recorded a 'whatsapp_join' lead.
 * Requires the service-role client (the base table is not publicly readable).
 */
export async function revealWhatsappInvite(
  adminDb: DbClient,
  by: { groupId: string } | { regionId: string },
): Promise<{ groupId: string; name: string; inviteUrl: string } | null> {
  let groupId: string | null = 'groupId' in by ? by.groupId : null;
  if (!groupId && 'regionId' in by) {
    const region = unwrapMaybe(
      await adminDb.from('regions').select('whatsapp_group_id').eq('id', by.regionId).maybeSingle(),
    );
    groupId = region?.whatsapp_group_id ?? null;
  }
  if (!groupId) return null;
  const group = unwrapMaybe(
    await adminDb.from('whatsapp_groups').select('*').eq('id', groupId).eq('is_active', true).maybeSingle(),
  );
  return group ? { groupId: group.id, name: group.name, inviteUrl: group.invite_url } : null;
}

// Profiles -----------------------------------------------------------------------

export async function getProfileById(db: DbClient, id: string): Promise<ProfileRow | null> {
  return unwrapMaybe(await db.from('profiles').select('*').eq('id', id).maybeSingle());
}

export async function updateOwnProfile(db: DbClient, userId: string, patch: OwnProfilePatch): Promise<ProfileRow> {
  // Whitelist fields explicitly so a spread of form data can't touch role/email.
  const safe: OwnProfilePatch = {};
  if (patch.full_name !== undefined) safe.full_name = patch.full_name;
  if (patch.phone !== undefined) safe.phone = patch.phone;
  if (patch.construction_stage !== undefined) safe.construction_stage = patch.construction_stage;
  if (patch.region_id !== undefined) safe.region_id = patch.region_id;
  if (patch.whatsapp_opt_in !== undefined) safe.whatsapp_opt_in = patch.whatsapp_opt_in;
  if (patch.avatar_url !== undefined) safe.avatar_url = patch.avatar_url;
  return unwrap(await db.from('profiles').update(safe).eq('id', userId).select('*').single());
}

// Admin -----------------------------------------------------------------------

export async function listMembers(
  db: DbClient,
  opts: { page?: number; pageSize?: number; role?: Role; search?: string; regionId?: string } = {},
): Promise<Paginated<ProfileRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const { from, to } = pageRange(page, pageSize);
  let query = db
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (opts.role) query = query.eq('role', opts.role);
  if (opts.regionId) query = query.eq('region_id', opts.regionId);
  if (opts.search) {
    const term = opts.search.replace(/[%,()]/g, ' ').trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

/** Admin only (enforced by the DB trigger even if called by an editor). */
export async function setMemberRole(db: DbClient, userId: string, role: Role): Promise<ProfileRow> {
  return unwrap(await db.from('profiles').update({ role }).eq('id', userId).select('*').single());
}
