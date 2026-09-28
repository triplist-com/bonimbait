import Link from 'next/link';
import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-primary hover:underline">
          → {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function ButtonLink({ href, children, variant = 'primary' }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const cls =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-primary-700'
      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50';
  return (
    <Link href={href} className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium shadow-sm ${cls}`}>
      {children}
    </Link>
  );
}

/** GET filter bar: plain form so filters live in the URL (shareable, back-button friendly). */
export function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-card">
      {children}
      <button type="submit" className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900">
        סינון
      </button>
    </form>
  );
}
