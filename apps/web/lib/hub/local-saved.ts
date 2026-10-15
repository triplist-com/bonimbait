/**
 * The anonymous visitor's saved items and shortlist in localStorage: the
 * lean part of lib/hub/local.ts, safe to ship with the ♡ buttons on every
 * content page (no stage content, no onboarding code).
 *
 *   bb.shortlist   business ids (PROGRAM.md §6, written by the hub)
 *   bb.hub.saved   { v: 1, items: LocalSavedItem[] }   hub-internal
 */
import { isSavedKind, type SavedKind } from './types';

export const SHORTLIST_KEY = 'bb.shortlist';
export const SAVED_KEY = 'bb.hub.saved';
export const DRAFT_KEY = 'bb.hub.draft';
export const CHECKLIST_KEY = 'bb.hub.checklist';
export const PLANNER_KEY = 'bb.planner.last';
export const HUB_CHANGE_EVENT = 'bb-hub-change';
export const LOCAL_SAVED_MAX = 200;

export interface LocalSavedItem {
  kind: SavedKind;
  ref: string;
  title: string;
  /** Business slug, specialty... (small, display only). */
  meta?: Record<string, string>;
  at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    const s = storage();
    if (!s) return;
    if (value == null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(HUB_CHANGE_EVENT, { detail: { key } }));
  } catch {
    // Quota or disabled storage: the in-memory UI state still works.
  }
}

export function normalizeLocalSaved(value: unknown): LocalSavedItem[] {
  const items =
    value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : [];
  const out: LocalSavedItem[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (!isSavedKind(r.kind) || typeof r.ref !== 'string' || !r.ref || r.ref.length > 300) continue;
    if (r.kind === 'business' && !UUID_RE.test(r.ref)) continue;
    const key = `${r.kind}:${r.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const meta: Record<string, string> = {};
    if (r.meta && typeof r.meta === 'object') {
      for (const [k, v] of Object.entries(r.meta as Record<string, unknown>)) {
        if (typeof v === 'string' && k.length <= 40) meta[k] = v.slice(0, 300);
      }
    }
    out.push({
      kind: r.kind,
      ref: r.ref,
      title: typeof r.title === 'string' ? r.title.slice(0, 300) : '',
      meta: Object.keys(meta).length ? meta : undefined,
      at: typeof r.at === 'string' ? r.at : new Date(0).toISOString(),
    });
  }
  return out.slice(0, LOCAL_SAVED_MAX);
}

export function readSaved(): LocalSavedItem[] {
  return normalizeLocalSaved(readJson(SAVED_KEY));
}

export function writeSaved(items: LocalSavedItem[]): void {
  writeJson(SAVED_KEY, items.length ? { v: 1, items: items.slice(0, LOCAL_SAVED_MAX) } : null);
}

export function readShortlist(): string[] {
  const value = readJson(SHORTLIST_KEY);
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v)))).slice(0, 100);
}

export function writeShortlist(ids: string[]): void {
  writeJson(SHORTLIST_KEY, ids.length ? Array.from(new Set(ids)).slice(0, 100) : null);
}

/** Add or remove one item; also keeps `bb.shortlist` in sync for pros. */
export function toggleLocalSaved(item: Omit<LocalSavedItem, 'at'>, saved: boolean): LocalSavedItem[] {
  const current = readSaved().filter((i) => !(i.kind === item.kind && i.ref === item.ref));
  const next = saved ? [{ ...item, at: new Date().toISOString() }, ...current] : current;
  writeSaved(next);
  if (item.kind === 'business') {
    const ids = readShortlist().filter((id) => id !== item.ref);
    writeShortlist(saved ? [item.ref, ...ids] : ids);
  }
  return next;
}

/** Is this item saved on this device? (bb.shortlist counts for pros.) */
export function isLocallySaved(kind: SavedKind, ref: string): boolean {
  if (kind === 'business' && readShortlist().includes(ref)) return true;
  return readSaved().some((i) => i.kind === kind && i.ref === ref);
}

/**
 * The whole anonymous workspace as stored, for the import on signup/login.
 * Not validated here on purpose (the server re-validates everything), so the
 * auth pages don't ship the hub's content and validation code.
 */
export function readLocalHubRaw(): { draft: unknown; saved: unknown[]; shortlist: unknown[]; checklist: unknown[]; planner: unknown } {
  const saved = readJson(SAVED_KEY);
  const checklist = readJson(CHECKLIST_KEY);
  const shortlist = readJson(SHORTLIST_KEY);
  return {
    draft: readJson(DRAFT_KEY),
    saved: saved && typeof saved === 'object' && Array.isArray((saved as { items?: unknown }).items) ? (saved as { items: unknown[] }).items : [],
    shortlist: Array.isArray(shortlist) ? shortlist : [],
    checklist:
      checklist && typeof checklist === 'object' && Array.isArray((checklist as { done?: unknown }).done) ? (checklist as { done: unknown[] }).done : [],
    planner: readJson(PLANNER_KEY),
  };
}

export function hasLocalHubRaw(raw = readLocalHubRaw()): boolean {
  const draft = raw.draft && typeof raw.draft === 'object' ? Object.keys(raw.draft as object).length : 0;
  return draft > 0 || raw.saved.length > 0 || raw.shortlist.length > 0 || raw.checklist.length > 0;
}

/** Forget the anonymous workspace (after it moved into the account). */
export function clearLocalHubKeys(): void {
  for (const key of [DRAFT_KEY, SAVED_KEY, SHORTLIST_KEY, CHECKLIST_KEY]) writeJson(key, null);
}

/** Subscribe to hub storage changes (this tab and others). Returns an unsubscribe. */
export function onHubStorageChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith('bb.')) callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(HUB_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(HUB_CHANGE_EVENT, callback);
  };
}
