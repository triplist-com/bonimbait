'use client';

/**
 * "באיזו שיטה תרצו לבנות?" — five construction-method cards between the landing and the
 * analysis (and, from the finale, over the viewer). One tap picks a method.
 * Keyboard: Tab or arrows move between cards, Enter/Space picks, Esc goes back.
 */
import { useEffect, useRef } from 'react';
import { ArrowRight, Check, ChevronLeft, FileCheck } from 'lucide-react';
import { METHODS_INFO } from '@/lib/build3d/content/methods';
import { METHOD_IDS, type MethodId } from '@/lib/build3d/methods';
import { MethodThumb, ScoreBars, methodCostDeltaHe, methodMonthsHe } from './methodUi';

export interface MethodPickerProps {
  /** Preselected (highlighted, focused) method. */
  initial: MethodId;
  onPick: (method: MethodId) => void;
  onBack: () => void;
  /** 'page': part of the landing flow; 'overlay': opened from the viewer's finale. */
  mode?: 'page' | 'overlay';
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35';

export default function MethodPicker({ initial, onPick, onBack, mode = 'page' }: MethodPickerProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const overlay = mode === 'overlay';

  useEffect(() => {
    refs.current[METHOD_IDS.indexOf(initial)]?.focus({ preventScroll: true });
  }, [initial]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keep the viewer's global keys (arrows step, Space plays) out of the picker.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onBack();
      return;
    }
    const i = refs.current.findIndex((el) => el === document.activeElement);
    if (i < 0) return;
    const n = METHOD_IDS.length;
    let j = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') j = (i + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') j = (i - 1 + n) % n;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    if (j >= 0) {
      e.preventDefault();
      refs.current[j]?.focus();
    }
  };

  return (
    <div
      dir="rtl"
      lang="he"
      onKeyDown={onKeyDown}
      role={overlay ? 'dialog' : undefined}
      aria-modal={overlay || undefined}
      aria-labelledby="b3d-picker-title"
      className="absolute inset-0 z-40 overflow-y-auto overflow-x-hidden bg-ink-50 font-heebo text-ink motion-safe:animate-fade-in"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style={{ background: 'radial-gradient(ellipse at 80% 0%, rgb(var(--bb-primary-600) / 0.07), transparent 60%)' }} />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8 sm:pt-5">
        <button
          type="button"
          onClick={onBack}
          className={`-ms-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-ink-700 transition hover:bg-white ${FOCUS_RING}`}
        >
          <ArrowRight size={18} aria-hidden />
          {overlay ? 'חזרה לסיכום' : 'חזרה'}
        </button>
        {!overlay && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-[13px] font-bold text-success-700">
            <FileCheck size={15} aria-hidden />
            תוכנית מגרש 43 מוכנה לניתוח
          </span>
        )}
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-10 pt-3 sm:px-8 sm:pt-6 lg:pb-14">
        <h1 id="b3d-picker-title" className="text-[1.75rem] font-black leading-tight tracking-tight sm:text-[2.6rem]">
          באיזו שיטה תרצו לבנות?
        </h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-600 sm:mt-2.5 sm:text-[17px]">
          אותו בית ואותה תוכנית. השיטה משנה את השלד והמעטפת, את משך הבנייה ואת העלות. אפשר להחליף שיטה בכל רגע בתוך התצוגה.
        </p>

        <ul className="mt-5 grid gap-3 sm:mt-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
          {METHOD_IDS.map((id, i) => {
            const info = METHODS_INFO[id];
            const selected = id === initial;
            return (
              <li key={id} className="motion-safe:animate-slide-up" style={{ animationDelay: `${60 + i * 55}ms`, animationFillMode: 'both' }}>
                <button
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  onClick={() => onPick(id)}
                  aria-labelledby={`b3d-m-${id}-name`}
                  aria-describedby={`b3d-m-${id}-desc`}
                  aria-current={selected ? 'true' : undefined}
                  className={`group relative flex h-full w-full gap-3 overflow-hidden rounded-3xl border bg-white p-2.5 text-start shadow-[0_2px_14px_rgba(35,31,32,.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-14px_rgba(35,31,32,.35)] lg:flex-col lg:gap-0 lg:p-0 ${FOCUS_RING} ${
                    selected ? 'border-primary ring-2 ring-primary' : 'border-ink-100 hover:border-ink-200'
                  }`}
                >
                  <MethodThumb id={id} iconSize={22} className="aspect-square w-[76px] shrink-0 rounded-2xl sm:w-[104px] lg:aspect-[16/10] lg:w-full lg:rounded-none" />
                  {selected && (
                    <span className="absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-primary text-white shadow-md lg:end-3 lg:top-3" aria-hidden>
                      <Check size={16} strokeWidth={3} />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col pe-5 lg:p-4 lg:pt-3.5">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pe-4 lg:pe-0">
                      <span id={`b3d-m-${id}-name`} className="text-[16.5px] font-extrabold leading-snug lg:text-[17px]">
                        {info.nameHe}
                      </span>
                      {info.badgeHe && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-bold text-primary-700">{info.badgeHe}</span>
                      )}
                    </span>
                    <span id={`b3d-m-${id}-desc`} className="flex flex-1 flex-col">
                      <span className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-ink-600 lg:line-clamp-3 lg:text-[14px]">{info.taglineHe}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[13px] font-bold text-ink-800 lg:mt-3">
                        <span>{methodMonthsHe(id)}</span>
                        <span aria-hidden className="text-ink-300">·</span>
                        <span className="font-semibold text-ink-600">{methodCostDeltaHe(id)}</span>
                      </span>
                      <ScoreBars scores={info.scores} className="mt-1.5 lg:mt-2.5" />
                    </span>
                    <span
                      aria-hidden
                      className={`mt-auto hidden items-center justify-center gap-1 rounded-full py-2 text-[14px] font-bold transition lg:mt-4 lg:flex ${
                        selected ? 'bg-primary text-white' : 'bg-ink-50 text-ink-700 group-hover:bg-primary group-hover:text-white group-focus-visible:bg-primary group-focus-visible:text-white'
                      }`}
                    >
                      {overlay && selected ? 'השיטה הנוכחית' : 'בונים כך'}
                      <ChevronLeft size={16} />
                    </span>
                  </span>
                  <ChevronLeft
                    size={20}
                    aria-hidden
                    className={`absolute end-2 top-1/2 -translate-y-1/2 lg:hidden ${selected ? 'text-primary' : 'text-ink-300 group-hover:text-primary'}`}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 text-[12.5px] leading-relaxed text-ink-500">
          משך ועלות: הערכה לבית הזה לפי שלבי העבודה (לפני מע״מ). הציונים מ-1 עד 5 משווים בין השיטות; קבלו הצעות מחיר לפני החלטה.
        </p>
      </main>
    </div>
  );
}
