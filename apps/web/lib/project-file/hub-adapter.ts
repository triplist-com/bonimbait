import 'server-only';

/**
 * Adapter to the hub squad's member snapshot: `getMemberProjectSnapshot()` in
 * lib/hub/server.ts (built in parallel, Wave B).
 *
 * The hub module is looked up with webpack's require.context over lib/ filtered
 * to ./hub/server.ts: it resolves at build time and is simply EMPTY while
 * lib/hub/server.ts doesn't exist. So
 * this branch builds and runs without the hub, and picks the function up as
 * soon as it lands, with no import to wire at integration. Whatever the hub
 * returns is coerced through sanitizeProjectFile (camelCase or snake_case,
 * a bare snapshot or `{ project }`), and a slow or failing call is ignored:
 * the member's file then falls back to their browser snapshot.
 *
 * Tests inject a loader with setMemberSnapshotLoader().
 */
import { withTimeout } from '@/lib/platform/db';
import { createClient } from '@/lib/supabase/server';
import { isEmptyProjectFile, sanitizeProjectFile } from './sanitize';
import type { ProjectFile } from './types';

type Loader = (...args: unknown[]) => unknown;
type WebpackContext = { keys(): string[]; (id: string): unknown };
type ContextRequire = { context: (dir: string, recursive: boolean, filter: RegExp) => WebpackContext };

let override: Loader | null | undefined;
let resolved: Loader | null | undefined;

function resolveHubLoader(): Loader | null {
  if (override !== undefined) return override;
  if (resolved !== undefined) return resolved;
  resolved = null;
  try {
    // Must stay a literal `require.context(...)` call for webpack to resolve it at build time.
    // The context is lib/ (always there) filtered to ./hub/server.ts, so a missing hub is not a warning.
    const ctx = (require as unknown as ContextRequire).context('..', true, /^\.\/hub\/server\.tsx?$/);
    const key = ctx.keys()[0];
    const mod = key ? (ctx(key) as { getMemberProjectSnapshot?: unknown }) : null;
    if (mod && typeof mod.getMemberProjectSnapshot === 'function') resolved = mod.getMemberProjectSnapshot as Loader;
  } catch {
    // No webpack (tests, scripts) or no hub module: no member snapshot.
  }
  return resolved;
}

/** Tests: inject a loader (null = "no hub"); undefined restores the real lookup. */
export function setMemberSnapshotLoader(loader: Loader | null | undefined): void {
  override = loader;
}

export function hasHubSnapshot(): boolean {
  return resolveHubLoader() !== null;
}

/** The member's project file from the hub, or null. Never throws; gives up after 1.5s. */
export async function loadMemberProjectSnapshot(userId: string): Promise<ProjectFile | null> {
  const loader = resolveHubLoader();
  if (!loader || !userId) return null;
  try {
    // Accept (userId) and (db, userId) signatures.
    const call = loader.length >= 2 ? () => loader(createClient(), userId) : () => loader(userId);
    const raw = await withTimeout(Promise.resolve(call()), 1500, 'hub member snapshot');
    const value = raw && typeof raw === 'object' && 'project' in (raw as object) ? (raw as { project: unknown }).project : raw;
    const file = sanitizeProjectFile(value);
    return isEmptyProjectFile(file) ? null : file;
  } catch (err) {
    console.error(`[project-file] hub snapshot unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
