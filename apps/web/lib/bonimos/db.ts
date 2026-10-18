import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { BonimosDatabase } from './types';

/**
 * Supabase clients typed with the hub and Bonim.Os tables
 * (lib/bonimos/types.ts BonimosDatabase), so the schema stays out of
 * lib/db/types.ts.
 */
export type BonimosDb = SupabaseClient<BonimosDatabase>;

/** The signed-in user's session: RLS applies (project members only). */
export function bonimosUserDb(): BonimosDb {
  return createClient() as unknown as BonimosDb;
}

/** Service role: BYPASSES RLS. Admin screens only, after requireRole('admin'). */
export function bonimosAdminDb(): BonimosDb {
  return createAdminClient() as unknown as BonimosDb;
}
