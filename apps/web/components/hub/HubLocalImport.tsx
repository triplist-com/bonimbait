'use client';

/**
 * For a signed-in member: if this browser still holds an anonymous hub
 * (bb.hub.draft, saved items, bb.shortlist, ticks), move it into the
 * account once, then clear it and refresh. Renders a polite status line.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importLocalHubAction } from '@/app/my-home/actions';
import { clearLocalHub, hasLocalHubData, readLocalHub, readPlanner } from '@/lib/hub/local';

/** Import the local hub into the member's account. Resolves true when something moved. */
export async function importLocalHubNow(): Promise<boolean> {
  const snapshot = readLocalHub();
  if (!hasLocalHubData(snapshot)) return false;
  try {
    const res = await importLocalHubAction({ ...snapshot, planner: readPlanner() });
    if (!res.ok) return false;
    clearLocalHub();
    return true;
  } catch {
    return false;
  }
}

export default function HubLocalImport() {
  const router = useRouter();
  const ran = useRef(false);
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    importLocalHubNow().then((moved) => {
      if (!moved) return;
      setStatus('moved');
      router.refresh();
    });
  }, [router]);

  return (
    <div role="status" aria-live="polite">
      {status === 'moved' && (
        <div className="container-page pt-4">
          <p className="rounded-2xl bg-success-50 p-3 text-body-sm font-semibold text-success-800 ring-1 ring-inset ring-success-100">
            העברנו את המפה מהמכשיר הזה לחשבון שלכם. מעכשיו היא שמורה לתמיד.
          </p>
        </div>
      )}
    </div>
  );
}
