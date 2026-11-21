'use client';

/**
 * Viewer header control: the current construction method, opening a menu of all five.
 * Picking one hands it to the viewer, which maps the step (methodSwitch.ts) and remounts.
 * Menu keyboard: ↑/↓ (and ←/→), Home/End, Enter/Space picks, Esc/Tab closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { METHODS_INFO } from '@/lib/build3d/content/methods';
import { METHOD_IDS, type MethodId } from '@/lib/build3d/methods';
import { MethodBadgeIcon, methodCostDeltaHe, methodMonthsHe } from '../landing/methodUi';
import { FOCUS } from './format';

export default function MethodSwitcher({ method, onSelect }: { method: MethodId; onSelect: (m: MethodId) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  // Focus the checked item on open; close on outside press.
  useEffect(() => {
    if (!open) return;
    items.current[METHOD_IDS.indexOf(method)]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, method]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // The viewer listens on window for arrows / Space / Home / End: keep them here.
    if (e.key === ' ' || e.key === 'Enter' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) {
      e.stopPropagation();
    }
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    const n = METHOD_IDS.length;
    const i = items.current.findIndex((el) => el === document.activeElement);
    let j = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') j = (i + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') j = (i - 1 + n) % n;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    if (j >= 0) {
      e.preventDefault();
      items.current[j]?.focus();
    }
  };

  const info = METHODS_INFO[method];
  return (
    <div ref={root} className="pointer-events-auto relative" onKeyDown={onKeyDown}>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'b3d-method-menu' : undefined}
        aria-label={`שיטת בנייה: ${info.nameHe}. החלפת שיטה`}
        className={`flex h-12 items-center gap-2 rounded-2xl bg-white/[0.85] pe-2.5 ps-1.5 text-start shadow-[0_6px_24px_-10px_rgba(35,31,32,0.3)] backdrop-blur-xl transition hover:bg-white ${FOCUS}`}
      >
        <MethodBadgeIcon id={method} size={36} />
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold text-ink-500">שיטת בנייה</span>
          <span className="block whitespace-nowrap text-[14px] font-extrabold text-ink">{info.shortHe}</span>
        </span>
        <ChevronDown size={16} strokeWidth={2.4} aria-hidden className={`text-ink-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id="b3d-method-menu"
          role="menu"
          aria-label="החלפת שיטת בנייה"
          className="absolute start-0 top-full z-40 mt-2 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-ink-100 bg-white p-1.5 shadow-[0_22px_50px_-16px_rgba(35,31,32,0.45)] motion-safe:animate-slide-down"
        >
          <div className="px-2.5 pb-1.5 pt-1.5 text-[12.5px] font-bold text-ink-500">אותו בית, שיטה אחרת. ממשיכים מאותו שלב בבנייה.</div>
          {METHOD_IDS.map((id, i) => {
            const m = METHODS_INFO[id];
            const checked = id === method;
            return (
              <button
                key={id}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                onClick={() => {
                  close(false);
                  if (!checked) onSelect(id);
                }}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start transition hover:bg-ink-50 focus-visible:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${checked ? 'bg-primary/[0.06]' : ''}`}
              >
                <MethodBadgeIcon id={id} size={34} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[14.5px] font-bold text-ink">{m.nameHe}</span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-500">
                    {methodMonthsHe(id)} · {methodCostDeltaHe(id)}
                  </span>
                </span>
                {checked && <Check size={18} strokeWidth={2.8} aria-hidden className="shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
