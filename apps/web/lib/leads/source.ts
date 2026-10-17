/**
 * A lead's "source page" (leads.source_url) comes from the browser: a hidden
 * form field or the Referer header. It is shown to staff as a link on the
 * admin lead page, so only two shapes are kept: an http(s) URL, or a path on
 * this site. Anything else (javascript:, data:, "//host", control characters,
 * backslashes) is dropped. Client-safe.
 */

const MAX = 500;

/** The source URL to store, or null when it isn't a plain http(s) URL or site path. */
export function cleanSourceUrl(src: string | null | undefined): string | null {
  if (typeof src !== 'string') return null;
  const s = src.trim();
  if (!s || s.length > 2000 || /[\u0000-\u001f\u007f\\]/.test(s)) return null;
  if (s.startsWith('/')) return s.startsWith('//') ? null : s.slice(0, MAX);
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const url = new URL(s);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().slice(0, MAX);
  } catch {
    return null;
  }
}

/** A stored source URL as a safe link: { href, label } or null (older rows may predate cleanSourceUrl). */
export function sourceLink(stored: string | null | undefined): { href: string; label: string } | null {
  const href = cleanSourceUrl(stored);
  if (!href) return null;
  let label = href;
  try {
    label = decodeURI(href);
  } catch {
    // A malformed %-escape: show it as stored.
  }
  return { href, label };
}
