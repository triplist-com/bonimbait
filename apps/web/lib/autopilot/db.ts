import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AutopilotDatabase } from './types';

export type AutopilotDb = SupabaseClient<AutopilotDatabase>;

function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

export function isServiceStoreConfigured(): boolean {
  return supabaseUrl().length > 0 && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').length > 0;
}

let cached: { url: string; client: AutopilotDb } | null = null;

/**
 * Service-role client for the knowledge store. BYPASSES RLS: only for
 * server code that needs no caller (search, public video pages, the cron).
 * Null when Supabase or the service key is not configured.
 */
export function serviceDb(): AutopilotDb | null {
  if (!isServiceStoreConfigured()) return null;
  const url = supabaseUrl();
  if (!cached || cached.url !== url) {
    cached = {
      url,
      client: createClient<AutopilotDatabase>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    };
  }
  return cached.client;
}

/**
 * View a session (RLS-bound) client from lib/supabase/server with the
 * autopilot tables' types. Same object; only the static type changes.
 */
export function asAutopilotDb(client: object): AutopilotDb {
  return client as AutopilotDb;
}
