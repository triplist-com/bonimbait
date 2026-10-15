import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Breadcrumbs (rendered above the eyebrow). */
  crumbs?: ReactNode;
  /** Right-aligned (end) actions or a visual. */
  aside?: ReactNode;
  /** Extra content under the description (chips, search, stats). */
  children?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
}

/**
 * Top-of-page band for archives and hub pages: warm paper with a fading
 * blueprint grid, breadcrumbs, eyebrow, H1 and intro. One H1 per page.
 */
export function PageHeader({ title, eyebrow, description, crumbs, aside, children, align = 'start', className }: PageHeaderProps) {
  const centered = align === 'center';
  return (
    <header className={cn('relative isolate overflow-hidden border-b border-ink-100 bg-sand-50', className)}>
      <div aria-hidden="true" className="bg-blueprint mask-fade-b absolute inset-0 -z-10" />
      <div aria-hidden="true" className="absolute -top-48 end-[-14%] -z-10 size-[28rem] rounded-full bg-primary-100/40 blur-3xl" />
      <div className="container-page pb-10 pt-6 sm:pb-14 sm:pt-8">
        {crumbs}
        <div className={cn('mt-6 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between', centered && 'items-center text-center lg:flex-col lg:items-center')}>
          <div className={cn('max-w-3xl', centered && 'mx-auto')}>
            {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
            <h1 className="text-display text-ink-900">{title}</h1>
            {description && <div className="mt-4 text-body-lg text-ink-600">{description}</div>}
            {children && <div className="mt-6">{children}</div>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      </div>
    </header>
  );
}
