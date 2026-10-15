import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatDeltaPct } from '@/lib/command/format';
import type { Delta } from '@/lib/command/types';

export type DeltaGood = 'up' | 'down' | 'neutral';

/**
 * Signed change against the previous period. Colour follows direction x
 * whether up is good, and the arrow and sign carry it too (never colour alone).
 */
export function DeltaText({
  delta,
  good = 'up',
  label,
  className,
}: {
  delta: Delta;
  good?: DeltaGood;
  /** "לעומת 30 הימים הקודמים" */
  label: string;
  className?: string;
}) {
  if (delta.pct == null) {
    return (
      <p className={cn('flex flex-wrap items-center gap-x-1.5 text-xs text-ink-500', className)}>
        {delta.current > 0 ? 'חדש: בתקופה הקודמת לא היה כלום' : 'אין עדיין נתונים להשוואה'}
      </p>
    );
  }
  const better = good === 'neutral' || delta.direction === 'flat' ? null : (delta.direction === 'up') === (good === 'up');
  const tone = better == null ? 'text-ink-600' : better ? 'text-success-700' : 'text-danger-700';
  const Icon = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-1.5 text-xs', className)}>
      <span className={cn('inline-flex items-center gap-1 font-semibold', tone)}>
        <Icon className="size-3.5" aria-hidden="true" />
        <bdi dir="ltr">{formatDeltaPct(delta.pct)}</bdi>
      </span>
      <span className="text-ink-500">{label}</span>
    </p>
  );
}

/** "לעומת 30 הימים הקודמים" / "לעומת 7 הימים הקודמים". */
export function vsPreviousLabel(days: number): string {
  return `לעומת ${days} הימים הקודמים`;
}

/**
 * A Command Center tile: title, a one-line "what it is and how it's
 * computed", the number, and room for a small chart or rows.
 */
export function Tile({
  id,
  title,
  icon,
  explain,
  value,
  valueSize = 'md',
  badge,
  sub,
  children,
  footer,
  className,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  explain: ReactNode;
  value?: ReactNode;
  valueSize?: 'md' | 'lg';
  badge?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  footer?: { href: string; label: string } | null;
  className?: string;
}) {
  return (
    <Card as="section" padding="none" aria-labelledby={`${id}-title`} className={cn('flex min-w-0 flex-col p-4 sm:p-5', className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-bold text-ink-900">
            {icon && (
              <span aria-hidden="true" className="inline-flex text-primary-600 [&_svg]:size-4">
                {icon}
              </span>
            )}
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-ink-500">{explain}</p>
        </div>
        {badge}
      </header>
      {value != null && (
        <p className={cn('mt-3 font-extrabold leading-none tracking-tight text-ink-900', valueSize === 'lg' ? 'text-4xl sm:text-5xl' : 'text-3xl')}>
          <bdi dir="ltr">{value}</bdi>
        </p>
      )}
      {sub && <div className="mt-2 space-y-1">{sub}</div>}
      {children && <div className="mt-4 min-w-0 flex-1">{children}</div>}
      {footer && (
        <Link
          href={footer.href}
          className="mt-4 inline-flex items-center gap-1 self-start rounded-lg text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
        >
          {footer.label}
          <ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}
