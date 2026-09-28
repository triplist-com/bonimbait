/**
 * Media library conventions (client-safe, pure).
 *
 * New uploads go to the Storage bucket `media` under `uploads/YYYY/MM/`,
 * mirroring WordPress's wp-content/uploads layout used by the migration.
 */

export const MEDIA_BUCKET = 'media';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'];

/** "uploads/2026/09" for a date (Israel time). */
export function uploadFolder(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `uploads/${parts.year}/${parts.month}`;
}

/**
 * Safe object name: ASCII letters, digits, "-", "_" and the extension.
 * Hebrew or other names fall back to "image-<time>".
 */
export function safeFileName(original: string, now = Date.now()): string {
  const dot = original.lastIndexOf('.');
  const ext = (dot > 0 ? original.slice(dot + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const base = (dot > 0 ? original.slice(0, dot) : original)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || `image-${now.toString(36)}`}.${ext}`;
}

export function uploadPath(fileName: string, date = new Date()): string {
  return `${uploadFolder(date)}/${safeFileName(fileName, date.getTime())}`;
}

/** A variant used when the name is taken: "a.jpg" -> "a-lx3k2.jpg". */
export function dedupePath(path: string, now = Date.now()): string {
  const dot = path.lastIndexOf('.');
  const suffix = `-${now.toString(36)}`;
  return dot > path.lastIndexOf('/') ? `${path.slice(0, dot)}${suffix}${path.slice(dot)}` : `${path}${suffix}`;
}

export function isImageName(name: string): boolean {
  return /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(name);
}
