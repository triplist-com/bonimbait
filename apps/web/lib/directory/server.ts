import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from '@/lib/supabase/env';

/**
 * Anonymous, cookie-less Supabase client for public directory reads. RLS
 * applies as `anon`. Unlike lib/supabase/server it doesn't touch cookies, so
 * pages that use it can be statically cached (ISR).
 */
export function createPublicClient() {
  assertSupabaseConfigured();
  return createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
