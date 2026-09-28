import 'server-only';

import { getProfile, type Profile } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import type { DbClient } from '@/lib/db/client';
import type { Role } from '@/lib/db/types';

/**
 * Server-action guard for the admin. Every admin write goes through
 * `adminAction()`, which re-checks the caller's role on the server before
 * running (pages are guarded separately by requireRole in the layouts), and
 * then works with the caller's own Supabase session, so RLS ("staff full
 * access") is a second, independent check.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const FORBIDDEN_MESSAGE = 'אין לכם הרשאה לבצע פעולה זו.';
export const SIGNED_OUT_MESSAGE = 'יש להתחבר מחדש.';

export class ActionError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export type AdminContext = { profile: Profile; db: DbClient };

/** Resolve the caller for an admin action, or a refusal. Never throws for auth. */
export async function authorize(role: Role): Promise<{ ok: true; profile: Profile } | { ok: false; error: string }> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!hasRole(profile.role, role)) return { ok: false, error: FORBIDDEN_MESSAGE };
  return { ok: true, profile };
}

function dbErrorMessage(message: string): string {
  if (/duplicate key|unique/i.test(message)) return 'הערך כבר קיים (כתובת או מזהה כפולים).';
  if (/row-level security|permission denied|42501/i.test(message)) return FORBIDDEN_MESSAGE;
  if (/violates foreign key/i.test(message)) return 'הפריט מקושר לנתונים אחרים ולא ניתן לשנות אותו כך.';
  if (/violates check constraint/i.test(message)) return 'אחד הערכים אינו חוקי.';
  return 'השמירה נכשלה. נסו שוב.';
}

/**
 * Wrap an admin server action: role check first, then the body with the
 * caller's RLS-bound client. ActionError becomes a Hebrew error result;
 * unexpected errors are logged and reported generically.
 */
export function adminAction<Args extends unknown[], T = undefined>(
  role: Role,
  fn: (ctx: AdminContext, ...args: Args) => Promise<ActionResult<T>>,
): (...args: Args) => Promise<ActionResult<T>> {
  return async (...args: Args) => {
    const auth = await authorize(role);
    if (!auth.ok) return { ok: false, error: auth.error };
    try {
      return await fn({ profile: auth.profile, db: createClient() }, ...args);
    } catch (err) {
      if (err instanceof ActionError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
      // redirect()/notFound() from next/navigation must propagate.
      if (err && typeof err === 'object' && 'digest' in err) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[admin] action failed:', message);
      return { ok: false, error: dbErrorMessage(message) };
    }
  };
}
