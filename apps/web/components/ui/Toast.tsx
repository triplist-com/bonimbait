'use client';

/**
 * Toast notifications.
 *
 *   // once, high in a client tree (e.g. a page's client shell):
 *   <ToastProvider>{children}</ToastProvider>
 *   // anywhere below it:
 *   const { toast } = useToast();
 *   toast({ title: 'נשמר', description: 'הפרטים עודכנו', tone: 'success' });
 *
 * Toasts live in a polite live region, pause while hovered or focused, and can
 * be closed by button. Errors use role="alert".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds; 0 keeps it until closed. Default 5000. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const ICON_TONES = { success: 'text-success-600', error: 'text-danger-600', info: 'text-info-600' } as const;

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const tone = item.tone ?? 'info';
  const Icon = ICONS[tone];
  const remaining = useRef(item.duration ?? 5000);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (remaining.current <= 0 || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, onDismiss]);

  return (
    <li
      role={tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-lift motion-safe:animate-slide-up"
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', ICON_TONES[tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm text-ink-600">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
            className="mt-2 text-sm font-semibold text-primary-700 hover:underline"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגירת ההודעה"
        className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-900"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback((opts: ToastOptions) => {
    seq.current += 1;
    const id = seq.current;
    setItems((list) => [...list.slice(-3), { ...opts, id }]);
    return id;
  }, []);
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ol
        aria-live="polite"
        aria-label="הודעות"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:start-6 sm:bottom-6 sm:w-96"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}
