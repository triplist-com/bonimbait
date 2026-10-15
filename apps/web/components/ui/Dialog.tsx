'use client';

/**
 * Dialog, Sheet and Drawer: one accessible overlay on the native <dialog>.
 *
 *   <Dialog open={open} onClose={() => setOpen(false)} title="פגישת ייעוץ">…</Dialog>
 *   <Sheet side="end" …>   side panel (navigation, filters on desktop)
 *   <Drawer …>             bottom sheet (mobile actions, filters on phones)
 *
 * Behaviour: showModal() makes the page inert; Tab is trapped inside; Escape
 * and a backdrop click call onClose; page scroll is locked; focus returns to
 * the element that opened it. The parent owns `open` (controlled).
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { trapTab } from '@/lib/a11y/focus';
import { lockScroll } from '@/lib/hooks/useScrollLock';

type Variant = 'dialog' | 'sheet-start' | 'sheet-end' | 'drawer';

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Visually hidden with `hideTitle`. */
  title: ReactNode;
  description?: ReactNode;
  hideTitle?: boolean;
  children?: ReactNode;
  /** Sticky footer (actions). */
  footer?: ReactNode;
  /** Element to focus on open (defaults to the first focusable control). */
  initialFocus?: RefObject<HTMLElement>;
  closeLabel?: string;
  className?: string;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
}

const PANEL: Record<Variant, string> = {
  dialog:
    'm-auto w-[min(100vw-2rem,40rem)] max-h-[min(92dvh,56rem)] rounded-3xl motion-safe:animate-scale-in',
  'sheet-start':
    'my-0 ms-0 me-auto h-dvh max-h-dvh w-[min(100vw-2.5rem,26rem)] rtl:rounded-s-none rounded-e-3xl rtl:motion-safe:animate-sheet-in-right ltr:motion-safe:animate-sheet-in-left',
  'sheet-end':
    'my-0 me-0 ms-auto h-dvh max-h-dvh w-[min(100vw-2.5rem,26rem)] rounded-s-3xl rtl:motion-safe:animate-sheet-in-left ltr:motion-safe:animate-sheet-in-right',
  drawer:
    'mx-auto mb-0 mt-auto w-full max-w-2xl max-h-[88dvh] rounded-t-3xl motion-safe:animate-sheet-in-bottom pb-safe',
};

function Overlay({
  variant,
  open,
  onClose,
  title,
  description,
  hideTitle,
  children,
  footer,
  initialFocus,
  closeLabel = 'סגירה',
  className,
  bodyClassName,
}: OverlayProps & { variant: Variant }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const release = lockScroll();
      const target =
        initialFocus?.current ??
        dialog.querySelector<HTMLElement>('[data-autofocus]') ??
        dialog.querySelector<HTMLElement>('[data-overlay-body] :is(a[href],button,input,select,textarea)') ??
        dialog.querySelector<HTMLElement>('[data-overlay-close]');
      target?.focus();
      return () => {
        release();
        if (dialog.open) dialog.close();
        returnFocus.current?.focus?.();
      };
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initialFocus]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        // Escape: let the parent decide (controlled component).
        e.preventDefault();
        onCloseRef.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCloseRef.current(); // backdrop
      }}
      onKeyDown={(e) => {
        if (ref.current) trapTab(e, ref.current);
      }}
      className={cn(
        'fixed inset-0 bg-white p-0 text-ink-900 shadow-dialog backdrop:bg-ink-950/55 backdrop:backdrop-blur-[2px]',
        'open:flex open:flex-col overflow-hidden',
        PANEL[variant],
        className,
      )}
    >
      {open && (
        <>
          {variant === 'drawer' && <span aria-hidden="true" className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-ink-200" />}
          <header
            className={cn(
              'flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-6',
              hideTitle ? 'pb-0' : 'pb-4',
              !hideTitle && 'border-b border-ink-100',
            )}
          >
            <div className={cn(hideTitle && 'sr-only')}>
              <h2 id={titleId} className="text-title-lg text-ink-900">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-body-sm text-ink-600">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              data-overlay-close
              onClick={() => onCloseRef.current()}
              aria-label={closeLabel}
              className="-me-2 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ms-auto"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>
          <div data-overlay-body className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6', bodyClassName)}>
            {children}
          </div>
          {footer && <footer className="shrink-0 border-t border-ink-100 bg-white px-5 py-4 sm:px-6">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}

/** Centred modal dialog. */
export function Dialog(props: OverlayProps) {
  return <Overlay variant="dialog" {...props} />;
}

/** Side panel. `side="end"` is the left edge in RTL (where the menu button sits). */
export function Sheet({ side = 'end', ...props }: OverlayProps & { side?: 'start' | 'end' }) {
  return <Overlay variant={side === 'start' ? 'sheet-start' : 'sheet-end'} {...props} />;
}

/** Bottom sheet for phones (actions, filters). */
export function Drawer(props: OverlayProps) {
  return <Overlay variant="drawer" {...props} />;
}
