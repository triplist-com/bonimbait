import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { HubDatabase } from './types';

/**
 * Supabase clients typed with the hub tables (lib/hub/types.ts HubDatabase).
 * The same client also serves the shared tables through lib/db/* when cast
 * back; keep hub queries on these so the hub schema stays out of
 * lib/db/types.ts.
 */
export type HubDb = SupabaseClient<HubDatabase>;

/** The signed-in member's session: RLS applies (project members only). */
export function hubUserDb(): HubDb {
  return createClient() as unknown as HubDb;
}

/** Service role: BYPASSES RLS. Only for trusted server code that already knows the member id. */
export function hubAdminDb(): HubDb {
  return createAdminClient() as unknown as HubDb;
}
