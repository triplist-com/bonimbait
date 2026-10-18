import Link from 'next/link';
import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CardTone = 'white' | 'sand' | 'ink' | 'brand' | 'outline';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const TONES: Record<CardTone, string> = {
  white: 'bg-white border border-ink-100 shadow-card',
  sand: 'bg-sand-50 border border-sand-200',
  ink: 'bg-ink-900 text-white border border-white/10',
  brand: 'bg-primary-600 text-white',
  outline: 'bg-transparent border border-ink-200',
};

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export interface CardStyleOptions {
  tone?: CardTone;
  padding?: CardPadding;
  /** Hover lift for clickable cards. */
  interactive?: boolean;
  className?: string;
}

export function cardClasses({ tone = 'white', padding = 'md', interactive, className }: CardStyleOptions = {}) {
  return cn(
    'relative rounded-2xl',
    TONES[tone],
    PADDING[padding],
    interactive &&
      'transition-[box-shadow,transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-card-hover hover:border-ink-200',
    className,
  );
}

export interface CardProps extends HTMLAttributes<HTMLElement>, Omit<CardStyleOptions, 'className'> {
  as?: ElementType;
}

/** Surface container. `as="article"` / `as="li"` for semantics. */
export function Card({ as: Tag = 'div', tone, padding, interactive, className, ...rest }: CardProps) {
  return <Tag className={cardClasses({ tone, padding, interactive, className })} {...rest} />;
}

/**
 * Whole-card link: the title is the real link and a stretched ::after makes the
 * card clickable, so nested links (e.g. a category chip) still work and screen
 * readers hear one concise link name.
 */
export function CardLinkTitle({
  href,
  children,
  className,
  as: Tag = 'h3',
}: {
  href: string;
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Tag className={cn('font-bold text-ink-900', className)}>
      <Link
        href={href}
        className="outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-primary-600"
      >
        {children}
      </Link>
    </Tag>
  );
}
