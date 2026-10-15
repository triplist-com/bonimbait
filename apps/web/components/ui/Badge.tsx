import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'ink' | 'sand' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'glass';
export type BadgeSize = 'sm' | 'md';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100',
  ink: 'bg-ink-900 text-white',
  sand: 'bg-sand-100 text-sand-800 ring-1 ring-inset ring-sand-200',
  success: 'bg-success-50 text-success-700 ring-1 ring-inset ring-success-100',
  warning: 'bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-100',
  danger: 'bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-100',
  info: 'bg-info-50 text-info-700 ring-1 ring-inset ring-info-100',
  outline: 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200',
  glass: 'bg-black/45 text-white backdrop-blur-sm',
};

const DOTS: Partial<Record<BadgeTone, string>> = {
  brand: 'bg-primary-600',
  success: 'bg-success-600',
  warning: 'bg-warning-500',
  danger: 'bg-danger-600',
  info: 'bg-info-600',
  neutral: 'bg-ink-400',
};

const SIZES: Record<BadgeSize, string> = {
  sm: 'h-5 px-2 text-2xs gap-1 [&_svg]:size-3',
  md: 'h-6 px-2.5 text-xs gap-1.5 [&_svg]:size-3.5',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Leading status dot (colour + text, never colour alone). */
  dot?: boolean;
  icon?: ReactNode;
}

/** Small, non-interactive label: status, category, "חדש". */
export function Badge({ tone = 'neutral', size = 'md', dot, icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold leading-none', SIZES[size], TONES[tone], className)}
      {...rest}
    >
      {dot && <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOTS[tone] ?? 'bg-current')} />}
      {icon && <span aria-hidden="true" className="contents">{icon}</span>}
      {children}
    </span>
  );
}
