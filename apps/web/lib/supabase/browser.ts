'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db/types';
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from './env';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Supabase client for Client Components (login/signup forms). Singleton. */
export function createClient() {
  assertSupabaseConfigured();
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
