/**
 * Canonical site identity. NEVER hard-code a domain anywhere else in the app:
 * the staging host (bonimbait.com) will be replaced by bonimbayit.co.il at
 * cutover by changing NEXT_PUBLIC_SITE_URL only.
 *
 * Safe to import from server, client and edge code.
 */

const FALLBACK_SITE_URL = 'http://localhost:3000';

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Absolute origin of the site, without a trailing slash. */
export const SITE_URL: string = normalizeBase(
  process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL,
);

/** Host name without "www." — used for display (e.g. OG image footer). */
export const SITE_HOST: string = new URL(SITE_URL).host.replace(/^www\./, '');

export const SITE_NAME = 'בונים בית';

/** Public contact email. Defaults to info@<site host>. */
export const CONTACT_EMAIL: string =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || `info@${SITE_HOST}`;

/**
 * True when a path should end with "/" (WordPress parity, next.config
 * trailingSlash). API routes and file-like paths (sitemap.xml) are exempt.
 */
export function wantsTrailingSlash(pathname: string): boolean {
  if (pathname === '/' || pathname.endsWith('/')) return false;
  if (pathname.startsWith('/api/') || pathname === '/api') return false;
  if (pathname.startsWith('/_next/')) return false;
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !lastSegment.includes('.');
}

/**
 * Build an absolute URL on the canonical host. Page paths get a trailing
 * slash to match the canonical form served by the app.
 *
 * absoluteUrl('/about')          -> https://host/about/
 * absoluteUrl('/search?q=x')     -> https://host/search/?q=x
 * absoluteUrl('/sitemap.xml')    -> https://host/sitemap.xml
 * absoluteUrl()                  -> https://host/
 */
export function absoluteUrl(path = '/'): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  const match = withLeading.match(/^([^?#]*)(.*)$/);
  let pathname = match?.[1] ?? withLeading;
  const rest = match?.[2] ?? '';
  if (wantsTrailingSlash(pathname)) pathname = `${pathname}/`;
  // Hebrew slugs are stored decoded; serve them percent-encoded. Decoding
  // first keeps already-encoded input from being double-encoded.
  try {
    pathname = encodeURI(decodeURI(pathname));
  } catch {
    // Malformed escape sequence: keep the path as given.
  }
  return `${SITE_URL}${pathname}${rest}`;
}
