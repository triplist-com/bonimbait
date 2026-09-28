/**
 * Member account area (/account/): the member's own profile and region
 * lookups used by the commerce lead forms. Runs as the signed-in user
 * (RLS: read/update own profile; the DB trigger blocks role changes).
 */
import { type DbClient, unwrap, unwrapMaybe } from './client';
import type { ConstructionStage, ProfileRow } from './types';

export type AccountProfilePatch = {
  full_name: string;
  phone: string | null;
  construction_stage: ConstructionStage | null;
  region_id: string | null;
  whatsapp_opt_in: boolean;
  newsletter_opt_in: boolean;
};

export async function getRegionIdBySlug(db: DbClient, slug: string): Promise<string | null> {
  const row = unwrapMaybe(await db.from('regions').select('id').eq('slug', slug).maybeSingle());
  return row?.id ?? null;
}

export async function getRegionSlugById(db: DbClient, id: string): Promise<string | null> {
  const row = unwrapMaybe(await db.from('regions').select('slug').eq('id', id).maybeSingle());
  return row?.slug ?? null;
}

/** Update the caller's own profile with an explicit column whitelist. */
export async function updateAccountProfile(
  db: DbClient,
  userId: string,
  patch: AccountProfilePatch,
): Promise<ProfileRow> {
  const safe: AccountProfilePatch = {
    full_name: patch.full_name,
    phone: patch.phone,
    construction_stage: patch.construction_stage,
    region_id: patch.region_id,
    whatsapp_opt_in: patch.whatsapp_opt_in,
    newsletter_opt_in: patch.newsletter_opt_in,
  };
  return unwrap(await db.from('profiles').update(safe).eq('id', userId).select('*').single());
}
