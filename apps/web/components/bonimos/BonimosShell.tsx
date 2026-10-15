import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, BriefcaseBusiness, House } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';

export interface ShellLink {
  href: string;
  label: string;
  icon: 'projects' | 'home';
}

/**
 * The Bonim.Os app shell for /manage/*: a calm working tool in the owner's
 * brand, without the public site's navigation or its floating consult button
 * (SiteChromeGate hides those). Server-safe; the demo renders it too.
 */
export function BonimosShell({
  children,
  links,
  userName,
  current,
  homeHref = '/manage/',
}: {
  children: ReactNode;
  links: ShellLink[];
  userName?: string | null;
  /** href of the active link. */
  current?: string;
  homeHref?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper" data-shell="bonimos">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="container-page flex items-center gap-3 py-2.5 sm:gap-5">
          <Link href={homeHref} prefetch={false} className="flex shrink-0 items-center gap-2 rounded-lg py-1 text-ink-900" aria-label="Bonim.Os: הפרויקטים">
            <Logo accent className="h-7 w-auto sm:h-8" />
            <span dir="ltr" className="rounded-md bg-ink-900 px-1.5 py-0.5 text-[0.6875rem] font-extrabold tracking-wide text-white">
              Bonim.Os
            </span>
          </Link>
          {links.length > 0 && (
            <nav aria-label="Bonim.Os" className="min-w-0">
              <ul className="flex items-center gap-1">
                {links.map((l) => {
                  const Icon = l.icon === 'home' ? House : BriefcaseBusiness;
                  const active = current === l.href;
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        prefetch={false}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors',
                          active ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
                        )}
                      >
                        <Icon aria-hidden="true" className="size-4" />
                        <span className="hidden sm:inline">{l.label}</span>
                        <span className="sr-only sm:hidden">{l.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
          <div className="ms-auto flex min-w-0 items-center gap-2">
            {userName && <span className="hidden truncate text-sm text-ink-600 md:inline">שלום, {userName}</span>}
            <Link
              href="/"
              prefetch={false}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              לאתר בונים בית
              <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
            </Link>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-ink-100 bg-white">
        <p className="container-page py-4 text-caption text-ink-500">
          <span dir="ltr">Bonim.Os</span> · מערכת הליווי של בונים בית ללקוחות הניהול. המידע בפרויקט פרטי: רק לכם ולצוות הליווי שלכם יש גישה.
        </p>
      </footer>
    </div>
  );
}
