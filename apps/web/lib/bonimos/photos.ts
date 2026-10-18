/**
 * The site-photo feed: grouping by visit date and stage, and the sizes the
 * browser resizes uploads to (lib/bonimos/resize.ts does the resizing). The
 * bucket (bonimos-photos) takes JPEG/WebP up to 4 MB; a 1,600 px JPEG at 0.82
 * is about 250–600 KB, so a phone photo of 4–12 MB never leaves the device
 * at full size. Pure and client-safe.
 */
import { STAGE_IDS, type StageId } from '@/lib/hub/types';
import type { PhotoView } from './types';

/** Long edge of the stored photo, and of its feed thumbnail. */
export const PHOTO_MAX_EDGE = 1600;
export const THUMB_MAX_EDGE = 480;
export const PHOTO_QUALITY = 0.82;
export const THUMB_QUALITY = 0.72;
/** Matches the bucket's file_size_limit. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
/** Photos per upload batch (one site visit). */
export const PHOTOS_PER_BATCH = 12;
/** Source files we try to decode (iPhone HEIC arrives as JPEG through the file picker). */
export const PHOTO_SOURCE_MAX_BYTES = 40 * 1024 * 1024;

/** Scale (width, height) so the long edge is at most `maxEdge`; never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface PhotoGroup<T extends PhotoView = PhotoView> {
  /** YYYY-MM-DD: the day on site. */
  date: string;
  /** Stages seen that day, in the owner's order. */
  stages: StageId[];
  photos: T[];
}

/** Newest visit first; within a day, newest upload first. */
export function groupPhotos<T extends PhotoView>(photos: readonly T[]): PhotoGroup<T>[] {
  const byDate = new Map<string, T[]>();
  for (const p of photos) {
    const list = byDate.get(p.takenOn) ?? [];
    list.push(p);
    byDate.set(p.takenOn, list);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({
      date,
      stages: STAGE_IDS.filter((s) => list.some((p) => p.stage === s)),
      photos: [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
}

/** Photos taken in the 7 days up to `today` (inclusive). */
export function photosInLastWeek(photos: ReadonlyArray<Pick<PhotoView, 'takenOn'>>, today: string): number {
  const t = Date.parse(`${today}T00:00:00Z`);
  return photos.filter((p) => {
    const d = Date.parse(`${p.takenOn}T00:00:00Z`);
    return d <= t && t - d < 7 * 86_400_000;
  }).length;
}

/** A source file we can try to resize: an image, under 40 MB. */
export function checkPhotoSource(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!isImage) return 'אפשר להעלות רק תמונות.';
  if (file.size === 0) return 'הקובץ ריק.';
  if (file.size > PHOTO_SOURCE_MAX_BYTES) return 'התמונה גדולה מדי (מעל 40MB).';
  return null;
}
