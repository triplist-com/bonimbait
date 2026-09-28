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

/** Only allow same-site relative redirect targets (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next;
}
