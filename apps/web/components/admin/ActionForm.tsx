'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/admin/guard';

export type FormAction = (formData: FormData) => Promise<ActionResult<{ redirect?: string } | undefined | unknown>>;

/**
 * Form bound to an admin server action. Shows the Hebrew result (success or
 * error), disables submit while saving, and refreshes server data after a
 * successful save (or navigates when the action returns `data.redirect`).
 */
export default function ActionForm({
  action,
  children,
  className = '',
  successMessage = 'נשמר.',
  resetOnSuccess = false,
  onSuccess,
  id,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (result: ActionResult<unknown>) => void;
  id?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const router = useRouter();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await action(fd);
      setResult(res);
      if (!res.ok) return;
      onSuccess?.(res);
      if (resetOnSuccess) form.reset();
      const redirect = (res.data as { redirect?: string } | undefined)?.redirect;
      if (redirect) router.push(redirect);
      router.refresh();
    });
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <form id={id} onSubmit={onSubmit} className={className} aria-busy={pending} data-pending={pending || undefined}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      <div aria-live="polite" className="mt-3 empty:hidden">
        {result && !result.ok && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {result.error}
            {fieldErrors && Object.keys(fieldErrors).length > 0 && (
              <span className="block text-xs">{Object.values(fieldErrors).join(' · ')}</span>
            )}
          </p>
        )}
        {result && result.ok && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{result.message ?? successMessage}</p>
        )}
      </div>
    </form>
  );
}

/** Submit button that reflects the enclosing ActionForm's pending state via CSS. */
export function SubmitButton({ children = 'שמירה', className = '', name, value }: { children?: ReactNode; className?: string; name?: string; value?: string }) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={`rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}
