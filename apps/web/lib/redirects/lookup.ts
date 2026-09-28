/**
 * Cached redirect map for middleware (edge runtime).
 *
 * The whole active `redirects` table is loaded via PostgREST with the anon key
 * (RLS allows public read of active redirects) and kept in module memory per
 * edge isolate for REDIRECT_CACHE_TTL_SECONDS (default 300). A failed refresh
 * keeps serving the previous map and retries after a short back-off, so a DB
 * outage never blocks page requests.
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/supabase/env';
import { normalizeRedirectPath } from './normalize';

export type RedirectTarget = { to: string; code: 301 | 302 | 307 | 308 };

const TTL_MS = Math.max(10, Number(process.env.REDIRECT_CACHE_TTL_SECONDS ?? 300)) * 1000;
const RETRY_MS = 60_000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // hard cap: 50k redirects
const FETCH_TIMEOUT_MS = 2_000;

let cache: Map<string, RedirectTarget> | null = null;
let expiresAt = 0;
let inflight: Promise<void> | null = null;

type Row = { from_path: string; to_path: string; code: number };

async function fetchAll(): Promise<Map<string, RedirectTarget>> {
  const map = new Map<string, RedirectTarget>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const url =
      `${SUPABASE_URL}/rest/v1/redirects` +
      `?select=from_path,to_path,code&is_active=eq.true&order=from_path.asc` +
      `&offset=${from}&limit=${PAGE_SIZE}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`redirects fetch failed: ${res.status}`);
      const rows = (await res.json()) as Row[];
      for (const row of rows) {
        const code = [301, 302, 307, 308].includes(row.code) ? (row.code as RedirectTarget['code']) : 301;
        map.set(normalizeRedirectPath(row.from_path), { to: row.to_path, code });
      }
      if (rows.length < PAGE_SIZE) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return map;
}

async function refresh(): Promise<void> {
  try {
    cache = await fetchAll();
    expiresAt = Date.now() + TTL_MS;
  } catch (err) {
    console.error('[redirects] refresh failed', err);
    cache = cache ?? new Map();
    expiresAt = Date.now() + RETRY_MS;
  }
}

/** Find a redirect for a request path, or null. */
export async function findRedirect(pathname: string): Promise<RedirectTarget | null> {
  if (!isSupabaseConfigured()) return null;
  if (!cache || Date.now() > expiresAt) {
    inflight = inflight ?? refresh().finally(() => {
      inflight = null;
    });
    // First load waits; later refreshes serve the stale map meanwhile.
    if (!cache) await inflight;
  }
  return cache?.get(normalizeRedirectPath(pathname)) ?? null;
}
