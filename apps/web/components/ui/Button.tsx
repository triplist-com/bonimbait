import Link from 'next/link';
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ' +
  'active:translate-y-px';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white shadow-[0_6px_16px_-8px_rgb(230_21_89/0.7)] hover:bg-primary-700 active:bg-primary-800',
  secondary: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950',
  outline: 'border border-ink-200 bg-white text-ink-900 hover:border-primary-600 hover:text-primary-700 active:bg-primary-50',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200',
  link: 'h-auto !px-0 text-primary-700 underline-offset-4 hover:underline hover:text-primary-800',
  inverse: 'bg-white text-ink-900 hover:bg-sand-100 active:bg-sand-200',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-lg [&_svg]:size-4',
  md: 'h-11 px-5 text-[0.9375rem] rounded-xl [&_svg]:size-[1.125rem]',
  lg: 'h-12 px-6 text-base rounded-xl [&_svg]:size-5',
  xl: 'h-14 px-7 text-lg rounded-2xl [&_svg]:size-5',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Button classes for any element: `<summary className={buttonClasses({ variant: 'outline' })}>`. */
export function buttonClasses({ variant = 'primary', size = 'md', fullWidth, className }: ButtonStyleOptions = {}): string {
  return cn(BASE, SIZES[size], VARIANTS[variant], fullWidth && 'w-full', className);
}

interface ContentProps {
  loading?: boolean;
  /** Icon before the label (right side in RTL). */
  iconStart?: ReactNode;
  /** Icon after the label (left side in RTL), e.g. an arrow. */
  iconEnd?: ReactNode;
}

function Content({ loading, iconStart, iconEnd, children }: ContentProps & { children?: ReactNode }) {
  return (
    <>
      {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : iconStart}
      {children}
      {!loading && iconEnd}
    </>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ContentProps, Omit<ButtonStyleOptions, 'className'> {
  /** Render the single child element (e.g. a Link) with button styles instead of a <button>. */
  asChild?: boolean;
}

/**
 * Primary action component. Server-safe (no client hooks): use it in Server
 * Components for submit buttons and links, and in Client Components with onClick.
 *
 *   <Button>שאלו</Button>
 *   <Button variant="outline" size="lg" iconEnd={<ArrowLeft />}>לכל הסרטונים</Button>
 *   <Button loading>שולחים…</Button>
 *   <Button asChild><Link href="/calculator/">למחשבון</Link></Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, className, loading, iconStart, iconEnd, asChild, children, type, disabled, ...rest },
  ref,
) {
  const classes = buttonClasses({ variant, size, fullWidth, className });
  if (asChild) {
    const child = Children.only(children);
    if (!isValidElement(child)) return null;
    const el = child as ReactElement<{ className?: string; children?: ReactNode }>;
    return cloneElement(el, {
      ...rest,
      className: cn(classes, el.props.className),
      children: (
        <Content loading={loading} iconStart={iconStart} iconEnd={iconEnd}>
          {el.props.children}
        </Content>
      ),
    } as Record<string, unknown>);
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Content loading={loading} iconStart={iconStart} iconEnd={iconEnd}>
        {children}
      </Content>
    </button>
  );
});

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>,
    ContentProps,
    Omit<ButtonStyleOptions, 'className'> {
  href: string;
  /** Opens in a new tab with rel="noopener noreferrer" and a plain <a>. */
  external?: boolean;
  prefetch?: boolean;
}

/** A link that looks like a button (internal links use next/link). */
export function ButtonLink({
  href,
  external,
  variant,
  size,
  fullWidth,
  className,
  iconStart,
  iconEnd,
  loading,
  prefetch,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = buttonClasses({ variant, size, fullWidth, className });
  const content = (
    <Content loading={loading} iconStart={iconStart} iconEnd={iconEnd}>
      {children}
    </Content>
  );
  if (external || /^(https?:|mailto:|tel:)/.test(href)) {
    return (
      <a
        href={href}
        className={classes}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...rest}
      >
        {content}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetch} className={classes} {...rest}>
      {content}
    </Link>
  );
}
