import 'server-only';

/**
 * The project file on the server: what a stored lead carries.
 *
 *   const { file, score } = await buildProjectFile({ clientFile, memberId, formFacts, visitor, attribution });
 *
 * Precedence (later wins single facts; lists are unioned):
 *   1. the browser snapshot (collectProjectFile(), untrusted: sanitized here)
 *   2. the member's hub snapshot (source of truth for members; lib/hub via the adapter)
 *   3. what the visitor just typed in this form (stage, region)
 *   4. this visit: landing page + UTMs (first page_view of the session) and
 *      the 4-hour last touch (leads.attribution)
 * The score adds one server signal: how many visits this visitor made
 * (distinct sessions in 90 days).
 *
 * Never throws: every lookup degrades to "unknown".
 */
import type { LeadAttribution } from '@/lib/analytics/attribution';
import { isPlatformDbConfigured, platformAdminDb, withTimeout } from '@/lib/platform/db';
import { loadMemberProjectSnapshot } from './hub-adapter';
import { mergeProjectFiles, sanitizeProjectFile, toLandingPath, toUtm } from './sanitize';
import { scoreProjectFile } from './score';
import type { ProjectFile, ProjectFileEnvelope } from './types';

const VISIT_WINDOW_DAYS = 90;

export type VisitContext = { landing?: string; utm?: Record<string, string>; visits: number };

/** This visit's landing page and UTMs, and the visitor's visit count. Never throws. */
export async function loadVisitContext(anonId: string | null | undefined, sessionId: string | null | undefined): Promise<VisitContext> {
  if (!isPlatformDbConfigured() || (!anonId && !sessionId)) return { visits: 0 };
  const db = platformAdminDb();
  const since = new Date(Date.now() - VISIT_WINDOW_DAYS * 86_400_000).toISOString();
  const [first, sessions] = await Promise.all([
    sessionId
      ? withTimeout(
          db
            .from('platform_events')
            .select('path, utm')
            .eq('session_id', sessionId)
            .eq('name', 'page_view')
            .order('occurred_at', { ascending: true })
            .limit(1),
          1500,
          'landing lookup',
        ).catch(() => null)
      : null,
    anonId
      ? withTimeout(
          db.from('platform_events').select('session_id').eq('anon_id', anonId).eq('name', 'page_view').gte('occurred_at', since).limit(2000),
          1500,
          'visits lookup',
        ).catch(() => null)
      : null,
  ]);
  const row = first && !first.error ? first.data?.[0] : undefined;
  const ids = new Set((sessions && !sessions.error ? sessions.data ?? [] : []).map((r) => r.session_id).filter(Boolean));
  if (sessionId) ids.add(sessionId);
  return {
    landing: toLandingPath(row?.path ?? undefined),
    utm: toUtm(row?.utm),
    visits: ids.size,
  };
}

/** Compact last-touch code for the file: "partner:<id>", "campaign:facebook", "ai_source:video:abc". */
export function lastTouchCode(a: LeadAttribution | null | undefined): string | undefined {
  if (!a) return undefined;
  return `${a.medium}:${a.source ?? '-'}`.slice(0, 200);
}

export type BuildProjectFileInput = {
  /** The browser's file (hidden form field / action argument). Untrusted. */
  clientFile?: unknown;
  memberId?: string | null;
  /** Facts typed in this form (stage may be a profile stage like 'tender'). */
  formFacts?: { stage?: unknown; regionSlug?: unknown };
  visitor?: { anonId: string | null; sessionId: string | null };
  attribution?: LeadAttribution | null;
};

export async function buildProjectFile(input: BuildProjectFileInput): Promise<ProjectFileEnvelope> {
  const client = sanitizeProjectFile(input.clientFile);
  // The visit's own events decide where it came from; the browser's session
  // UTMs only fill in when analytics has nothing (e.g. it is switched off).
  const clientUtm = client.source?.utm;
  delete client.source;
  const form = sanitizeProjectFile({ stage: input.formFacts?.stage, regionSlug: input.formFacts?.regionSlug });

  const [member, visit] = await Promise.all([
    input.memberId ? loadMemberProjectSnapshot(input.memberId) : Promise.resolve(null),
    loadVisitContext(input.visitor?.anonId, input.visitor?.sessionId).catch((): VisitContext => ({ visits: 0 })),
  ]);
  if (member) delete member.source;

  const source: ProjectFile['source'] = {};
  const utm = visit.utm ?? clientUtm;
  if (utm) source.utm = utm;
  if (visit.landing) source.landing = visit.landing;
  const touch = lastTouchCode(input.attribution);
  if (touch) source.lastTouch = touch;

  const file = mergeProjectFiles(client, member, form, Object.keys(source).length ? { version: 1, source } : null);
  return { file, score: scoreProjectFile(file, { visits: visit.visits }) };
}
