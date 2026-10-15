import 'server-only';

/**
 * Supabase clients typed with the revenue schema (lib/revenue/types.ts).
 *
 *   revenueUserDb()    the caller's session: RLS applies (portal, admin pages, actions)
 *   revenuePublicDb()  anonymous and cookie-less: keeps ISR pages static (offers, tiers)
 *   revenueAdminDb()   service role: BYPASSES RLS. Trusted server flows only
 *                      (lead storage, checkout callbacks), after authorizing.
 *   asRevenueDb(db)    view an existing shared client through the revenue types
 *
 * The underlying clients are the shared ones (lib/supabase/*); only the types differ.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { DbClient } from '@/lib/db/client';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/supabase/env';
import type { RevenueDatabase } from './types';

export type RevenueDb = SupabaseClient<RevenueDatabase>;

export function asRevenueDb(db: DbClient | SupabaseClient): RevenueDb {
  return db as unknown as RevenueDb;
}

export function revenueUserDb(): RevenueDb {
  return asRevenueDb(createUserClient());
}

export function revenueAdminDb(): RevenueDb {
  return asRevenueDb(createAdminClient());
}

export { isServiceRoleConfigured };

let publicClient: RevenueDb | null = null;

/** Anonymous client, or null when Supabase isn't configured (callers degrade). */
export function revenuePublicDb(): RevenueDb | null {
  if (!isSupabaseConfigured()) return null;
  if (!publicClient) {
    publicClient = createSupabaseClient<RevenueDatabase>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return publicClient;
}

/** Throw on a PostgREST error; return the data (or the fallback when empty). */
export function must<T>(result: { data: T | null; error: { message: string } | null }, fallback?: T): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null || result.data === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error('Query returned no data');
  }
  return result.data;
}
