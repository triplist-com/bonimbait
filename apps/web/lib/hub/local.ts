/**
 * The anonymous visitor's hub, in localStorage (PROGRAM.md §6):
 *
 *   bb.hub.draft      the onboarding answers, EXACTLY the HubDraft fields
 *   bb.shortlist      business ids (pros the visitor shortlisted)
 *   bb.hub.saved      { v: 1, items: LocalSavedItem[] }   hub-internal
 *   bb.hub.checklist  { v: 1, done: string[] }            hub-internal
 *
 * Read-only here (other squads write them): bb.planner.last (growth),
 * bb.advisor.recent (advisor).
 *
 * On signup or login everything is imported into the member's project
 * (importLocalHubAction) and cleared. Every access is wrapped: storage can be
 * unavailable (private mode, blocked cookies) and the page must still work.
 * Same-tab listeners get a 'bb-hub-change' event; other tabs get 'storage'.
 */
import { isChecklistItemId } from './content';
import { parsePlannerEstimate } from './estimate';
import { normalizeDraft } from './onboarding';
import { isSavedKind, type HubDraft, type PlannerEstimate, type SavedKind } from './types';

export const DRAFT_KEY = 'bb.hub.draft';
export const SHORTLIST_KEY = 'bb.shortlist';
export const SAVED_KEY = 'bb.hub.saved';
export const CHECKLIST_KEY = 'bb.hub.checklist';
export const PLANNER_KEY = 'bb.planner.last';
export const ADVISOR_KEY = 'bb.advisor.recent';
export const HUB_CHANGE_EVENT = 'bb-hub-change';

export const LOCAL_SAVED_MAX = 200;

export interface LocalSavedItem {
  kind: SavedKind;
  ref: string;
  title: string;
  /** Business slug, thumbnail... (small, display only). */
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

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
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

// --- Draft --------------------------------------------------------------------

export function readDraft(): HubDraft {
  return normalizeDraft(readJson(DRAFT_KEY));
}

export function writeDraft(draft: HubDraft): void {
  const clean = normalizeDraft(draft);
  writeJson(DRAFT_KEY, Object.keys(clean).length ? clean : null);
}

// --- Saved items --------------------------------------------------------------

export function normalizeLocalSaved(value: unknown): LocalSavedItem[] {
  const items = value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
    ? ((value as { items: unknown[] }).items)
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

// --- Shortlist (business ids) ---------------------------------------------------

export function readShortlist(): string[] {
  const value = readJson(SHORTLIST_KEY);
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v)))).slice(0, 100);
}

export function writeShortlist(ids: string[]): void {
  writeJson(SHORTLIST_KEY, ids.length ? Array.from(new Set(ids)).slice(0, 100) : null);
}

// --- Checklist ------------------------------------------------------------------

export function readChecklist(): string[] {
  const value = readJson(CHECKLIST_KEY);
  const done = value && typeof value === 'object' && Array.isArray((value as { done?: unknown }).done)
    ? (value as { done: unknown[] }).done
    : [];
  return Array.from(new Set(done.filter(isChecklistItemId)));
}

export function writeChecklist(done: string[]): void {
  const clean = Array.from(new Set(done.filter(isChecklistItemId)));
  writeJson(CHECKLIST_KEY, clean.length ? { v: 1, done: clean } : null);
}

// --- Other squads' snapshots (read-only) ------------------------------------------

export function readPlanner(): PlannerEstimate | null {
  return parsePlannerEstimate(readJson(PLANNER_KEY));
}

/** Count of the advisor's recent questions (bb.advisor.recent: { q, at }[]). */
export function readAdvisorQuestionCount(): number {
  const value = readJson(ADVISOR_KEY);
  return Array.isArray(value) ? value.filter((v) => v && typeof v === 'object' && typeof (v as { q?: unknown }).q === 'string').length : 0;
}

// --- Whole hub --------------------------------------------------------------------

export interface LocalHubSnapshot {
  draft: HubDraft;
  saved: LocalSavedItem[];
  shortlist: string[];
  checklist: string[];
}

export function readLocalHub(): LocalHubSnapshot {
  return { draft: readDraft(), saved: readSaved(), shortlist: readShortlist(), checklist: readChecklist() };
}

export function hasLocalHubData(snapshot: LocalHubSnapshot = readLocalHub()): boolean {
  return (
    Object.keys(snapshot.draft).length > 0 ||
    snapshot.saved.length > 0 ||
    snapshot.shortlist.length > 0 ||
    snapshot.checklist.length > 0
  );
}

/** After a successful import into the member's project. */
export function clearLocalHub(): void {
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
