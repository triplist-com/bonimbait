import 'server-only';

/**
 * The member's part of the project file, from the hub squad:
 * getMemberProjectSnapshot() in lib/hub/server.ts (the PROGRAM.md §6 fields;
 * service role, keyed by the member id from the session, never by a
 * client-supplied id; never throws; null when the member has no project).
 *
 * The lead path adds its own guard on top: a hub slower than 1.5s is skipped
 * (the browser snapshot still fills the file), and the result goes through
 * sanitizeProjectFile like every other source (caps and ranges).
 */
import { getMemberProjectSnapshot } from '@/lib/hub/server';
import { withTimeout } from '@/lib/platform/db';
import { isEmptyProjectFile, sanitizeProjectFile } from './sanitize';
import type { ProjectFile } from './types';

const HUB_TIMEOUT_MS = 1500;

/** The member's project file from the hub, or null. Never throws. */
export async function loadMemberProjectSnapshot(memberId: string): Promise<ProjectFile | null> {
  if (!memberId) return null;
  try {
    const snapshot = await withTimeout(getMemberProjectSnapshot(memberId), HUB_TIMEOUT_MS, 'hub member snapshot');
    if (!snapshot) return null;
    const file = sanitizeProjectFile(snapshot);
    return isEmptyProjectFile(file) ? null : file;
  } catch (err) {
    console.error(`[project-file] hub snapshot unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
