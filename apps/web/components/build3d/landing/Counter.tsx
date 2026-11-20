'use client';

import { useEffect, useRef } from 'react';

interface CounterProps {
  value: number;
  active: boolean;
  /** Show the final value immediately (skip / reduced motion). */
  instant?: boolean;
  durationMs?: number;
  decimals?: number;
  className?: string;
}

/** Number that ticks up from 0 when `active` turns true. Writes to the DOM directly (no re-renders). */
export default function Counter({ value, active, instant, durationMs = 900, decimals = 0, className }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (n: number) => n.toLocaleString('he-IL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (!active) {
      el.textContent = fmt(0);
      return;
    }
    if (instant) {
      el.textContent = fmt(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active, instant, durationMs, decimals]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      0
    </span>
  );
}
