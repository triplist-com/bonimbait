'use client';

import { House, RotateCcw, X } from 'lucide-react';
import { SUMMARY } from '@/lib/build3d/content';
import type { Timeline } from '@/lib/build3d/engine/timeline';
import { fmtILS, fmtInt, fmtMonths, fmtNum } from './format';

export interface BuildTotals {
  days: number;
  costILS: number;
  concreteM3: number;
  rebarT: number;
  blocks: number;
}

/** Totals from the steps' bills of materials (by line name/unit conventions, see engine/README.md). */
export function buildTotals(t: Timeline): BuildTotals {
  let concreteM3 = 0;
  let rebarT = 0;
  let blocks = 0;
  for (const s of t.steps) {
    for (const m of s.materials) {
      if (m.unitHe === 'מ״ק' && m.nameHe.startsWith('בטון')) concreteM3 += m.qty;
      if (m.unitHe === 'טון' && /ברזל|זיון|חישוק|רשת/.test(m.nameHe)) rebarT += m.qty;
      if (m.unitHe === 'יח׳' && m.nameHe.includes('בלוק')) blocks += m.qty;
    }
  }
  return { days: t.totals.days, costILS: t.totals.costILS, concreteM3, rebarT, blocks };
}

export default function Summary({ timeline, onRestart, onClose }: { timeline: Timeline; onRestart: () => void; onClose: () => void }) {
  const t = buildTotals(timeline);
  const stats: Array<[string, string]> = [
    ['משך הבנייה', fmtMonths(t.days)],
    ['בטון', `${fmtInt(t.concreteM3)} מ״ק`],
    ['ברזל זיון', `${fmtNum(Math.round(t.rebarT * 10) / 10)} טון`],
    ['בלוקים', t.blocks > 0 ? fmtInt(t.blocks) : '—'],
    ['שלבי עבודה', fmtInt(timeline.steps.length)],
    ['עלות משוערת', fmtILS(t.costILS)],
  ];
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-[#231F20]/25 p-4 backdrop-blur-[2px] animate-fade-in">
      <div className="relative w-full max-w-[520px] rounded-3xl bg-white/95 p-6 shadow-[0_30px_80px_-20px_rgba(35,31,32,0.45)] animate-scale-in sm:p-8">
        <button onClick={onClose} aria-label="סגירה" className="absolute end-4 top-4 rounded-full p-1.5 text-[#8a8385] hover:bg-[#f3eee9]">
          <X size={18} />
        </button>
        <div className="text-[13px] font-bold text-[#E61559]">מסירת מפתח</div>
        <h2 className="mt-1 text-[30px] font-black leading-tight tracking-[-0.02em]">הבית מוכן!</h2>
        <p className="mt-1.5 text-[15px] text-[#5b5557]">מהתוכנית על הנייר ועד בית גמור, שלב אחר שלב. כך זה נראה במספרים:</p>
        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-[#efe9e3] bg-[#faf8f5] px-3 py-2.5">
              <dt className="text-[12px] font-semibold text-[#8a8385]">{k}</dt>
              <dd className="mt-0.5 text-[18px] font-extrabold tabular-nums text-[#231F20]">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[#8a8385]">{SUMMARY.noteHe}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={onRestart}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#E61559] px-4 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(230,21,89,0.8)] transition hover:bg-[#cf0f4e]"
          >
            <RotateCcw size={17} />
            צפו שוב מההתחלה
          </button>
          <a
            href="/"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#231F20]/15 px-4 py-3 text-[15px] font-bold text-[#231F20] transition hover:bg-[#f6f2ee]"
          >
            <House size={17} />
            לאתר בונים בית
          </a>
        </div>
      </div>
    </div>
  );
}
