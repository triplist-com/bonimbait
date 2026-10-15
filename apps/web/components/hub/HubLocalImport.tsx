'use client';

/**
 * For a signed-in member on /my-home/: if this browser still holds an
 * anonymous hub (a Google login skips the login form's own import), move it
 * into the account once, then refresh. Shows a short confirmation.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importLocalHubNow } from './importLocal';

export default function HubLocalImport() {
  const router = useRouter();
  const ran = useRef(false);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    importLocalHubNow().then((ok) => {
      if (!ok) return;
      setMoved(true);
      router.refresh();
    });
  }, [router]);

  return (
    <div role="status" aria-live="polite">
      {moved && (
        <div className="container-page pt-4">
          <p className="rounded-2xl bg-success-50 p-3 text-body-sm font-semibold text-success-800 ring-1 ring-inset ring-success-100">
            העברנו את המפה מהמכשיר הזה לחשבון שלכם. מעכשיו היא שמורה לתמיד.
          </p>
        </div>
      )}
    </div>
  );
}
