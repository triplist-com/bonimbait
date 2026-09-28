/**
 * Public URLs for migrated site media (Supabase Storage bucket `media`).
 *
 * Old WordPress uploads keep their path: `wp-content/uploads/2026/02/x.jpg` is
 * stored as `uploads/2026/02/x.jpg` (see scripts/migrate/media.py).
 *
 * Base URL: NEXT_PUBLIC_MEDIA_BASE_URL if set (same value the loader uses as
 * MEDIA_BASE_URL), else the bucket's public URL on NEXT_PUBLIC_SUPABASE_URL.
 */

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');

export const MEDIA_BASE_URL = (
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/media` : '')
).replace(/\/+$/, '');

/** `mediaUrl('uploads/mp-v6/team/tomer-white.webp')` → public Storage URL. */
export function mediaUrl(key: string): string {
  const path = key.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `${MEDIA_BASE_URL}/${path}`;
}
