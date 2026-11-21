'use client';

import { Check, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FOCUS } from './format';

export interface ViewToggle {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

/**
 * Phones: the view toggles (emphasis, ghost preview, x-ray, auto-rotate) grouped behind one
 * 44 px "תצוגה" button, with text labels, so the top bar fits 390 px.
 */
export default function ViewMenu({ items }: { items: ViewToggle[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const on = items.filter((i) => i.active).length;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="אפשרויות תצוגה"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`relative grid h-11 w-11 place-items-center rounded-xl text-ink-700 transition hover:bg-ink-100 ${open ? 'bg-ink-100' : ''} ${FOCUS}`}
      >
        <SlidersHorizontal size={18} />
        {on > 0 && <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-30 mt-2 w-60 animate-scale-in rounded-2xl border border-ink-200 bg-white p-1.5 shadow-dialog">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              aria-pressed={it.active}
              onClick={it.onClick}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-start text-[14px] font-semibold text-ink transition hover:bg-ink-50 ${FOCUS}`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${it.active ? 'bg-primary text-white' : 'bg-ink-100 text-ink-700'}`}>{it.icon}</span>
              <span className="min-w-0 flex-1">{it.label}</span>
              {it.active && <Check size={16} className="shrink-0 text-primary-700" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
