/**
 * Canonical key for redirect lookups. Both the stored `redirects.from_path`
 * and incoming request paths go through this, so "/%D7%90/" and "/א" match.
 *
 *  - percent-decoded (Hebrew slugs are stored decoded)
 *  - leading "/", no trailing "/" (except the root)
 *  - collapsed duplicate slashes
 *  - lower-case (WordPress slugs are case-insensitive)
 *
 * Edge-safe (used by middleware).
 */
export function normalizeRedirectPath(input: string): string {
  let path = input.split(/[?#]/)[0] ?? '';
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed escapes: compare the raw form.
  }
  path = `/${path}`.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path.toLowerCase();
}
