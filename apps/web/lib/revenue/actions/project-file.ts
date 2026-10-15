'use server';

/**
 * The signed-in member's project file, for the booking sheet to SHOW before
 * they book: a member's answers live in their hub project (the hub moves the
 * browser's draft into the account on login), so the browser alone would show
 * an empty file. Reads only the session's own member id; null for visitors.
 * The stored lead does not depend on this: the server merges the same
 * snapshot again (lib/project-file/server.ts).
 */
import { getUser } from '@/lib/auth/session';
import { loadMemberProjectSnapshot } from '@/lib/project-file/hub-adapter';
import type { ProjectFile } from '@/lib/project-file/types';

export async function loadMyProjectFile(): Promise<ProjectFile | null> {
  try {
    const user = await getUser();
    return user ? await loadMemberProjectSnapshot(user.id) : null;
  } catch {
    return null;
  }
}
