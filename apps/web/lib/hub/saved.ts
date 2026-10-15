/**
 * Saved items (♡ on videos, articles and answers; the shortlist of pros):
 * input validation and how each kind links and looks. Hrefs are always
 * derived from kind + ref (never taken from the client), so a saved item
 * can only ever point inside the site. Client-safe.
 */
import { aiHref } from '@/lib/nav';
import { isSavedKind, type SavedKind } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YOUTUBE_RE = /^[A-Za-z0-9_-]{11}$/;
// Post and legacy video slugs: decoded Hebrew/latin words and dashes, no slashes.
const SLUG_RE = /^[^\s/?#\\]{1,200}$/;

export interface SaveInput {
  kind: SavedKind;
  ref: string;
  title: string;
  /** Business slug and specialty (display only). */
  meta: Record<string, string>;
}

export type SaveValidation = { ok: true; value: SaveInput } | { ok: false; error: string };

/** Validate an item before it is stored (server actions and local storage). */
export function validateSaveInput(input: unknown): SaveValidation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid' };
  const raw = input as Record<string, unknown>;
  if (!isSavedKind(raw.kind)) return { ok: false, error: 'kind' };
  const ref = typeof raw.ref === 'string' ? raw.ref.trim().normalize('NFC') : '';
  const kind = raw.kind;
  const valid =
    kind === 'video'
      ? YOUTUBE_RE.test(ref)
      : kind === 'business'
        ? UUID_RE.test(ref)
        : kind === 'answer'
          ? ref.length >= 2 && ref.length <= 300
          : SLUG_RE.test(ref);
  if (!valid) return { ok: false, error: 'ref' };

  const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  const meta: Record<string, string> = {};
  if (raw.meta && typeof raw.meta === 'object') {
    for (const key of ['slug', 'specialty', 'thumbnail'] as const) {
      const v = (raw.meta as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) meta[key] = v.trim().slice(0, 300);
    }
  }
  if (kind === 'business' && meta.slug && !SLUG_RE.test(meta.slug)) delete meta.slug;
  if (meta.thumbnail && !/^https:\/\//.test(meta.thumbnail)) delete meta.thumbnail;
  return { ok: true, value: { kind, ref, title: title || ref, meta } };
}

/** Where a saved item opens. */
export function savedHref(kind: SavedKind, ref: string, meta: Record<string, unknown> = {}): string {
  switch (kind) {
    case 'video':
    case 'video_page':
      return `/video/${ref}/`;
    case 'post':
      return `/${ref}/`;
    case 'business':
      return typeof meta.slug === 'string' && meta.slug ? `/business/${meta.slug}/` : '/recommended/';
    case 'answer':
      return aiHref(ref);
  }
}

/** Thumbnail for a saved item, when it has one. */
export function savedThumbnail(kind: SavedKind, ref: string, meta: Record<string, unknown> = {}): string | null {
  if (kind === 'video') return `https://i.ytimg.com/vi/${ref}/mqdefault.jpg`;
  return typeof meta.thumbnail === 'string' && meta.thumbnail.startsWith('https://') ? meta.thumbnail : null;
}

export const SAVED_KIND_LABELS: Record<SavedKind, string> = {
  video: 'סרטון',
  video_page: 'סרטון',
  post: 'מאמר',
  business: 'בעל מקצוע',
  answer: 'תשובה',
};
