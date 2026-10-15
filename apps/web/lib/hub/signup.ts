import 'server-only';

import type { User } from '@supabase/supabase-js';
import { trackServer } from '@/lib/analytics/server';
import { isPlatformDbConfigured, platformAdminDb } from '@/lib/platform/db';

/**
 * `signup_completed` (a server event): sent once per account, from wherever
 * the new session first reaches the server: the email signup form (instant
 * session), the email-confirmation callback, or the first Google login.
 */

/** An account counts as new for this long after it was created. */
export const NEW_ACCOUNT_WINDOW_MS = 30 * 60_000;

export function signupMethod(user: Pick<User, 'app_metadata'>): 'email' | 'google' {
  const provider = user.app_metadata?.provider;
  return provider === 'google' ? 'google' : 'email';
}

export function isNewAccount(user: Pick<User, 'created_at'>, now: number = Date.now()): boolean {
  const created = Date.parse(user.created_at ?? '');
  return Number.isFinite(created) && now - created >= 0 && now - created <= NEW_ACCOUNT_WINDOW_MS;
}

/** Records signup_completed for a new account, once. Never throws. */
export async function recordSignupCompleted(user: User): Promise<boolean> {
  try {
    if (!isNewAccount(user)) return false;
    if (isPlatformDbConfigured()) {
      const { count } = await platformAdminDb()
        .from('platform_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('name', 'signup_completed');
      if ((count ?? 0) > 0) return false;
    }
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    await trackServer(
      'signup_completed',
      {
        method: signupMethod(user),
        stage: typeof meta.construction_stage === 'string' ? meta.construction_stage : undefined,
        region: typeof meta.region === 'string' ? meta.region : undefined,
      },
      { userId: user.id },
    );
    return true;
  } catch (err) {
    console.error('[hub] signup_completed failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
