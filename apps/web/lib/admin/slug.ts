/**
 * Slugs and the slug-change -> 301 logic. Pure (no DB), shared by the admin
 * forms (client, live slug preview) and server actions, and unit-tested.
 */
import { normalizeRedirectPath } from '@/lib/redirects/normalize';

const MAX_SLUG = 190;

/**
 * URL slug from a title. Hebrew letters are kept (WordPress slugs are stored
 * decoded, e.g. "איך-בוחרים-אדריכל"); everything else becomes "-".
 */
export function slugify(title: string): string {
  return (
    (title ?? '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/[֑-ׇ]/g, '') // niqqud / cantillation marks
      .replace(/[״"׳'`’]/g, '')
      .replace(/[^a-z0-9א-ת]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG)
      .replace(/-+$/g, '')
  );
}

/**
 * Clean a slug typed by an editor. `allowSlash` for page paths such as
 * "parent/child". Returns '' when nothing usable is left.
 */
export function cleanSlug(input: string, opts: { allowSlash?: boolean } = {}): string {
  let value = (input ?? '').trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep as typed
  }
  const parts = value
    .split('/')
    .map((p) => slugify(p))
    .filter(Boolean);
  if (!opts.allowSlash) return parts.join('-').slice(0, MAX_SLUG);
  return parts.join('/');
}

/**
 * The slug to save. An unchanged slug is kept byte-for-byte: migrated slugs
 * contain characters our slugify would drop (emoji, "_", "♨"), and saving a
 * post must never move its URL behind the editor's back.
 */
export function resolveSlug(
  input: string,
  opts: { existing?: string | null; fallback: string; allowSlash?: boolean },
): string {
  const typed = (input ?? '').trim();
  if (opts.existing && (typed === opts.existing || typed === '')) return opts.existing;
  return cleanSlug(typed || opts.fallback, { allowSlash: opts.allowSlash });
}

export type ContentKind = 'post' | 'page' | 'video' | 'business' | 'product';

/** Public path (with trailing slash, decoded) for a content slug. */
export function publicPath(kind: ContentKind, slug: string): string {
  switch (kind) {
    case 'post':
    case 'page':
      return `/${slug}/`;
    case 'video':
      return `/video/${slug}/`;
    case 'business':
      return `/business/${slug}/`;
    case 'product':
      return `/product/${slug}/`;
  }
}

/** Should changing this slug offer a 301 from the old URL? Only for content that was public. */
export function slugChangeNeedsRedirect(opts: {
  oldSlug: string | null | undefined;
  newSlug: string;
  wasPublished: boolean;
}): boolean {
  if (!opts.oldSlug || !opts.wasPublished) return false;
  return normalizeRedirectPath(`/${opts.oldSlug}`) !== normalizeRedirectPath(`/${opts.newSlug}`);
}

export type ExistingRedirect = { id: string; from_path: string; to_path: string; is_active: boolean };

export type RedirectPlan = {
  /** Create or update this rule (from_path is normalized). */
  upsert: { fromPath: string; toPath: string } | null;
  /** Rules that pointed at the old URL: re-point them at the new one (no chains). */
  retarget: Array<{ id: string; toPath: string }>;
  /** Rules FROM the new URL would shadow the renamed page (middleware runs first): delete. */
  remove: string[];
};

function samePath(a: string, b: string): boolean {
  // Only compare site-relative paths; absolute URLs never match.
  if (/^[a-z]+:\/\//i.test(a) || /^[a-z]+:\/\//i.test(b)) return false;
  return normalizeRedirectPath(a) === normalizeRedirectPath(b);
}

/**
 * Plan the redirect rows for a URL change oldPath -> newPath.
 *  - old -> new, 301
 *  - existing X -> old become X -> new (avoids redirect chains)
 *  - existing new -> anything are removed (they would hide the new URL,
 *    e.g. when renaming a post back to an earlier slug)
 */
export function planSlugRedirect(oldPath: string, newPath: string, existing: ExistingRedirect[]): RedirectPlan {
  const from = normalizeRedirectPath(oldPath);
  if (samePath(oldPath, newPath) || from === '/') return { upsert: null, retarget: [], remove: [] };
  const remove = existing.filter((r) => samePath(r.from_path, newPath)).map((r) => r.id);
  const retarget = existing
    .filter((r) => !remove.includes(r.id) && normalizeRedirectPath(r.from_path) !== from && samePath(r.to_path, oldPath))
    .map((r) => ({ id: r.id, toPath: newPath }));
  return { upsert: { fromPath: from, toPath: newPath }, retarget, remove };
}
