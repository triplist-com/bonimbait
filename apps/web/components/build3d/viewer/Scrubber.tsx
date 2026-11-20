'use client';

import { useRef, useState } from 'react';
import { PHASES } from '@/lib/build3d/engine/phases';
import type { Timeline } from '@/lib/build3d/engine/timeline';
import { phaseLabel } from './format';

/**
 * RTL timeline: step 1 at the right. Phase-colored segments, a tick per step,
 * filled up to the current step; click or drag to seek, hover for the step title.
 */
export default function Scrubber({
  timeline,
  step,
  onSeek,
  thin = false,
}: {
  timeline: Timeline;
  step: number;
  onSeek: (i: number) => void;
  thin?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const n = timeline.steps.length;
  const indexAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return step;
    const t = (r.right - clientX) / r.width;
    return Math.max(0, Math.min(n - 1, Math.floor(t * n)));
  };
  const pct = (i: number) => (i / n) * 100;
  const hoverStep = hover !== null ? timeline.steps[hover] : null;
  const curPhase = timeline.phases.find((p) => step >= p.first && step <= p.last);
  const hoverPhase = hover !== null ? timeline.phases.find((p) => hover >= p.first && hover <= p.last) : undefined;

  return (
    <div className={`relative w-full select-none ${thin ? '' : 'pb-3.5'}`} style={{ touchAction: 'none' }}>
      <div
        ref={ref}
        role="slider"
        aria-label="ציר השלבים"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={step + 1}
        aria-valuetext={`שלב ${step + 1}: ${timeline.steps[step]?.titleHe ?? ''}`}
        tabIndex={0}
        className={`group relative w-full cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E61559] focus-visible:ring-offset-2 focus-visible:ring-offset-white ${thin ? 'h-8' : 'h-8'}`}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDrag(true);
          onSeek(indexAt(e.clientX));
        }}
        onPointerMove={(e) => {
          const i = indexAt(e.clientX);
          setHover(i);
          if (drag && i !== step) onSeek(i);
        }}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        {/* Phase segments */}
        <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full ${thin ? 'h-1.5' : 'h-2'}`}>
          {timeline.phases.map((ph) => {
            const color = PHASES[ph.phase].color;
            const right = pct(ph.first);
            const width = pct(ph.last + 1) - right;
            const done = step >= ph.last ? 1 : step < ph.first ? 0 : (step - ph.first + 1) / (ph.last - ph.first + 1);
            return (
              <div key={`${ph.phase}-${ph.first}`} className="absolute top-0 h-full" style={{ right: `${right}%`, width: `${width}%`, padding: '0 1px' }}>
                <div className="relative h-full w-full overflow-hidden rounded-full" style={{ background: `${color}33` }}>
                  <div className="absolute right-0 top-0 h-full rounded-full transition-[width] duration-300" style={{ width: `${done * 100}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
        {/* Step ticks */}
        {!thin &&
          timeline.steps.map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-white/80"
              style={{ right: `${pct(i)}%`, opacity: i === 0 ? 0 : 0.9 }}
            />
          ))}
        {/* Thumb */}
        <div
          className="pointer-events-none absolute top-1/2 grid h-5 w-5 -translate-y-1/2 translate-x-1/2 place-items-center rounded-full border-2 border-white bg-[#E61559] shadow-[0_2px_10px_rgba(230,21,89,0.55)] transition-[right] duration-300"
          style={{ right: `${pct(step + 0.5)}%` }}
        />
      </div>
      {!thin && curPhase && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 whitespace-nowrap text-[11.5px] font-bold leading-none"
          style={{
            right: `clamp(0%, ${pct((curPhase.first + curPhase.last + 1) / 2)}%, 100%)`,
            transform: 'translateX(50%)',
            color: PHASES[curPhase.phase].color,
          }}
        >
          {phaseLabel(PHASES[curPhase.phase].nameHe)}
        </div>
      )}
      {hoverStep && hover !== null && hoverPhase && (
        <div
          className="pointer-events-none absolute bottom-full z-10 mb-2 flex max-w-[260px] translate-x-1/2 flex-col items-start gap-0.5 rounded-lg bg-[#231F20] px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg"
          style={{ right: `clamp(60px, ${pct(hover + 0.5)}%, calc(100% - 60px))` }}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: '#fff' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PHASES[hoverPhase.phase].color }} />
            {phaseLabel(PHASES[hoverPhase.phase].nameHe)}
          </span>
          <span className="whitespace-normal leading-snug">
            <span className="opacity-70">שלב {hover + 1} · </span>
            {hoverStep.titleHe}
          </span>
        </div>
      )}
    </div>
  );
}
