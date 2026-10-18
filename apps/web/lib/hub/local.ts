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
 * The saved-items part lives in ./local-saved (lean, for the ♡ buttons).
 */
import { isChecklistItemId } from './content';
import { parsePlannerEstimate } from './estimate';
import {
  CHECKLIST_KEY,
  DRAFT_KEY,
  PLANNER_KEY,
  clearLocalHubKeys,
  readJson,
  readSaved,
  readShortlist,
  writeJson,
  type LocalSavedItem,
} from './local-saved';
import { normalizeDraft } from './onboarding';
import type { HubDraft, PlannerEstimate } from './types';

export {
  CHECKLIST_KEY,
  DRAFT_KEY,
  HUB_CHANGE_EVENT,
  LOCAL_SAVED_MAX,
  PLANNER_KEY,
  SAVED_KEY,
  SHORTLIST_KEY,
  isLocallySaved,
  normalizeLocalSaved,
  onHubStorageChange,
  readSaved,
  readShortlist,
  toggleLocalSaved,
  writeSaved,
  writeShortlist,
  type LocalSavedItem,
} from './local-saved';

export const ADVISOR_KEY = 'bb.advisor.recent';

// --- Draft --------------------------------------------------------------------

export function readDraft(): HubDraft {
  return normalizeDraft(readJson(DRAFT_KEY));
}

export function writeDraft(draft: HubDraft): void {
  const clean = normalizeDraft(draft);
  writeJson(DRAFT_KEY, Object.keys(clean).length ? clean : null);
}

// --- Checklist ------------------------------------------------------------------

export function readChecklist(): string[] {
  const value = readJson(CHECKLIST_KEY);
  const done =
    value && typeof value === 'object' && Array.isArray((value as { done?: unknown }).done)
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
  return Array.isArray(value)
    ? value.filter((v) => v && typeof v === 'object' && typeof (v as { q?: unknown }).q === 'string').length
    : 0;
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
  clearLocalHubKeys();
}
