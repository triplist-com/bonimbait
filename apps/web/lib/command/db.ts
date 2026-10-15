import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { SUPABASE_URL } from '@/lib/supabase/env';
import type { CommandDatabase } from './db-types';

/**
 * Supabase clients typed with the Command Center tables and RPCs.
 *
 * - commandUserDb(): the signed-in staff member's session, so RLS decides
 *   (staff read platform_events, leads, insight_* and ai_usage).
 * - commandServiceDb(): service role, BYPASSES RLS. Only for writes the
 *   caller is already authorized for (the insights refresh after checkRole).
 */
export type CommandDb = SupabaseClient<CommandDatabase>;

export function commandUserDb(): CommandDb {
  return createSessionClient() as unknown as CommandDb;
}

let service: CommandDb | null = null;

export function isCommandServiceConfigured(): boolean {
  return SUPABASE_URL.length > 0 && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').length > 0;
}

export function commandServiceDb(): CommandDb {
  if (service) return service;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!SUPABASE_URL || !key) throw new Error('Command DB unavailable: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  service = createSupabaseClient<CommandDatabase>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return service;
}

/** Page through a select (PostgREST caps a response at 1,000 rows). */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts: { pageSize?: number; max?: number } = {},
): Promise<T[]> {
  const size = opts.pageSize ?? 1000;
  const max = opts.max ?? 20_000;
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, Math.min(from + size, max) - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}
