import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ChipSize = 'sm' | 'md';
export type ChipTone = 'light' | 'dark';

export interface ChipStyleOptions {
  selected?: boolean;
  size?: ChipSize;
  /** `dark` for chips on ink/brand backgrounds. */
  tone?: ChipTone;
  className?: string;
}

export function chipClasses({ selected, size = 'md', tone = 'light', className }: ChipStyleOptions = {}) {
  return cn(
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-colors duration-200',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
    size === 'sm' ? 'h-8 px-3 text-[0.8125rem] [&_svg]:size-3.5' : 'h-10 px-4 text-sm [&_svg]:size-4',
    tone === 'light'
      ? selected
        ? 'border-ink-900 bg-ink-900 text-white'
        : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900'
      : selected
        ? 'border-white bg-white text-ink-900'
        : 'border-white/20 bg-white/5 text-white/85 hover:bg-white/15 hover:text-white',
    className,
  );
}

interface ChipContent {
  icon?: ReactNode;
  /** Small count after the label, e.g. number of results. */
  count?: number;
  children: ReactNode;
}

function Inner({ icon, count, children, selected }: ChipContent & { selected?: boolean }) {
  return (
    <>
      {icon && <span aria-hidden="true" className="contents">{icon}</span>}
      <span>{children}</span>
      {typeof count === 'number' && (
        <span className={cn('num text-xs', selected ? 'opacity-80' : 'text-ink-500')}>{count.toLocaleString('he-IL')}</span>
      )}
    </>
  );
}

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, ChipContent, Omit<ChipStyleOptions, 'className'> {}

/** Toggleable filter pill. Exposes `aria-pressed` for its selected state. */
export function Chip({ selected, size, tone, icon, count, className, children, type, ...rest }: ChipProps) {
  return (
    <button type={type ?? 'button'} aria-pressed={selected} className={chipClasses({ selected, size, tone, className })} {...rest}>
      <Inner icon={icon} count={count} selected={selected}>
        {children}
      </Inner>
    </button>
  );
}

/** Pill that navigates (tags, suggested questions). `selected` maps to aria-current. */
export function ChipLink({
  href,
  selected,
  size,
  tone,
  icon,
  count,
  className,
  children,
  prefetch,
}: ChipContent & Omit<ChipStyleOptions, 'className'> & { href: string; className?: string; prefetch?: boolean }) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      aria-current={selected ? 'page' : undefined}
      className={chipClasses({ selected, size, tone, className })}
    >
      <Inner icon={icon} count={count} selected={selected}>
        {children}
      </Inner>
    </Link>
  );
}
