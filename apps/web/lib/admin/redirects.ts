import 'server-only';

import type { DbClient } from '@/lib/db/client';
import { deleteRedirect, listAllRedirectsLite, updateRedirectTarget, upsertRedirect } from '@/lib/db/redirects';
import { SITE_URL } from '@/lib/site';
import { planSlugRedirect } from './slug';

/**
 * Apply a URL change (old public path -> new public path) to `redirects`:
 * 301 from the old path, re-point rules that targeted it, and drop rules
 * from the new path that would shadow it. Returns what was done.
 */
export async function applySlugRedirect(
  db: DbClient,
  oldPath: string,
  newPath: string,
  note: string,
): Promise<{ created: boolean; retargeted: number; removed: number }> {
  const existing = await listAllRedirectsLite(db);
  const plan = planSlugRedirect(oldPath, newPath, existing);
  for (const id of plan.remove) await deleteRedirect(db, id);
  for (const r of plan.retarget) await updateRedirectTarget(db, r.id, r.toPath);
  if (plan.upsert) {
    await upsertRedirect(db, { fromPath: plan.upsert.fromPath, toPath: plan.upsert.toPath, code: 301, source: 'manual', note });
  }
  return { created: Boolean(plan.upsert), retargeted: plan.retarget.length, removed: plan.remove.length };
}

/** A new URL must not be shadowed by an active redirect (middleware runs before pages). */
export async function removeRedirectsFrom(db: DbClient, path: string): Promise<number> {
  const existing = await listAllRedirectsLite(db);
  const plan = planSlugRedirect('/__none__', path, existing);
  for (const id of plan.remove) await deleteRedirect(db, id);
  return plan.remove.length;
}

export type RedirectTestResult = {
  status: number;
  location: string | null;
  error?: string;
};

/**
 * Request a path on the live site without following redirects. The
 * `x-bb-redirect-refresh` header makes the middleware reload its redirect
 * cache first (when REDIRECT_REFRESH_SECRET is set), so a rule just saved is
 * tested, not the cached map.
 */
export async function testRedirect(path: string): Promise<RedirectTestResult> {
  const target = new URL(path.startsWith('/') ? path : `/${path}`, SITE_URL);
  const headers: Record<string, string> = { 'user-agent': 'bonimbait-admin-redirect-test' };
  const secret = process.env.REDIRECT_REFRESH_SECRET;
  if (secret) headers['x-bb-redirect-refresh'] = secret;
  try {
    const res = await fetch(target, { method: 'GET', redirect: 'manual', headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return { status: res.status, location: res.headers.get('location') };
  } catch (err) {
    return { status: 0, location: null, error: err instanceof Error ? err.message : String(err) };
  }
}
