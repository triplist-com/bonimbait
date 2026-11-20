'use client';

import { useEffect, useState } from 'react';
import { Boxes, CalendarDays, ChevronUp, Hammer, House, ListChecks, RotateCcw, Wallet, X } from 'lucide-react';
import { SUMMARY } from '@/lib/build3d/content';
import { BUILD_TOTALS as t } from '@/lib/build3d/content/totals';
import type { Timeline } from '@/lib/build3d/engine/timeline';
import Counter from '../landing/Counter';
import { FOCUS, fmtILS, fmtMonths } from './format';

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
  onRestart: () => void;
  onClose: () => void;
};

/**
 * Finale: a slim bar ("הבית מוכן! · 16 חודשים · ₪2.25M · הצגת סיכום") slides in once the dusk
 * orbit has played ~5 s and expands into the full card on click (Esc / ✕ / backdrop collapse it
 * back to the bar). The totals are the hardcoded whole-house numbers (lib/build3d/content/totals.ts).
 */
export default function Summary({ timeline, onRestart, onClose }: SummaryProps) {
  const [view, setView] = useState<'wait' | 'bar' | 'open'>('wait');

  useEffect(() => {
    const span = timeline.span?.[timeline.steps.length - 1] ?? 2;
    const ms = Math.max(300, (ORBIT_START_S + ORBIT_BEFORE_BAR_S - (span + MOUNT_AFTER_SPAN_S)) * 1000);
    const id = window.setTimeout(() => setView((v) => (v === 'wait' ? 'bar' : v)), ms);
    return () => window.clearTimeout(id);
  }, [timeline]);

  useEffect(() => {
    if (view !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView('bar');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  if (view === 'wait') return null;
  if (view === 'bar') return <SummaryBar onOpen={() => setView('open')} onClose={onClose} />;
  return <SummaryCard steps={timeline.steps.length} onRestart={onRestart} onCollapse={() => setView('bar')} />;
}

/** Compact finale bar: desktop centered under the 3D view (beside the step card), mobile above the sheet. */
function SummaryBar({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }) {
  const months = Math.round(t.days / 22);
  const millions = (t.costILS / 1e6).toFixed(2);
  return (
    <div
      data-b3d-summary
      className="pointer-events-none absolute inset-x-3 bottom-[calc(208px+env(safe-area-inset-bottom))] z-30 flex animate-slide-up justify-center sm:bottom-[100px] sm:end-4 sm:start-[calc(clamp(320px,30vw,392px)+32px)]"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-2xl border border-white/15 bg-[#231F20]/[0.88] p-1.5 text-white shadow-[0_18px_44px_-14px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <button
          onClick={onOpen}
          aria-label="הבית מוכן! הצגת סיכום הבנייה"
          className={`flex min-w-0 items-center gap-1.5 rounded-xl py-1 pe-1 ps-2 text-start transition hover:bg-white/[0.06] sm:gap-2.5 sm:ps-2 ${FOCUS} focus-visible:ring-offset-[#231F20]`}
        >
          <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#E61559] min-[400px]:grid">
            <House size={17} strokeWidth={2.4} />
          </span>
          <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[13.5px] min-[400px]:gap-1.5 sm:gap-2 sm:text-[15px]">
            <span className="font-black">הבית מוכן!</span>
            <span aria-hidden className="text-white/40">·</span>
            <span className="font-semibold text-white/85">{months} חודשים</span>
            <span aria-hidden className="hidden text-white/40 min-[380px]:inline">·</span>
            <bdi dir="ltr" className="hidden font-semibold tabular-nums text-white/85 min-[380px]:inline">
              ₪{millions}M
            </bdi>
          </span>
          <span className="ms-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[13px] font-bold text-[#231F20] sm:ms-1 sm:px-3 sm:text-[14px]">
            הצגת סיכום
            <ChevronUp size={15} strokeWidth={2.6} />
          </span>
        </button>
        <button
          onClick={onClose}
          aria-label="סגירת הסיכום"
          className={`grid h-9 w-8 shrink-0 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white sm:w-9 ${FOCUS} focus-visible:ring-offset-[#231F20]`}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ steps, onRestart, onCollapse }: { steps: number; onRestart: () => void; onCollapse: () => void }) {
  const stats: Array<{ label: string; icon: React.ReactNode; node: React.ReactNode }> = [
    { label: 'משך הבנייה', icon: <CalendarDays size={16} />, node: fmtMonths(t.days) },
    {
      label: 'בטון',
      icon: <Boxes size={16} />,
      node: (
        <>
          <Counter value={t.concreteM3} active durationMs={1100} /> מ״ק
        </>
      ),
    },
    {
      label: 'ברזל זיון',
      icon: <Hammer size={16} />,
      node: (
        <>
          <Counter value={t.rebarT} decimals={1} active durationMs={1100} /> טון
        </>
      ),
    },
    { label: 'בלוקים', icon: <Boxes size={16} />, node: <Counter value={t.blocks} active durationMs={1300} /> },
    { label: 'שלבי עבודה', icon: <ListChecks size={16} />, node: <Counter value={steps} active durationMs={900} /> },
    { label: 'עלות משוערת', icon: <Wallet size={16} />, node: fmtILS(t.costILS) },
  ];
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-[#231F20]/35 p-4 backdrop-blur-[3px] animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCollapse();
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
      <div className="relative my-auto w-full max-w-[560px] overflow-hidden rounded-[28px] bg-white shadow-[0_30px_80px_-20px_rgba(35,31,32,0.5)] animate-scale-in">
        <div className="relative px-6 pb-7 pt-6 text-white sm:px-8" style={{ background: 'linear-gradient(135deg,#F0306F 0%,#E61559 45%,#B80E45 100%)' }}>
          <button onClick={onCollapse} aria-label="סגירה" className={`absolute end-3 top-3 rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white ${FOCUS}`}>
            <X size={18} />
          </button>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#E61559] shadow-lg">
            <House size={26} strokeWidth={2.3} />
          </span>
          <div className="mt-4 text-[13px] font-bold tracking-wide text-white/85">מסירת מפתח</div>
          <h2 id="b3d-summary-title" className="mt-0.5 text-[34px] font-black leading-tight tracking-[-0.02em] sm:text-[40px]">
            הבית מוכן!
          </h2>
          <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-white/90">מהתוכנית על הנייר ועד בית גמור ומרוהט, שלב אחר שלב. כך זה נראה במספרים:</p>
        </div>
        <div className="px-6 pb-6 pt-5 sm:px-8">
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-[#efe9e3] bg-[#faf8f5] px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-[#6d6668]">
                  <span className="text-[#E61559]">{s.icon}</span>
                  {s.label}
                </dt>
                <dd className="mt-1 text-[19px] font-extrabold leading-tight tabular-nums text-[#231F20]">{s.node}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#6d6668]">{SUMMARY.noteHe}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={onRestart}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#E61559] px-4 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(230,21,89,0.8)] transition hover:bg-[#cf0f4e] ${FOCUS}`}
            >
              <RotateCcw size={17} />
              צפו שוב מההתחלה
            </button>
            <a
              href="/"
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#231F20]/20 px-4 py-3.5 text-[15px] font-bold text-[#231F20] transition hover:bg-[#f6f2ee] ${FOCUS}`}
            >
              <House size={17} />
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
