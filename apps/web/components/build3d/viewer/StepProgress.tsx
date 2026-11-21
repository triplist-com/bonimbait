'use client';

/**
 * Thin per-step progress line: fills (right to left, RTL) over the step's 3D animation span,
 * then settles to a quiet full line. Pure CSS (remount with key={step}); reduced motion shows it full.
 */
export default function StepProgress({ seconds, className = '' }: { seconds: number; className?: string }) {
  const s = Math.max(0.3, seconds);
  return (
    <div aria-hidden className={`pointer-events-none h-[3px] overflow-hidden rounded-full bg-ink-200/60 ${className}`}>
      <div className="b3d-step-progress h-full w-full origin-right rounded-full bg-primary" style={{ animationDuration: `${s}s, 0.6s`, animationDelay: `0s, ${s + 0.4}s` }} />
      <style>{`
        .b3d-step-progress { animation-name: b3d-progress, b3d-progress-done; animation-timing-function: linear, ease-out; animation-fill-mode: both, forwards; }
        @keyframes b3d-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes b3d-progress-done { to { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) { .b3d-step-progress { animation: none; opacity: 0.35; } }
      `}</style>
    </div>
  );
}
