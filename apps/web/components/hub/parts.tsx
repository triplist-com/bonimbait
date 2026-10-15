import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogIn, UserRoundPlus } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/** A dashboard section: white card, an H2 with an optional line and action. Server-safe. */
export function HubSection({
  id,
  title,
  subtitle,
  icon,
  action,
  children,
  className,
  tone = 'white',
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'white' | 'sand' | 'plain';
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-28 rounded-3xl',
        tone === 'white' && 'border border-ink-100 bg-white p-5 shadow-card sm:p-6',
        tone === 'sand' && 'border border-sand-200 bg-sand-50 p-5 sm:p-6',
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span aria-hidden="true" className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 [&_svg]:size-5">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 id={headingId} className="text-title-lg text-ink-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-body-sm text-ink-600">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** "Sign up to keep it": the gentle prompt anonymous visitors see in member-only sections. */
export function SignupPrompt({
  title,
  description,
  next = '/my-home/',
  className,
}: {
  title: string;
  description: ReactNode;
  next?: string;
  className?: string;
}) {
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <div className={cn('rounded-2xl border-2 border-dashed border-ink-200 bg-paper p-5 text-center', className)}>
      <p className="text-title-sm text-ink-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-body-sm text-ink-600">{description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <ButtonLink href={`/signup/${q}`} variant="secondary" size="md" iconStart={<UserRoundPlus />} prefetch={false}>
          הרשמה בחינם
        </ButtonLink>
        <ButtonLink href={`/login/${q}`} variant="ghost" size="md" iconStart={<LogIn />} prefetch={false}>
          כבר רשומים? התחברו
        </ButtonLink>
      </div>
    </div>
  );
}

/** Inline text link in the hub's style. */
export function HubLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} prefetch={false} className={cn('link text-body-sm', className)}>
      {children}
    </Link>
  );
}
