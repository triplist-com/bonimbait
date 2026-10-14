'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export type AuthState = 'unknown' | 'signed-out' | 'signed-in';

/**
 * Signed-in state read in the browser, so pages stay static (ISR): reading the
 * session cookie on the server would make every page dynamic.
 */
export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>('unknown');

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState('signed-out');
      return;
    }
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(data.session ? 'signed-in' : 'signed-out');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? 'signed-in' : 'signed-out');
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
