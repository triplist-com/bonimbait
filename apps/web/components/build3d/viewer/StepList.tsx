'use client';

import { useEffect, useRef } from 'react';
import { PHASES } from '@/lib/build3d/engine/phases';
import type { Timeline } from '@/lib/build3d/engine/timeline';
import { phaseLabel } from './format';

/** Phases with their steps; current step highlighted and kept in view. */
export default function StepList({ timeline, step, onSelect }: { timeline: Timeline; step: number; onSelect: (i: number) => void }) {
  const cur = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cur.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [step]);
  return (
    <nav aria-label="שלבי הבנייה" className="flex flex-col gap-3 pb-2">
      {timeline.phases.map((ph) => {
        const info = PHASES[ph.phase];
        const active = step >= ph.first && step <= ph.last;
        const done = step > ph.last;
        return (
          <section key={`${ph.phase}-${ph.first}`}>
            <h3 className={`mb-1 flex items-start gap-2 px-2 text-[12px] font-bold leading-snug ${active ? 'text-ink' : 'text-ink-500'}`}>
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-black text-white"
                style={{ background: done || active ? info.color : '#cfc8c1' }}
              >
                {ph.phase}
              </span>
              {/* Method phase names can be long: wrap inside the header, the count keeps its place. */}
              <span className="min-w-0 flex-1 pt-px">{phaseLabel(info.nameHe)}</span>
              <span className="shrink-0 pt-px font-medium text-ink-500" title="מספר שלבים">{ph.last === ph.first ? 'שלב אחד' : `${ph.last - ph.first + 1} שלבים`}</span>
            </h3>
            <ol className="flex flex-col">
              {timeline.steps.slice(ph.first, ph.last + 1).map((st, k) => {
                const i = ph.first + k;
                const isCur = i === step;
                return (
                  <li key={st.id}>
                    <button
                      ref={isCur ? cur : undefined}
                      onClick={() => onSelect(i)}
                      aria-current={isCur ? 'step' : undefined}
                      className={`group relative flex w-full items-center gap-2.5 rounded-lg py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:py-1.5 pe-2 ps-3 text-start text-[13.5px] leading-snug transition ${
                        isCur ? 'bg-white font-bold text-ink shadow-[0_2px_10px_-4px_rgba(35,31,32,0.25)]' : 'text-ink-700 hover:bg-white/60'
                      }`}
                    >
                      {isCur && <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-primary" />}
                      <span className={`w-5 shrink-0 text-[11.5px] tabular-nums ${i < step ? 'text-ink-300' : 'text-ink-500'}`}>{i + 1}</span>
                      <span className={i < step ? 'text-ink-500' : ''}>{st.titleHe}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </nav>
  );
}
