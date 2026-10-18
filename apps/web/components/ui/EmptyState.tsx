import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Buttons or links (e.g. <ButtonLink>). */
  actions?: ReactNode;
  /** `dashed` for "nothing here yet" slots inside a page. */
  variant?: 'plain' | 'dashed' | 'card';
  className?: string;
}

/** No results / nothing saved yet / error with a way forward. */
export function EmptyState({ icon, title, description, actions, variant = 'dashed', className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-12 text-center',
        variant === 'dashed' && 'rounded-3xl border-2 border-dashed border-ink-200 bg-white/60',
        variant === 'card' && 'rounded-3xl border border-ink-100 bg-white shadow-card',
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 [&_svg]:size-7">
          {icon}
        </span>
      )}
      <h3 className="text-title text-ink-900">{title}</h3>
      {description && <p className="mt-2 max-w-md text-body-sm text-ink-600">{description}</p>}
      {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </div>
  );
}
