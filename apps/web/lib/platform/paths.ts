/**
 * The /platform/* area: the pitch site and the demo views (docs/platform/FOUNDATION.md).
 *
 * Everything under it is internal sales material: noindex, optionally gated by
 * PITCH_ACCESS_CODE (lib/platform/gate.ts), rendered without the public site's
 * chrome, and its traffic is analytics "demo" traffic (platform_events.is_demo).
 *
 * Safe for server, client and edge.
 */

export const PLATFORM_PREFIX = '/platform';

/** True for /platform, /platform/ and anything below it. */
export function isPlatformPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === PLATFORM_PREFIX || pathname.startsWith(`${PLATFORM_PREFIX}/`);
}

/**
 * True when a request comes from a /platform page (its Referer), e.g. a demo
 * view calling an API route. Used to flag analytics and AI usage as demo.
 */
export function isDemoRequest(request: { headers: { get(name: string): string | null } }): boolean {
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    return isPlatformPath(new URL(referer).pathname);
  } catch {
    return false;
  }
}
