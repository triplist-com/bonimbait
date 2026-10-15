import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/supabase/env';
import type { PlatformDatabase } from './types';

/**
 * Service-role client typed with the foundation tables (platform_events,
 * ai_usage, rate_limits and their RPCs). BYPASSES ROW-LEVEL SECURITY: use it
 * only from trusted server code (lib/analytics, lib/guard).
 *
 * Staff dashboards that should respect RLS can instead cast the user client:
 *   createClient() as unknown as SupabaseClient<PlatformDatabase>
 */
export type PlatformDb = SupabaseClient<PlatformDatabase>;

let cached: PlatformDb | null = null;

export function isPlatformDbConfigured(): boolean {
  return SUPABASE_URL.length > 0 && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').length > 0;
}

/** Memoized per server instance (the client is stateless: no session). */
export function platformAdminDb(): PlatformDb {
  if (cached) return cached;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!SUPABASE_URL || !key) {
    throw new Error('Platform DB unavailable: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  cached = createClient<PlatformDatabase>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}

/** Resolve within `ms`, or reject; keeps analytics and guards off the hot path. */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
