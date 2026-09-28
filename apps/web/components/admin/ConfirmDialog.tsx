'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import type { ActionResult } from '@/lib/admin/guard';

/**
 * Button that asks for confirmation in a modal, then runs a server action.
 * `onConfirm` is a server action bound with its arguments on the server
 * (e.g. deletePost.bind(null, id)).
 */
export default function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel = 'אישור',
  tone = 'danger',
  onConfirm,
  redirectTo,
  triggerClassName,
  children,
}: {
  trigger: ReactNode;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: (formData: FormData) => Promise<ActionResult<unknown>>;
  redirectTo?: string;
  triggerClassName?: string;
  /** Extra form fields shown in the dialog (e.g. a reason). */
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The dialog holds its own <form>: portal it out so it never nests inside
  // the row/edit form that contains the trigger button.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const confirmClass =
    tone === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary hover:bg-primary-700 text-white';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={
          triggerClassName ??
          'rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-100'
        }
      >
        {trigger}
      </button>
      {mounted &&
        createPortal(
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        className="w-[min(92vw,28rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/40"
        dir="rtl"
      >
        <form
          className="p-5"
          onSubmit={(ev) => {
            // React events bubble through portals: keep this submit away from
            // any form that contains the trigger.
            ev.preventDefault();
            ev.stopPropagation();
            const fd = new FormData(ev.currentTarget);
            start(async () => {
              const res = await onConfirm(fd);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setOpen(false);
              if (redirectTo) router.push(redirectTo);
              router.refresh();
            });
          }}
        >
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {body && <div className="mt-2 text-sm text-gray-600">{body}</div>}
          {children && <div className="mt-4 space-y-3">{children}</div>}
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              ביטול
            </button>
            <button type="submit" disabled={pending} className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${confirmClass}`}>
              {pending ? 'מבצע…' : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>,
          document.body,
        )}
    </>
  );
}
