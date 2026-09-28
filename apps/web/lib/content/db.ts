import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { DbClient } from '@/lib/db/client';
import type { Database } from '@/lib/db/types';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/supabase/env';

let cached: DbClient | null = null;

/**
 * Anonymous, cookie-less Supabase client for public content (posts, pages,
 * categories, video pages). RLS applies as `anon`, so only published rows are
 * visible.
 *
 * Unlike `lib/supabase/server.ts`, it never touches `cookies()`, so the pages
 * that use it stay static and are revalidated through ISR instead of being
 * rendered on every request.
 *
 * Returns null when Supabase is not configured, so callers can degrade (for
 * example, render an empty list or a 404).
 */
export function getPublicDb(): DbClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) {
    cached = createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cached;
}

/** Decode a route param (Next passes non-ASCII segments percent-encoded) and NFC-normalize it. */
export function decodeSlug(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed escapes: keep the raw value.
  }
  return decoded.normalize('NFC');
}

/** Parse a "/page/<n>/" segment. Returns null for anything but an integer >= 2. */
export function parsePageNumber(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= 2 && n <= 10_000 ? n : null;
}

/** Run a query, returning `fallback` on any error (a DB outage must not break layout-level sections). */
export async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[content] query failed:', err instanceof Error ? err.message : err);
    return fallback;
  }
}
