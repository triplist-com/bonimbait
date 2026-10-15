'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/admin/guard';
import { cn } from '@/lib/cn';

/**
 * One button that runs a server action already bound with its arguments
 * (e.g. setRoutingRuleActive.bind(null, id, false)), then refreshes.
 */
export default function ActionButton({
  action,
  children,
  pressed,
  className,
  title,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  pressed?: boolean;
  className?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        title={title}
        aria-pressed={pressed}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await action();
            if (!res.ok) setError(res.error);
            else {
              setError(null);
              router.refresh();
            }
          })
        }
        className={cn(
          'rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors disabled:opacity-60',
          pressed ? 'bg-success-50 text-success-700 ring-success-100' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50',
          className,
        )}
      >
        {children}
      </button>
      {error && <span className="mt-1 text-xs text-danger-700">{error}</span>}
    </span>
  );
}
