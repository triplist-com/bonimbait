'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { hasAuthCookie } from '@/lib/auth/cookie';

export type AuthState = 'unknown' | 'signed-out' | 'signed-in';

/**
 * Signed-in state for the header, read in the browser so pages stay static
 * (ISR): reading the session cookie on the server would make every page
 * dynamic.
 *
 * Cookie-first: with no Supabase auth cookie the visitor is signed out and
 * supabase-js (~70 KB gzipped) is never downloaded. With a cookie we show the
 * signed-in links at once, then load supabase-js when the browser is idle to
 * confirm the session and follow auth changes. Re-checked after navigation
 * (e.g. the redirect after login).
 */
export function useAuthState(): AuthState {
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>('unknown');

  useEffect(() => {
    if (!isSupabaseConfigured() || !hasAuthCookie(document.cookie)) {
      setState('signed-out');
      return;
    }
    setState('signed-in');

    let active = true;
    let unsubscribe: (() => void) | undefined;
    const verify = () => {
      import('@/lib/supabase/browser')
        .then(({ createClient }) => {
          if (!active) return;
          const supabase = createClient();
          supabase.auth.getSession().then(({ data }) => {
            if (active) setState(data.session ? 'signed-in' : 'signed-out');
          });
          const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (active) setState(session ? 'signed-in' : 'signed-out');
          });
          unsubscribe = () => data.subscription.unsubscribe();
        })
        .catch(() => {
          // Keep the cookie-based guess if the client fails to load.
        });
    };
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback : (cb: () => void) => window.setTimeout(cb, 200);
    const cancelIdle = typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback : window.clearTimeout;
    const handle = idle(verify);
    return () => {
      active = false;
      cancelIdle(handle);
      unsubscribe?.();
    };
  }, [pathname]);

  return state;
}
