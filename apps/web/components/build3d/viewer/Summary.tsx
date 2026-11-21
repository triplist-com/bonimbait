'use client';

import { useEffect, useRef, useState } from 'react';
import { Boxes, CalendarDays, ChevronLeft, ChevronUp, Hammer, House, Layers, ListChecks, RotateCcw, Share2, SlidersHorizontal, Wallet, X } from 'lucide-react';
import { SUMMARY } from '@/lib/build3d/content';
import { METHODS_INFO } from '@/lib/build3d/content/methods';
import { METHOD_TOTALS, type BuildTotals } from '@/lib/build3d/content/totals';
import type { Timeline } from '@/lib/build3d/engine/timeline';
import { DEFAULT_METHOD, METHOD_IDS, type MethodId } from '@/lib/build3d/methods';
import Counter from '../landing/Counter';
import MethodPicker from '../landing/MethodPicker';
import {
  METHOD_IN_HE,
  METHOD_IN_SHORT_HE,
  MethodBadgeIcon,
  ScoreBars,
  fmtMillionsHe,
  methodCostDeltaHe,
  methodMonthsHe,
  methodShareUrl,
} from '../landing/methodUi';
import { FOCUS, fmtInt, fmtNum } from './format';

const CONFETTI = ['#E61559', '#F5A623', '#2BB3A3', '#3F7FC4', '#231F20', '#F7C6D6'];
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: ((i * 53) % 90) / 100,
  dur: 2.6 + ((i * 29) % 16) / 10,
  color: CONFETTI[i % CONFETTI.length],
  w: 6 + (i % 3) * 3,
  rot: (i * 47) % 360,
}));

/** The viewer mounts the finale ~span + 1.8 s into the last step; the dusk orbit starts 1.4 s in. */
const MOUNT_AFTER_SPAN_S = 1.8;
const ORBIT_START_S = 1.4;
/** Let the orbit play this long before the bar slides in, so it never hides the money shot. */
const ORBIT_BEFORE_BAR_S = 5;

type SummaryProps = {
  timeline: Pick<Timeline, 'steps'> & Partial<Pick<Timeline, 'span'>>;
  method?: MethodId;
  onRestart: () => void;
  onClose: () => void;
  /** Watch the house in another method (the viewer picks the step where the builds part). */
  onSwitchMethod?: (method: MethodId) => void;
  /** Bump to open the full card right away ("סיכום והשוואה" at the last step). */
  openSignal?: number;
  /** Sheet layout (phones / portrait tablets): the bottom sheet's peek height, so the bar sits above it. */
  sheetPeek?: number;
};

type View = 'wait' | 'bar' | 'open' | 'picker';

/**
 * Finale: a slim bar ("הבית מוכן! · כ-16.5 חודשים · 2.25 מיליון ₪ · סיכום והשוואה") slides in once
 * the dusk orbit has played ~5 s and expands into the full card: this method's totals, a comparison
 * of all five methods, share and "back to the method picker". Esc / ✕ / backdrop collapse it.
 * Numbers: METHOD_TOTALS (lib/build3d/content/totals.ts).
 */
export default function Summary({ timeline, method = DEFAULT_METHOD, onRestart, onClose, onSwitchMethod, openSignal = 0, sheetPeek }: SummaryProps) {
  const [view, setView] = useState<View>(() => (openSignal ? 'open' : 'wait'));
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const span = timeline.span?.[timeline.steps.length - 1] ?? 2;
    const ms = Math.max(300, (ORBIT_START_S + ORBIT_BEFORE_BAR_S - (span + MOUNT_AFTER_SPAN_S)) * 1000);
    const id = window.setTimeout(() => setView((v) => (v === 'wait' ? 'bar' : v)), ms);
    return () => window.clearTimeout(id);
  }, [timeline]);

  useEffect(() => {
    if (openSignal) setView('open');
  }, [openSignal]);

  useEffect(() => {
    if (view !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView('bar');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const steps = timeline.steps.length;
  const share = async () => {
    const url = methodShareUrl(method, steps);
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
    }
    setToast(ok ? 'הקישור הועתק. אפשר להדביק ולשלוח.' : `העתיקו את הקישור: ${url}`);
  };

  const switchTo = (m: MethodId) => {
    if (m === method) setView('open');
    else onSwitchMethod?.(m);
  };

  return (
    <>
      {view === 'bar' && <SummaryBar method={method} sheetPeek={sheetPeek} onOpen={() => setView('open')} onClose={onClose} />}
      {view === 'open' && (
        <SummaryCard
          method={method}
          steps={steps}
          onRestart={onRestart}
          onCollapse={() => setView('bar')}
          onSwitch={switchTo}
          onPicker={() => setView('picker')}
          onShare={() => void share()}
        />
      )}
      {view === 'picker' && <MethodPicker mode="overlay" initial={method} onPick={switchTo} onBack={() => setView('open')} />}
      {toast && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center motion-safe:animate-slide-up"
        >
          <span className="max-w-full break-words rounded-2xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_14px_34px_-12px_rgba(0,0,0,0.55)]">{toast}</span>
        </div>
      )}
    </>
  );
}

/** Compact finale bar: desktop centered under the 3D view (beside the step card), sheet layout above the sheet. */
function SummaryBar({ method, sheetPeek, onOpen, onClose }: { method: MethodId; sheetPeek?: number; onOpen: () => void; onClose: () => void }) {
  const t = METHOD_TOTALS[method];
  return (
    <div
      data-b3d-summary
      className={`pointer-events-none absolute z-30 flex animate-slide-up justify-center ${
        sheetPeek !== undefined ? 'inset-x-3' : 'bottom-[100px] end-4 start-[calc(clamp(320px,30vw,392px)+32px)]'
      }`}
      style={sheetPeek !== undefined ? { bottom: `calc(${sheetPeek + 10}px + env(safe-area-inset-bottom))` } : undefined}
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-2xl border border-white/15 bg-ink/[0.88] p-1.5 text-white shadow-[0_18px_44px_-14px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <button
          onClick={onOpen}
          aria-label="הבית מוכן! סיכום הבנייה והשוואה בין שיטות"
          className={`flex min-w-0 items-center gap-1.5 rounded-xl py-1 pe-1 ps-2 text-start transition hover:bg-white/[0.06] sm:gap-2.5 sm:ps-2 ${FOCUS} focus-visible:ring-offset-ink`}
        >
          <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary min-[440px]:grid">
            <House size={17} strokeWidth={2.4} />
          </span>
          <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[13.5px] min-[400px]:gap-1.5 sm:gap-2 sm:text-[15px]">
            <span className="font-black">הבית מוכן!</span>
            <span aria-hidden className="text-white/40">·</span>
            <span className="font-semibold text-white/85">{methodMonthsHe(method)}</span>
            <span aria-hidden className="hidden text-white/40 min-[520px]:inline">·</span>
            <span className="hidden font-semibold text-white/85 min-[520px]:inline">{fmtMillionsHe(t.costILS)}</span>
          </span>
          <span className="ms-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[13px] font-bold text-ink sm:ms-1 sm:px-3 sm:text-[14px]">
            סיכום והשוואה
            <ChevronUp size={15} strokeWidth={2.6} />
          </span>
        </button>
        <button
          onClick={onClose}
          aria-label="סגירת הסיכום"
          className={`grid h-11 w-9 shrink-0 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white ${FOCUS} focus-visible:ring-offset-ink`}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** Concrete + the method's signature quantities (`extra`), else rebar / blocks; at most three. */
function materials(t: BuildTotals): Array<{ label: string; qty: number; unit: string; icon: React.ReactNode }> {
  const out = [{ label: 'בטון', qty: t.concreteM3, unit: 'מ״ק', icon: <Boxes size={16} /> }];
  for (const e of t.extra ?? []) out.push({ label: e.labelHe, qty: e.qty, unit: e.unitHe, icon: <Layers size={16} /> });
  if (t.rebarT > 0) out.push({ label: 'ברזל זיון', qty: t.rebarT, unit: 'טון', icon: <Hammer size={16} /> });
  if (t.blocks > 0) out.push({ label: 'בלוקים', qty: t.blocks, unit: 'יח׳', icon: <Boxes size={16} /> });
  return out.slice(0, 3);
}

const qtyHe = (qty: number, unit: string) => `${Number.isInteger(qty) ? fmtInt(qty) : fmtNum(Math.round(qty * 10) / 10)}${unit === 'יח׳' ? '' : ` ${unit}`}`;

function SummaryCard({
  method,
  steps,
  onRestart,
  onCollapse,
  onSwitch,
  onPicker,
  onShare,
}: {
  method: MethodId;
  steps: number;
  onRestart: () => void;
  onCollapse: () => void;
  onSwitch: (m: MethodId) => void;
  onPicker: () => void;
  onShare: () => void;
}) {
  const t = METHOD_TOTALS[method];
  const info = METHODS_INFO[method];
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus({ preventScroll: true }), []);

  const stats: Array<{ label: string; icon: React.ReactNode; node: React.ReactNode }> = [
    { label: 'משך הבנייה', icon: <CalendarDays size={16} />, node: methodMonthsHe(method) },
    { label: 'עלות משוערת', icon: <Wallet size={16} />, node: fmtMillionsHe(t.costILS) },
    { label: 'שלבי עבודה', icon: <ListChecks size={16} />, node: <Counter value={steps} active durationMs={900} /> },
    ...materials(t).map((m) => ({
      label: m.label,
      icon: m.icon,
      node: (
        <>
          <Counter value={m.qty} decimals={Number.isInteger(m.qty) ? 0 : 1} active durationMs={1100} />
          {m.unit === 'יח׳' ? '' : ` ${m.unit}`}
        </>
      ),
    })),
  ];

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-ink/35 p-3 backdrop-blur-[3px] animate-fade-in sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCollapse();
      }}
      onKeyDown={(e) => {
        // Keep the viewer's global keys (arrows step, Space plays) out of the dialog.
        e.stopPropagation();
        if (e.key === 'Escape') onCollapse();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="b3d-summary-title"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {PIECES.map((p, i) => (
          <span
            key={i}
            className="b3d-confetti absolute top-0 block rounded-[2px]"
            style={{ left: `${p.left}%`, width: p.w, height: p.w * 1.6, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, rotate: `${p.rot}deg` }}
          />
        ))}
      </div>
      <div ref={box} tabIndex={-1} className="relative my-auto w-full max-w-[840px] overflow-hidden rounded-[28px] bg-white shadow-[0_30px_80px_-20px_rgba(35,31,32,0.5)] outline-none animate-scale-in">
        <div className="relative px-5 pb-5 pt-5 text-white sm:px-8 sm:pb-6" style={{ background: 'linear-gradient(135deg,#F0306F 0%,#E61559 45%,#B80E45 100%)' }}>
          <button onClick={onCollapse} aria-label="סגירה" className={`absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white ${FOCUS}`}>
            <X size={18} />
          </button>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-primary shadow-lg">
              <House size={24} strokeWidth={2.3} />
            </span>
            <div className="text-[13px] font-bold tracking-wide text-white/85">
              מסירת מפתח · <span className="text-white">{info.nameHe}</span>
            </div>
          </div>
          <h2 id="b3d-summary-title" className="mt-3 text-[32px] font-black leading-tight tracking-[-0.02em] sm:text-[38px]">
            הבית מוכן!
          </h2>
          <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-white/90">
            מהתוכנית על הנייר ועד בית גמור ומרוהט, {METHOD_IN_HE[method]}. כך זה נראה במספרים:
          </p>
        </div>

        <div className="px-4 pb-5 pt-4 sm:px-8 sm:pb-6 sm:pt-5">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 rounded-2xl border border-ink-100 bg-paper px-3 py-2.5">
                <dt className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-ink-600">
                  <span className="shrink-0 text-primary">{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </dt>
                <dd className="mt-1 text-[18px] font-extrabold leading-tight tabular-nums text-ink sm:text-[19px]">{s.node}</dd>
              </div>
            ))}
          </dl>

          <Comparison method={method} onSwitch={onSwitch} />

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-600">{SUMMARY.noteHe}</p>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1.25fr_1fr_auto]">
            <button
              onClick={onRestart}
              className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(230,21,89,0.8)] transition hover:bg-primary-700 ${FOCUS}`}
            >
              <RotateCcw size={17} />
              צפו שוב מההתחלה
            </button>
            <button
              onClick={onPicker}
              className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-ink/20 px-4 text-[15px] font-bold text-ink transition hover:bg-ink-50 ${FOCUS}`}
            >
              <SlidersHorizontal size={17} />
              חזרה לבחירת שיטה
            </button>
            <button
              onClick={onShare}
              className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-ink/20 px-5 text-[15px] font-bold text-ink transition hover:bg-ink-50 ${FOCUS}`}
            >
              <Share2 size={17} />
              שתפו
            </button>
          </div>
          <div className="mt-2 text-center">
            <a href="/" className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-ink-600 underline-offset-4 transition hover:text-primary hover:underline ${FOCUS}`}>
              <House size={15} />
              לאתר בונים בית
            </a>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes b3d-confetti { 0% { translate: 0 -20px; opacity: 0; } 10% { opacity: 1; } 100% { translate: 40px 105vh; opacity: .9; } }
        .b3d-confetti { animation: b3d-confetti 3s ease-in both; }
        @media (prefers-reduced-motion: reduce) { .b3d-confetti { display: none; } }
      `}</style>
    </div>
  );
}

/** The same house in all five methods: months, cost, scores, this-house quantities, "watch it". */
function Comparison({ method, onSwitch }: { method: MethodId; onSwitch: (m: MethodId) => void }) {
  const cols = 'sm:grid sm:grid-cols-[minmax(0,1.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.25fr)_9.75rem] sm:items-center sm:gap-3';
  return (
    <section aria-labelledby="b3d-compare-title" className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id="b3d-compare-title" className="text-[17px] font-extrabold">
          השוואה בין שיטות הבנייה
        </h3>
        <p className="text-[12.5px] text-ink-500">אותו בית בחמש שיטות. המעבר מתחיל מהשלב שבו הבנייה נפרדת.</p>
      </div>
      <div aria-hidden className={`mt-2 hidden px-3 text-[11.5px] font-bold text-ink-500 ${cols}`}>
        <span>שיטה</span>
        <span>משך</span>
        <span>עלות לבית הזה</span>
        <span>ציונים (1–5)</span>
        <span />
      </div>
      <ul className="mt-2 flex flex-col gap-1.5 sm:mt-1">
        {METHOD_IDS.map((m) => {
          const info = METHODS_INFO[m];
          const t = METHOD_TOTALS[m];
          const cur = m === method;
          const sig = t.extra?.[0];
          const house = `${t.steps} שלבים · ${qtyHe(t.concreteM3, 'מ״ק')} בטון${
            sig ? ` · ${qtyHe(sig.qty, sig.unitHe)} ${sig.labelHe}` : t.blocks ? ` · ${fmtInt(t.blocks)} בלוקים` : ''
          }`;
          return (
            <li
              key={m}
              className={`relative rounded-2xl border px-3 py-2.5 ${cols} ${cur ? 'border-primary/40 bg-primary/[0.05]' : 'border-ink-100 bg-white'}`}
            >
              <div className="flex min-h-[44px] min-w-0 items-center gap-2.5 pe-[9.5rem] sm:pe-0">
                <MethodBadgeIcon id={m} size={34} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="text-[15px] font-extrabold leading-tight">{info.shortHe}</span>
                    {cur && <span className="rounded-full bg-primary px-1.5 py-px text-[11px] font-bold text-white">השיטה שלכם</span>}
                  </div>
                  <div className="mt-0.5 hidden text-[11.5px] leading-snug text-ink-500 sm:block">{house}</div>
                </div>
              </div>
              <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px] sm:contents">
                <div className="sm:min-w-0">
                  <dt className="sr-only">משך</dt>
                  <dd className="font-bold text-ink-800">{methodMonthsHe(m)}</dd>
                </div>
                <span aria-hidden className="text-ink-300 sm:hidden">·</span>
                <div className="sm:min-w-0">
                  <dt className="sr-only">עלות</dt>
                  <dd>
                    <span className="font-bold text-ink-800">{fmtMillionsHe(t.costILS)}</span>
                    <span className="ms-1.5 text-[12px] font-semibold text-ink-500 sm:ms-0 sm:block">{methodCostDeltaHe(m)}</span>
                  </dd>
                </div>
                <div className="basis-full sm:basis-auto">
                  <dt className="sr-only">ציונים</dt>
                  <dd>
                    <ScoreBars scores={info.scores} className="mt-1 sm:mt-0 sm:flex-col sm:gap-y-0.5" />
                  </dd>
                </div>
              </dl>
              <div className="mt-1 text-[11.5px] leading-snug text-ink-500 sm:hidden">{house}</div>
              <div className="absolute end-2.5 top-2.5 sm:static">
                {cur ? (
                  <span className="inline-flex min-h-[40px] items-center px-2 text-[12.5px] font-bold text-primary-700">מוצגת עכשיו</span>
                ) : (
                  <button
                    onClick={() => onSwitch(m)}
                    className={`inline-flex min-h-[44px] w-full items-center justify-center gap-0.5 whitespace-nowrap rounded-xl bg-ink-50 pe-2 ps-3 text-[13.5px] font-bold text-ink transition hover:bg-ink hover:text-white ${FOCUS}`}
                  >
                    צפו בבנייה {METHOD_IN_SHORT_HE[m]}
                    <ChevronLeft size={15} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
