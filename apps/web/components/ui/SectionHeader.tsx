import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Wraps the first occurrence of `highlight` inside `title` in a highlight span. */
export function highlightTitle(title: string, highlight?: string, highlightClass = 'text-primary-600'): ReactNode {
  if (!highlight) return title;
  const i = title.indexOf(highlight);
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i)}
      <span className={highlightClass}>{highlight}</span>
      {title.slice(i + highlight.length)}
    </>
  );
}

export interface SectionHeaderProps {
  title: string;
  /** Word(s) of the title shown in magenta, like the live site's headings. */
  highlight?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: { href: string; label: string };
  align?: 'start' | 'center';
  /** Heading id (pass the same value to <Section labelledBy>). */
  id?: string;
  as?: 'h1' | 'h2' | 'h3';
  /** Light text for ink and brand sections. */
  inverse?: boolean;
  className?: string;
}

/** Eyebrow + headline + description, with an optional "see all" link. */
export function SectionHeader({
  title,
  highlight,
  eyebrow,
  description,
  action,
  align = 'start',
  id,
  as: Heading = 'h2',
  inverse,
  className,
}: SectionHeaderProps) {
  const centered = align === 'center';
  return (
    <div
      className={cn(
        'mb-8 flex gap-4 sm:mb-10',
        centered ? 'flex-col items-center text-center' : 'flex-col sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className={cn('max-w-2xl', centered && 'mx-auto')}>
        {eyebrow && <p className={cn('eyebrow mb-3', inverse && '!text-primary-300')}>{eyebrow}</p>}
        <Heading id={id} className={cn('text-headline', inverse ? 'text-white' : 'text-ink-900')}>
          {highlightTitle(title, highlight, inverse ? 'text-primary-400' : 'text-primary-600')}
        </Heading>
        {description && <p className={cn('mt-3 text-body-lg', inverse ? 'text-white/70' : 'text-ink-600')}>{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className={cn(
            'group inline-flex shrink-0 items-center gap-1.5 rounded-lg py-1 text-[0.9375rem] font-semibold transition-colors',
            inverse ? 'text-white hover:text-primary-300' : 'text-ink-900 hover:text-primary-700',
          )}
        >
          {action.label}
          <ArrowLeft
            aria-hidden="true"
            className="size-4 transition-transform duration-200 group-hover:-translate-x-1 ltr:rotate-180"
          />
        </Link>
      )}
    </div>
  );
}
