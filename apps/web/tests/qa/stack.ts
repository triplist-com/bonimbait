/**
 * Harness for QA's tests against the LOCAL Supabase stack (opt-in: QA_RLS_TEST=1).
 *
 * Local only: refuses any URL that isn't http://127.0.0.1:54321 or localhost.
 * Test users live on the @bonimbait.test domain with a fresh random password
 * per run (never stored). Each suite cleans up what it creates.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ENV_FILE = fileURLToPath(new URL('../../.env.local', import.meta.url));

export const stackEnv: Record<string, string> = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split('\n')
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {};

const URL_ = stackEnv.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const IS_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(URL_);
export const QA_STACK_ENABLED = process.env.QA_RLS_TEST === '1' && IS_LOCAL && Boolean(stackEnv.SUPABASE_SERVICE_ROLE_KEY);

export type Db = SupabaseClient;
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function serviceClient(): Db {
  return createClient(URL_, stackEnv.SUPABASE_SERVICE_ROLE_KEY, opts);
}

export function anonClient(): Db {
  return createClient(URL_, stackEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
}

export type ProfileRole = 'member' | 'pro' | 'editor' | 'admin';

/** Create (or reuse) a confirmed test user with a new password, set its role, and sign in. */
export async function signedInUser(admin: Db, email: string, role: ProfileRole): Promise<{ id: string; db: Db }> {
  if (!email.endsWith('@bonimbait.test')) throw new Error(`test users must be @bonimbait.test (${email})`);
  const password = randomBytes(18).toString('base64url');
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
  }
  await admin.from('profiles').upsert({ id: user.id, email }, { onConflict: 'id' });
  const { error: roleError } = await admin.from('profiles').update({ role, full_name: `בדיקת QA ${role}` }).eq('id', user.id);
  if (roleError) throw roleError;
  const db = anonClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: user.id, db };
}

/** True when a PostgREST error is a permission refusal (RLS, a guard's 42501, or a missing grant). */
export function isForbidden(e: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(e) && (e!.code === '42501' || /row-level security|permission denied/i.test(e!.message ?? ''));
}
