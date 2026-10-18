import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { NavIcon } from '@/components/Layout/NavIcon';
import { PRIMARY_NAV } from '@/lib/nav';
import { cn } from '@/lib/cn';

/**
 * Branded system pages (404, 500, an unexpected stop): the owner's stage icon
 * on a blueprint plot, one short line in Tomer's voice, and a way forward
 * (ask, a main destination, or try again). Client-safe: error boundaries are
 * client components and render it too.
 */
export interface SystemPageProps {
  /** Big numeral behind the icon, e.g. "404". */
  code?: string;
  /** One of the owner's stage icons (/brand/stages/*.svg). */
  icon: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function SystemPage({ code, icon, eyebrow, title, description, children, className }: SystemPageProps) {
  return (
    <section aria-labelledby="system-title" className={cn('relative isolate overflow-hidden', className)}>
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="bg-blueprint mask-fade-b absolute inset-x-0 top-0 h-[30rem]" />
        <div className="absolute -top-40 end-[-12%] size-[30rem] rounded-full bg-primary-200/35 blur-3xl" />
      </div>
      <div className="container-page flex max-w-3xl flex-col items-center pb-16 pt-10 text-center sm:pb-24 sm:pt-16">
        <div className="relative flex h-36 w-full items-center justify-center sm:h-44" aria-hidden="true">
          {code && (
            <span className="num absolute select-none text-[7.5rem] font-extrabold leading-none tracking-tighter text-ink-900/[0.06] sm:text-[10rem]">
              {code}
            </span>
          )}
          <span className="relative inline-flex size-24 items-center justify-center rounded-[1.75rem] bg-white shadow-lift ring-1 ring-sand-200 motion-safe:animate-float sm:size-28">
            {/* eslint-disable-next-line @next/next/no-img-element -- the owner's small SVG stage icon */}
            <img src={icon} alt="" width={64} height={46} className="h-11 w-auto sm:h-12" />
          </span>
        </div>
        <p className="eyebrow mt-4">{eyebrow}</p>
        <h1 id="system-title" className="mt-2 text-headline text-ink-900 sm:text-display">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-body-lg text-ink-600">{description}</p>
        {children && <div className="mt-8 w-full">{children}</div>}
      </div>
    </section>
  );
}

/** The site's main destinations (lib/nav.ts), as a compact way out of a dead end. */
export function SystemDestinations({ title = 'או המשיכו מכאן' }: { title?: string }) {
  return (
    <nav aria-labelledby="system-destinations" className="mt-10 text-start">
      <h2 id="system-destinations" className="mb-3 text-center text-title-sm text-ink-700">
        {title}
      </h2>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {PRIMARY_NAV.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              prefetch={false}
              className="group flex min-h-16 items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 shadow-xs transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-600 group-hover:text-white">
                <NavIcon name={item.icon} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-title-sm text-ink-900">{item.label}</span>
                {item.description && <span className="block truncate text-caption text-ink-600">{item.description}</span>}
              </span>
              <ArrowLeft aria-hidden="true" className="size-4 shrink-0 text-ink-400 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
