import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { SUPABASE_URL } from './env';

/**
 * Service-role Supabase client. BYPASSES ROW-LEVEL SECURITY.
 *
 * Use only in trusted server code that has already authorized the caller:
 * checkout/payment callbacks, ADMIN_EMAILS role sync, import scripts.
 * Never import from a Client Component (the `server-only` import enforces it).
 */
export function isServiceRoleConfigured(): boolean {
  return SUPABASE_URL.length > 0 && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').length > 0;
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!SUPABASE_URL || !key) {
    throw new Error(
      'Service-role client unavailable: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
