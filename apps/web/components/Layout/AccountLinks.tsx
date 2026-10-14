'use client';

import Link from 'next/link';
import { House, LogIn, LogOut, ShoppingBag, UserRoundPlus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ACCOUNT_NAV } from '@/lib/nav';
import { useAuthState } from '@/lib/hooks/useAuthState';
import { buttonClasses } from '@/components/ui/Button';

/**
 * Account area from the nav config: login / signup, or "הבית שלי" + sign out.
 * `bar` sits in the dark utility bar; `drawer` is for the mobile menu.
 * Session state is read in the browser so pages stay static.
 */
export default function AccountLinks({ variant = 'bar' }: { variant?: 'bar' | 'drawer' | 'desktop' }) {
  const state = useAuthState();

  if (variant === 'drawer') {
    if (state === 'unknown') return <div className="h-12" aria-hidden="true" />;
    if (state === 'signed-in') {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Link href={ACCOUNT_NAV.home.href} prefetch={false} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
            <House aria-hidden="true" />
            {ACCOUNT_NAV.home.label}
          </Link>
          <form action={ACCOUNT_NAV.signOutAction} method="post" className="flex">
            <button type="submit" className={buttonClasses({ variant: 'outline', size: 'lg', fullWidth: true })}>
              <LogOut aria-hidden="true" />
              התנתקות
            </button>
          </form>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2">
        <Link href={ACCOUNT_NAV.signup.href} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
          <UserRoundPlus aria-hidden="true" />
          {ACCOUNT_NAV.signup.label}
        </Link>
        <Link href={ACCOUNT_NAV.login.href} className={buttonClasses({ variant: 'outline', size: 'lg' })}>
          <LogIn aria-hidden="true" />
          {ACCOUNT_NAV.login.label}
        </Link>
      </div>
    );
  }

  // Inline links (utility bar on dark, or plain desktop).
  const dark = variant === 'bar';
  const linkCls = cn(
    'inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors [&_svg]:size-3.5',
    dark ? 'text-white/75 hover:text-white' : 'text-ink-600 hover:text-ink-900',
  );
  const sep = <span aria-hidden="true" className={cn('h-3 w-px', dark ? 'bg-white/20' : 'bg-ink-200')} />;

  if (state === 'unknown') return <span className="inline-block w-40" aria-hidden="true" />;

  return (
    <div className="flex items-center gap-3">
      {state === 'signed-in' ? (
        <>
          <Link href={ACCOUNT_NAV.home.href} prefetch={false} className={cn(linkCls, 'font-semibold', dark ? '!text-white' : '!text-ink-900')}>
            <House aria-hidden="true" />
            {ACCOUNT_NAV.home.label}
          </Link>
          {sep}
          <form action={ACCOUNT_NAV.signOutAction} method="post">
            <button type="submit" className={linkCls}>
              התנתקות
            </button>
          </form>
        </>
      ) : (
        <>
          <Link href={ACCOUNT_NAV.login.href} className={linkCls}>
            {ACCOUNT_NAV.login.label}
          </Link>
          {sep}
          <Link href={ACCOUNT_NAV.signup.href} className={linkCls}>
            {ACCOUNT_NAV.signup.label}
          </Link>
          {sep}
          <Link href={ACCOUNT_NAV.home.href} prefetch={false} className={cn(linkCls, 'font-semibold', dark ? '!text-white' : '!text-ink-900')}>
            <House aria-hidden="true" />
            {ACCOUNT_NAV.home.label}
          </Link>
        </>
      )}
      {sep}
      <Link href={ACCOUNT_NAV.cart.href} prefetch={false} className={linkCls} aria-label={ACCOUNT_NAV.cart.label}>
        <ShoppingBag aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">סל</span>
      </Link>
    </div>
  );
}
