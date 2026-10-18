import 'server-only';

/**
 * The member's part of the project file, from the hub squad:
 * getMemberProjectSnapshot() in lib/hub/server.ts (the PROGRAM.md §6 fields;
 * service role, keyed by the member id from the session, never by a
 * client-supplied id; never throws; null when the member has no project).
 *
 * A member who never went through the hub onboarding still told us their
 * stage and region at signup (profiles.construction_stage / region_id): those
 * fill the file too, under the hub project (the hub wins every fact it has).
 *
 * The lead path adds its own guard on top: a hub slower than 1.5s is skipped
 * (the browser snapshot still fills the file), and the result goes through
 * sanitizeProjectFile like every other source (caps and ranges).
 */
import { getMemberProjectSnapshot } from '@/lib/hub/server';
import { withTimeout } from '@/lib/platform/db';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { isEmptyProjectFile, mergeProjectFiles, sanitizeProjectFile } from './sanitize';
import type { ProjectFile } from './types';

const HUB_TIMEOUT_MS = 1500;

/** Stage and region from the member's profile (service role: keyed by the verified member id). */
export async function loadMemberProfileFacts(memberId: string): Promise<ProjectFile | null> {
  if (!memberId || !isServiceRoleConfigured()) return null;
  const db = createAdminClient();
  const { data, error } = await db.from('profiles').select('construction_stage, region_id').eq('id', memberId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  let regionSlug: string | undefined;
  if (data.region_id) {
    const region = await db.from('regions').select('slug').eq('id', data.region_id).maybeSingle();
    regionSlug = region.data?.slug ?? undefined;
  }
  const file = sanitizeProjectFile({ stage: data.construction_stage, regionSlug });
  return isEmptyProjectFile(file) ? null : file;
}

function logUnavailable(what: string, err: unknown): null {
  console.error(`[project-file] ${what} unavailable: ${err instanceof Error ? err.message : String(err)}`);
  return null;
}

/** The member's project file from the hub (and their profile), or null. Never throws. */
export async function loadMemberProjectSnapshot(memberId: string): Promise<ProjectFile | null> {
  if (!memberId) return null;
  try {
    const [snapshot, profile] = await Promise.all([
      withTimeout(getMemberProjectSnapshot(memberId), HUB_TIMEOUT_MS, 'hub member snapshot').catch((err) => logUnavailable('hub snapshot', err)),
      withTimeout(loadMemberProfileFacts(memberId), HUB_TIMEOUT_MS, 'member profile').catch((err) => logUnavailable('member profile', err)),
    ]);
    const file = mergeProjectFiles(profile, snapshot ? sanitizeProjectFile(snapshot) : null);
    return isEmptyProjectFile(file) ? null : file;
  } catch (err) {
    return logUnavailable('member file', err);
  }
}
