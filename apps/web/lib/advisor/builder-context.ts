import 'server-only';

/**
 * Who is asking, as far as the answer's lead moments need it: the builder's
 * region and stage. Region-aware pros, the contextual partner offer and the
 * answer events (the partner portal counts askers by region) all read it.
 *
 *   1. the request: the browser sends `region` / `stage` from bb.hub.draft
 *      (anonymous visitors; lib/advisor/client/storage.ts);
 *   2. a signed-in member's project file (the hub project, else the profile:
 *      lib/project-file/hub-adapter.ts), for whatever the request lacks. A
 *      member's draft moves into the account on login, so the browser often
 *      has nothing.
 *
 * Never throws and never waits long: the adapter gives up after 1.5s.
 */
import { loadMemberProjectSnapshot } from '@/lib/project-file/hub-adapter';
import type { ProjectStageId } from '@/lib/project-file/types';
import type { Member } from './threads';
import type { AdvisorRequest } from './types';

export type BuilderContext = { regionSlug?: string; stage?: ProjectStageId };

export async function builderContext(
  req: Pick<AdvisorRequest, 'region' | 'stage'>,
  member: Member | null,
  loadFile: typeof loadMemberProjectSnapshot = loadMemberProjectSnapshot,
): Promise<BuilderContext> {
  const ctx: BuilderContext = {};
  if (req.region) ctx.regionSlug = req.region;
  if (req.stage) ctx.stage = req.stage;
  if ((ctx.regionSlug && ctx.stage) || !member) return ctx;
  try {
    const file = await loadFile(member.user.id);
    if (!ctx.regionSlug && file?.regionSlug) ctx.regionSlug = file.regionSlug;
    if (!ctx.stage && file?.stage) ctx.stage = file.stage;
  } catch {
    // The context is optional: answer without it.
  }
  return ctx;
}
