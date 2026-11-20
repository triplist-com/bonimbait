'use client';

import { Boxes, CalendarDays, Hammer, House, ListChecks, RotateCcw, Wallet, X } from 'lucide-react';
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

/** Finale card: the totals are the hardcoded whole-house numbers (lib/build3d/content/totals.ts). */
export default function Summary({ timeline, onRestart, onClose }: { timeline: Pick<Timeline, 'steps'>; onRestart: () => void; onClose: () => void }) {
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
    { label: 'שלבי עבודה', icon: <ListChecks size={16} />, node: <Counter value={timeline.steps.length} active durationMs={900} /> },
    { label: 'עלות משוערת', icon: <Wallet size={16} />, node: fmtILS(t.costILS) },
  ];
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-[#231F20]/35 p-4 backdrop-blur-[3px] animate-fade-in"
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
          <button onClick={onClose} aria-label="סגירה" className={`absolute end-3 top-3 rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white ${FOCUS}`}>
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
