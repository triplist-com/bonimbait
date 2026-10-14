import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type IconButtonVariant = 'ghost' | 'outline' | 'primary' | 'secondary' | 'inverse' | 'glass';
export type IconButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
  outline: 'border border-ink-200 bg-white text-ink-800 hover:border-primary-600 hover:text-primary-700',
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-brand',
  secondary: 'bg-ink-900 text-white hover:bg-ink-800',
  inverse: 'bg-white text-ink-900 hover:bg-sand-100',
  glass: 'bg-white/15 text-white backdrop-blur hover:bg-white/25',
};

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-9 [&_svg]:size-[1.125rem]',
  md: 'size-11 [&_svg]:size-5',
  lg: 'size-12 [&_svg]:size-6',
};

export function iconButtonClasses({
  variant = 'ghost',
  size = 'md',
  round = false,
  className,
}: { variant?: IconButtonVariant; size?: IconButtonSize; round?: boolean; className?: string } = {}) {
  return cn(
    'inline-flex shrink-0 items-center justify-center transition-colors duration-200',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
    'disabled:pointer-events-none disabled:opacity-50',
    round ? 'rounded-full' : 'rounded-xl',
    SIZES[size],
    VARIANTS[variant],
    className,
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: icon-only controls need an accessible name. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  round?: boolean;
}

/** Icon-only button. `label` becomes aria-label (and a native tooltip via title). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant, size, round, className, type, title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={title ?? label}
      className={iconButtonClasses({ variant, size, round, className })}
      {...rest}
    >
      <span aria-hidden="true" className="contents">
        {icon}
      </span>
    </button>
  );
});

/** Icon-only link with the same look. */
export function IconLink({
  href,
  label,
  icon,
  variant,
  size,
  round,
  className,
  external,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  round?: boolean;
  className?: string;
  external?: boolean;
}) {
  const classes = iconButtonClasses({ variant, size, round, className });
  const inner = (
    <span aria-hidden="true" className="contents">
      {icon}
    </span>
  );
  if (external || /^(https?:|mailto:|tel:)/.test(href)) {
    return (
      <a href={href} aria-label={label} title={label} className={classes} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={label} title={label} className={classes}>
      {inner}
    </Link>
  );
}
