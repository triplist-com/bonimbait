'use client';

import { CalendarDays, HardHat, Lightbulb, PlayCircle, Search, ShieldCheck, Wallet } from 'lucide-react';
import type { Step } from '@/lib/build3d/engine/types';
import { phaseInfo } from '@/lib/build3d/engine/phases';
import { FOCUS, fmtDays, fmtILS, fmtInt, fmtNum, phaseLabel } from './format';

export interface StepCardProps {
  step: Step;
  index: number;
  total: number;
  cumCost: number;
  cumDays: number;
  /** Omit the number/title block (mobile: shown in the sheet header). */
  hideHeader?: boolean;
}

export function StepHeader({ step, index, total }: Pick<StepCardProps, 'step' | 'index' | 'total'>) {
  const ph = phaseInfo(step.phase);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-600">
      <span className="tabular-nums">
        שלב <span className="text-ink font-extrabold">{index + 1}</span> מתוך {total}
      </span>
      <span aria-hidden className="text-ink-300">·</span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
        style={{ background: `${ph.color}1f`, color: ph.color }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: ph.color }} />
        {phaseLabel(ph.nameHe)}
      </span>
    </div>
  );
}

export default function StepCard({ step, index, total, cumCost, cumDays, hideHeader }: StepCardProps) {
  return (
    <article className="flex flex-col gap-4" aria-live="polite">
      <div className={hideHeader ? 'hidden' : 'flex items-start gap-3.5'}>
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[26px] font-black tabular-nums text-white shadow-[0_8px_20px_-8px_rgba(230,21,89,0.65)]"
          style={{ background: 'linear-gradient(140deg,#F0306F,#C80F4C)' }}
        >
          {index + 1}
        </div>
        <div className="min-w-0 pt-0.5">
          <StepHeader step={step} index={index} total={total} />
          <h2 className="mt-1 text-balance break-words text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-ink">{step.titleHe}</h2>
        </div>
      </div>

      {step.descHe && <p className="text-pretty text-[15px] leading-[1.7] text-ink-700">{step.descHe}</p>}

      {step.materials.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-bold text-ink-500">חומרים וכמויות</h3>
          <ul className="flex flex-wrap gap-1.5">
            {step.materials.map((m) => (
              <li
                key={m.nameHe}
                className="flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] leading-tight shadow-[0_1px_0_rgba(35,31,32,0.04)]"
              >
                <span className="rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-white">
                  {fmtNum(m.qty)}
                  <span className="ms-1 font-medium opacity-80">{m.unitHe}</span>
                </span>
                <span className="text-ink-700">{m.nameHe}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        <Fact icon={<CalendarDays size={15} />} label="משך" value={fmtDays(step.durationDays)} />
        <Fact
          icon={<Wallet size={15} />}
          label="עלות משוערת"
          value={step.costILS > 0 ? fmtILS(step.costILS) : 'כלול בשלב הקודם'}
          note={step.costILS > 0 ? 'הערכה' : undefined}
        />
        {step.crewHe && <Fact className="col-span-2" icon={<HardHat size={15} />} label="צוות" value={step.crewHe} />}
      </dl>

      <div className="flex items-center justify-between rounded-xl bg-ink px-3.5 py-2.5 text-[13px] text-white">
        <span className="opacity-75">מצטבר עד כאן</span>
        <span className="font-bold tabular-nums">
          {fmtILS(cumCost)} <span className="font-normal opacity-60">·</span> {fmtInt(cumDays)} ימים
        </span>
      </div>

      {step.tipHe && (
        <aside className="rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-3 text-[14px] leading-relaxed text-ink-800">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-primary-700">
            <Lightbulb size={14} /> טיפ מהשטח
          </div>
          {step.tipHe}
        </aside>
      )}

      {step.checkpointHe && (
        <div className="flex items-start gap-2 rounded-xl border border-success-100 bg-success-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-success-800">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success-600" />
          <span>
            <b className="font-bold">נקודת בדיקה: </b>
            {step.checkpointHe}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {step.videos?.map((v) => (
          <a
            key={v.href}
            href={v.href}
            target="_blank"
            rel="noreferrer"
            className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 text-[14px] text-ink transition hover:bg-primary-50 ${FOCUS}`}
          >
            <PlayCircle size={18} className="shrink-0 text-primary" />
            <span className="line-clamp-2 min-w-0 leading-snug group-hover:text-primary-700">{v.titleHe}</span>
          </a>
        ))}
        {step.searchQuery && (
          <a
            href={`/search/?q=${encodeURIComponent(step.searchQuery)}`}
            target="_blank"
            rel="noreferrer"
            className={`mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-white px-3 py-2 text-[14px] font-semibold text-primary-700 transition hover:border-primary/60 hover:bg-primary-50 ${FOCUS}`}
          >
            <Search size={16} />
            לסרטונים בנושא
          </a>
        )}
      </div>
    </article>
  );
}

function Fact({
  icon,
  label,
  value,
  note,
  className = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-ink-200 bg-white/70 px-3 py-2 ${className}`}>
      <dt className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-500">
        {icon}
        {label}
        {note && <span className="rounded bg-ink-100 px-1 py-px text-[10.5px] font-medium text-ink-600">{note}</span>}
      </dt>
      <dd className="mt-0.5 font-bold text-ink">{value}</dd>
    </div>
  );
}
