/**
 * Supabase auth cookie detection (client-safe, no supabase-js import).
 *
 * @supabase/ssr stores the session in `sb-<project-ref>-auth-token`, split
 * into `.0`, `.1`, … chunks when large. These cookies are readable from
 * JavaScript (the browser client needs them), so their presence is a cheap
 * "probably signed in" signal. It is a UI hint only: the server and RLS
 * remain the source of truth.
 */
const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;\s]+-auth-token(?:\.\d+)?=([^;]*)/;

export function hasAuthCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  const m = cookieHeader.match(AUTH_COOKIE);
  return Boolean(m && m[1] && m[1] !== 'deleted');
}
