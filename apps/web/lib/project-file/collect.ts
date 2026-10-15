/**
 * collectProjectFile(): the visitor's project file, assembled in the browser
 * from the snapshots other squads write (docs/platform/PROGRAM.md §6):
 *
 *   bb.hub.draft        hub        onboarding answers (stage, region, m², budget, move-in)
 *   bb.planner.last     growth     the last budget-planner estimate
 *   bb.advisor.recent   advisor    the last 10 questions ({ q, at }[])
 *   bb.shortlist        hub        shortlisted business ids
 *   bb.hub.saved        hub        saved items (hub-internal; only the count is read, as the hub's own snapshot does)
 *   bb_utm (session)    analytics  the landing UTMs (lib/analytics/track.ts)
 *
 * Every read is defensive (missing keys, blocked storage and malformed JSON
 * are skipped), so this never throws and works before those squads ship. The
 * landing page and last touch are added on the server from the visit's own
 * events, and so is the member snapshot (lib/project-file/server.ts).
 *
 * Client-safe (no server imports).
 */
import { SAVED_KEY as HUB_SAVED_KEY, normalizeLocalSaved } from '@/lib/hub/local-saved';
import { mergeProjectFiles, sanitizeProjectFile, toPlannerEstimate, toQuestions, toShortlist, toUtm } from './sanitize';
import { PROJECT_FILE_STORAGE_KEYS, SESSION_UTM_KEY, type ProjectFile } from './types';

export type StorageLike = Pick<Storage, 'getItem'>;

function readJson(storage: StorageLike | null | undefined, key: string): unknown {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Pure: build the file from storage objects (unit-tested with fakes). */
export function readProjectSnapshots(local: StorageLike | null | undefined, session?: StorageLike | null): ProjectFile {
  const K = PROJECT_FILE_STORAGE_KEYS;
  const draftRaw = readJson(local, K.hubDraft);
  // The hub draft may be the bare onboarding answers or wrap them ({ answers } / { project }).
  const draftObj =
    draftRaw && typeof draftRaw === 'object' && !Array.isArray(draftRaw)
      ? ((draftRaw as Record<string, unknown>).answers ?? (draftRaw as Record<string, unknown>).project ?? draftRaw)
      : undefined;
  const draft = sanitizeProjectFile(draftObj);
  // A draft carries onboarding facts only; questions and the shortlist come from their own keys.
  delete draft.questions;
  delete draft.shortlistBusinessIds;
  delete draft.source;

  const planner = toPlannerEstimate(readJson(local, K.plannerLast));
  const questions = toQuestions(readJson(local, K.advisorRecent));
  const shortlist = toShortlist(readJson(local, K.shortlist));
  // Saved content (pros are the shortlist), counted like lib/hub/snapshot.ts buildLocalSnapshot().
  const savedCount = normalizeLocalSaved(readJson(local, HUB_SAVED_KEY)).filter((i) => i.kind !== 'business').length;
  const utm = toUtm(readJson(session, SESSION_UTM_KEY));

  const fromKeys: ProjectFile = { version: 1 };
  if (planner) fromKeys.plannerEstimate = planner;
  if (questions) fromKeys.questions = questions;
  if (shortlist) fromKeys.shortlistBusinessIds = shortlist;
  if (savedCount) fromKeys.savedCount = savedCount;
  if (utm) fromKeys.source = { utm };
  return mergeProjectFiles(draft, fromKeys);
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window[kind] : null;
  } catch {
    return null; // blocked storage throws on access
  }
}

/** The current visitor's file (browser). Empty on the server. Never throws. */
export function collectProjectFile(): ProjectFile {
  if (typeof window === 'undefined') return { version: 1 };
  try {
    return readProjectSnapshots(browserStorage('localStorage'), browserStorage('sessionStorage'));
  } catch {
    return { version: 1 };
  }
}
