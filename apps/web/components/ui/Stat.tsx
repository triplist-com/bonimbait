import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StatProps {
  value: ReactNode;
  label: ReactNode;
  icon?: ReactNode;
  /** Small text under the label (source, period). */
  hint?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  align?: 'start' | 'center';
  /** Light text for ink and brand sections. */
  inverse?: boolean;
  className?: string;
}

const SIZES = {
  md: 'text-2xl',
  lg: 'text-3xl sm:text-4xl',
  xl: 'text-4xl sm:text-5xl',
} as const;

/** A headline number with its label. The number is isolated LTR inside Hebrew. */
export function Stat({ value, label, icon, hint, size = 'lg', align = 'start', inverse, className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-1', align === 'center' && 'items-center text-center', className)}>
      {icon && (
        <span aria-hidden="true" className={cn('mb-2 inline-flex [&_svg]:size-6', inverse ? 'text-primary-300' : 'text-primary-600')}>
          {icon}
        </span>
      )}
      <span className={cn('num font-extrabold leading-none tracking-tight', SIZES[size], inverse ? 'text-white' : 'text-ink-900')}>
        {value}
      </span>
      <span className={cn('text-sm font-medium', inverse ? 'text-white/75' : 'text-ink-600')}>{label}</span>
      {hint && <span className={cn('text-xs', inverse ? 'text-white/55' : 'text-ink-500')}>{hint}</span>}
    </div>
  );
}
