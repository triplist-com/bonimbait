'use client';

import { CalendarDays, ChevronDown, ChevronLeft, HardHat, Lightbulb, PlayCircle, Search, ShieldCheck, Sigma, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { Step } from '@/lib/build3d/engine/types';
import { phaseInfo } from '@/lib/build3d/engine/phases';
import PartsPanel from './PartsPanel';
import { FOCUS, fmtDays, fmtILS, fmtInt, phaseLabel } from './format';

export interface StepCardProps {
  step: Step;
  index: number;
  total: number;
  cumCost: number;
  cumDays: number;
  /**
   * 'card' (desktop): number, title, description, parts, duration + cost; the rest in a
   * "פרטים נוספים" disclosure. 'sheet' (mobile, expanded sheet body): the header, parts and
   * numbers are in the sheet's peek, so this shows the description and every detail, open.
   */
  variant?: 'card' | 'sheet';
  /** Next step (title + go), shown as "שלב הבא" at the end of the card. */
  next?: { title: string; onGo: () => void };
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
        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-0.5 text-[12px] font-semibold text-ink-700"
        title={phaseLabel(ph.nameHe)}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ph.color }} aria-hidden />
        <span className="truncate whitespace-nowrap">{phaseLabel(ph.nameHe)}</span>
      </span>
    </div>
  );
}

/** "3 ימי עבודה · 22,000 ₪" — the step's duration and cost on one line (mobile peek). */
export function StepNumbers({ step, className = '' }: { step: Step; className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-[13px] font-semibold text-ink-700 ${className}`}>
      <CalendarDays size={14} className="shrink-0 text-ink-500" aria-hidden />
      <span>{fmtDays(step.durationDays)}</span>
      <span aria-hidden className="text-ink-300">·</span>
      <Wallet size={14} className="shrink-0 text-ink-500" aria-hidden />
      <span className="tabular-nums">{step.costILS > 0 ? fmtILS(step.costILS) : 'כלול בשלב הקודם'}</span>
    </p>
  );
}

// The disclosure stays open across steps once the user opened it (the card remounts per step).
let moreOpenPref = false;

export default function StepCard({ step, index, total, cumCost, cumDays, variant = 'card', next }: StepCardProps) {
  const sheet = variant === 'sheet';
  const [moreOpen, setMoreOpen] = useState(moreOpenPref);
  const details = <Details step={step} cumCost={cumCost} cumDays={cumDays} />;
  return (
    <article className="flex flex-col gap-4" aria-live="polite">
      {!sheet && (
        <div className="flex items-start gap-3.5">
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
      )}

      {step.descHe && <p className="text-pretty text-[15px] leading-[1.65] text-ink-700">{step.descHe}</p>}

      {!sheet && step.materials.length > 0 && (
        <section aria-labelledby={`b3d-parts-${index}`}>
          <h3 id={`b3d-parts-${index}`} className="mb-2 text-[12px] font-bold text-ink-500">
            חלקים לשלב
          </h3>
          <PartsPanel materials={step.materials} />
        </section>
      )}

      {!sheet && (
        <dl className="grid grid-cols-2 gap-2 text-[13px]">
          <Fact icon={<CalendarDays size={15} />} label="משך" value={fmtDays(step.durationDays)} />
          <Fact
            icon={<Wallet size={15} />}
            label="עלות משוערת"
            value={step.costILS > 0 ? fmtILS(step.costILS) : 'כלול בשלב הקודם'}
            note={step.costILS > 0 ? 'הערכה' : undefined}
          />
        </dl>
      )}

      {sheet ? (
        details
      ) : (
        <details
          open={moreOpen}
          onToggle={(e) => {
            const open = (e.currentTarget as HTMLDetailsElement).open;
            moreOpenPref = open;
            setMoreOpen(open);
          }}
          className="group rounded-2xl border border-ink-200 bg-white/70"
        >
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-2xl px-3.5 py-2 text-[14px] font-bold text-ink hover:bg-ink-50 [&::-webkit-details-marker]:hidden ${FOCUS}`}
          >
            פרטים נוספים
            {/* What is inside, as icons (tip, checkpoint, videos). */}
            <span className="flex items-center gap-1 text-ink-500" aria-hidden>
              {step.crewHe && <HardHat size={14} />}
              {step.tipHe && <Lightbulb size={14} className="text-primary-700" />}
              {step.checkpointHe && <ShieldCheck size={14} className="text-success-700" />}
              {(step.videos?.length ?? 0) > 0 && <PlayCircle size={14} className="text-primary-700" />}
            </span>
            <ChevronDown size={18} aria-hidden className="ms-auto shrink-0 text-ink-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-3.5 pb-3.5 pt-1">{details}</div>
        </details>
      )}

      {next && (
        <button
          type="button"
          onClick={next.onGo}
          className={`group flex min-h-11 items-center gap-2 rounded-2xl border border-dashed border-ink-200 px-3.5 py-2 text-start transition hover:border-primary/50 hover:bg-primary-50 ${FOCUS}`}
        >
          <span className="shrink-0 text-[12px] font-bold text-ink-500">שלב הבא</span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink group-hover:text-primary-700">{next.title}</span>
          {/* Keyboard hint with a mouse (RTL: ← is forward); a chevron on touch. */}
          <kbd aria-hidden className="hidden shrink-0 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 font-heebo text-[11px] font-bold leading-none text-ink-500 [@media(pointer:fine)]:inline-block">
            ←
          </kbd>
          <ChevronLeft size={18} aria-hidden className="shrink-0 text-ink-500 group-hover:text-primary-700 [@media(pointer:fine)]:hidden" />
        </button>
      )}
    </article>
  );
}

function Details({ step, cumCost, cumDays }: Pick<StepCardProps, 'step' | 'cumCost' | 'cumDays'>) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-2 text-[13px]">
        {step.crewHe && (
          <div className="flex items-start gap-2">
            <dt className="flex shrink-0 items-center gap-1.5 font-semibold text-ink-500">
              <HardHat size={15} aria-hidden /> צוות
            </dt>
            <dd className="font-semibold text-ink">{step.crewHe}</dd>
          </div>
        )}
        <div className="flex items-start gap-2">
          <dt className="flex shrink-0 items-center gap-1.5 font-semibold text-ink-500">
            <Sigma size={15} aria-hidden /> מצטבר עד כאן
          </dt>
          <dd className="font-bold tabular-nums text-ink">
            {fmtILS(cumCost)} <span className="font-normal text-ink-400">·</span> {fmtInt(cumDays)} ימי עבודה
          </dd>
        </div>
      </dl>

      {step.tipHe && (
        <aside className="rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-3 text-[14px] leading-relaxed text-ink-800">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-primary-700">
            <Lightbulb size={14} aria-hidden /> טיפ מהשטח
          </div>
          {step.tipHe}
        </aside>
      )}

      {step.checkpointHe && (
        <div className="flex items-start gap-2 rounded-xl border border-success-100 bg-success-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-success-800">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success-600" aria-hidden />
          <span>
            <b className="font-bold">נקודת בדיקה: </b>
            {step.checkpointHe}
          </span>
        </div>
      )}

      {((step.videos?.length ?? 0) > 0 || step.searchQuery) && (
        <div className="flex flex-col gap-1">
          {step.videos?.map((v) => (
            <a
              key={v.href}
              href={v.href}
              target="_blank"
              rel="noreferrer"
              className={`group flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5 text-[14px] text-ink transition hover:bg-primary-50 ${FOCUS}`}
            >
              <PlayCircle size={18} className="shrink-0 text-primary" aria-hidden />
              <span className="line-clamp-2 min-w-0 leading-snug group-hover:text-primary-700">{v.titleHe}</span>
            </a>
          ))}
          {step.searchQuery && (
            <a
              href={`/search/?q=${encodeURIComponent(step.searchQuery)}`}
              target="_blank"
              rel="noreferrer"
              className={`mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-white px-3 py-2 text-[14px] font-semibold text-primary-700 transition hover:border-primary/60 hover:bg-primary-50 ${FOCUS}`}
            >
              <Search size={16} aria-hidden />
              לסרטונים בנושא
            </a>
          )}
        </div>
      )}
    </div>
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
