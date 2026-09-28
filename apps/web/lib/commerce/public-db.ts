import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { DbClient } from '@/lib/db/client';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/supabase/env';

let cached: DbClient | null = null;

/**
 * Anonymous, cookie-less client for public catalog reads (products, product
 * categories, service plans; RLS: published/active only). Unlike the session
 * client it doesn't touch cookies(), so it is safe inside statically
 * rendered / ISR pages such as the /הטבות-לקהילה/ special page rendered by
 * the root [slug] route.
 */
export function createPublicClient(): DbClient | null {
  if (!isSupabaseConfigured()) return null;
  cached ??= createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
