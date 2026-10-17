import type { Role } from '@/lib/db/types';

/**
 * Role hierarchy shared by app code and SQL (public.role_rank):
 * member < pro < editor < admin. hasRole('editor') is true for admins too.
 * Safe for server, client and edge.
 */
const RANK: Record<Role, number> = { member: 1, pro: 2, editor: 3, admin: 4 };

export function hasRole(actual: Role | null | undefined, required: Role): boolean {
  if (!actual) return false;
  return RANK[actual] >= RANK[required];
}

/**
 * Emails listed in ADMIN_EMAILS (comma-separated) are always treated as admins
 * and their profile role is promoted to 'admin' on login (see session.ts).
 */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/** The fields of a Supabase auth user that prove an email address. */
export type AuthUserLike = {
  email?: string | null;
  email_confirmed_at?: string | null;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null;
};

/**
 * ADMIN_EMAILS promotes an account only once its owner has proved the
 * address: a confirmed email, or a Google identity that verified that same
 * address. Anyone can sign up with an unclaimed admin address, so an
 * unconfirmed session is never promoted.
 */
export function isProvenAdminEmail(user: AuthUserLike | null | undefined): boolean {
  if (!user || !isAdminEmail(user.email)) return false;
  if (user.email_confirmed_at) return true;
  const email = user.email!.trim().toLowerCase();
  return (user.identities ?? []).some(
    (i) =>
      i.provider === 'google' &&
      i.identity_data?.email_verified === true &&
      String(i.identity_data?.email ?? '').trim().toLowerCase() === email,
  );
}

const NEXT_BASE = 'https://next.bonimbait.invalid';

/**
 * Only allow same-site relative redirect targets (prevents open redirects).
 * Browsers drop tabs and newlines from URLs and read "\" as "/", so
 * "/\t/evil.example" or "/\\evil.example" would become "//evil.example":
 * control characters and backslashes are refused, and the target must
 * resolve on this site.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.length > 2000) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const url = new URL(next, NEXT_BASE);
    if (url.origin !== NEXT_BASE) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
