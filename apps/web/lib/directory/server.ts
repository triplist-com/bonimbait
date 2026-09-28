import 'server-only';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
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

/** Client IP from proxy headers (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(): string {
  const h = headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Salted hash of the client IP. Stored in leads.payload.ip_hash for rate
 * limiting, so raw IPs are never persisted.
 */
export function clientIpHash(): string {
  const salt = process.env.LEAD_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'bonimbait';
  return createHash('sha256').update(`${salt}:${clientIp()}`).digest('hex').slice(0, 32);
}

/** Referer path on this site (for leads.source_url), or the fallback. */
export function refererUrl(fallback: string): string {
  const ref = headers().get('referer');
  return ref && ref.length < 1000 ? ref : fallback;
}
