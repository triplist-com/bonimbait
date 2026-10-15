'use client';

import { importLocalHubAction } from '@/app/my-home/actions';
import { clearLocalHubKeys, hasLocalHubRaw, readLocalHubRaw } from '@/lib/hub/local-saved';

/**
 * Move this browser's anonymous hub (bb.hub.draft, saved items,
 * bb.shortlist, ticks) into the signed-in member's account, then forget it.
 * Lean (raw values; the server validates), so login and signup can call it
 * right after the session starts. Resolves true when something moved.
 */
export async function importLocalHubNow(): Promise<boolean> {
  const raw = readLocalHubRaw();
  if (!hasLocalHubRaw(raw)) return false;
  try {
    const res = await importLocalHubAction(raw);
    if (!res.ok) return false;
    clearLocalHubKeys();
    return true;
  } catch {
    return false;
  }
}
