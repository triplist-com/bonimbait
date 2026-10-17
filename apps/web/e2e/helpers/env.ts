/**
 * E2E environment: the app's .env.local, guarded to the LOCAL Supabase stack.
 *
 * The suite creates users, leads and hub projects, so it refuses to run against
 * anything but http://127.0.0.1:54321 (or localhost). Never point it at the
 * hosted project.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ENV_FILE = join(__dirname, '..', '..', '.env.local');

function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

export const appEnv: Record<string, string> = { ...readEnvFile(), ...pickProcessEnv() };

function pickProcessEnv(): Record<string, string> {
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADVISOR_SHARE_SECRET'];
  return Object.fromEntries(keys.filter((k) => process.env[k]).map((k) => [k, process.env[k] as string]));
}

export const SUPABASE_URL = appEnv.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const IS_LOCAL_STACK = /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(SUPABASE_URL);

export function assertLocalStack(): void {
  if (!IS_LOCAL_STACK) {
    throw new Error(`E2E runs only against the local Supabase stack (got "${SUPABASE_URL || 'unset'}").`);
  }
  if (!appEnv.SUPABASE_SERVICE_ROLE_KEY || !appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('E2E needs NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local.');
  }
}

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Service-role client for fixtures and assertions (local stack only). */
export function serviceDb(): SupabaseClient {
  assertLocalStack();
  return createClient(SUPABASE_URL, appEnv.SUPABASE_SERVICE_ROLE_KEY, opts);
}

/** The secret the server signs shared answers with (lib/advisor/share.ts). */
export function shareSecret(): string {
  return appEnv.ADVISOR_SHARE_SECRET || appEnv.SUPABASE_SERVICE_ROLE_KEY || '';
}
