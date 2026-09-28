'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { AUTH_LINKS } from '@/lib/content/navigation';

type State = 'unknown' | 'signed-out' | 'signed-in';

/**
 * Login / signup, or account / sign-out links. Session state is read in the
 * browser so that pages stay static (ISR): a server-side cookie read in the
 * header would make every page dynamic.
 */
export default function AccountLinks({ variant = 'desktop' }: { variant?: 'desktop' | 'drawer' }) {
  const [state, setState] = useState<State>('unknown');

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

  const drawer = variant === 'drawer';
  const linkCls = drawer
    ? 'flex-1 text-center py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50'
    : 'text-sm font-medium text-gray-600 hover:text-primary transition-colors';

  if (state === 'unknown') {
    return <span className={drawer ? 'block h-10' : 'inline-block w-20'} aria-hidden="true" />;
  }

  if (state === 'signed-in') {
    return (
      <div className={drawer ? 'flex gap-2' : 'flex items-center gap-3'}>
        <Link href={AUTH_LINKS.account} className={linkCls}>
          החשבון שלי
        </Link>
        <form action="/auth/signout/" method="post" className={drawer ? 'flex-1 flex' : ''}>
          <button type="submit" className={drawer ? `${linkCls} w-full` : linkCls}>
            התנתקות
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={drawer ? 'flex gap-2' : 'flex items-center gap-3'}>
      <Link href={AUTH_LINKS.login} className={linkCls}>
        התחברות
      </Link>
      <Link
        href={AUTH_LINKS.signup}
        className={
          drawer
            ? 'flex-1 text-center py-2.5 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800'
            : 'text-sm font-semibold text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-primary hover:text-primary transition-colors'
        }
      >
        הרשמה
      </Link>
    </div>
  );
}
