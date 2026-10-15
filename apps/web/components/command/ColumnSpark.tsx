'use client';

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { formatCount, formatUsd, shortDayHe } from '@/lib/command/format';
import type { Point } from '@/lib/command/types';

type Format = 'count' | 'usd';

function fmt(value: number, format: Format): string {
  return format === 'usd' ? formatUsd(value) : formatCount(value);
}

/** Clean axis maximum (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 x 10^n). */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const m = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const c = Math.round(step * m * 1e9) / 1e9;
    if (c >= value) return c;
  }
  return 10 * m;
}

/**
 * Daily single-series columns (one hue, no legend: the label names the
 * series). Time runs left to right. Columns are at most 24px wide with a 2px
 * gap, square at the baseline and rounded 4px at the top. Pointer or arrow
 * keys show the day's value; a hidden table carries every value for screen
 * readers.
 */
export default function ColumnSpark({
  points,
  label,
  unit,
  format = 'count',
  size = 'sm',
  className,
}: {
  points: readonly Point[];
  /** Accessible name: what is plotted and over which period. */
  label: string;
  /** Unit word for the readout ("שאלות", "לידים"). */
  unit: string;
  format?: Format;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const id = useId();
  if (points.length === 0) return null;
  const top = niceMax(Math.max(...points.map((p) => p.value)));
  const n = points.length;
  const shown = active != null ? points[active] : null;
  const height = size === 'sm' ? 'h-12' : 'h-32';

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * n);
    setKeyboard(false);
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? n - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(n - 1, cur + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Escape') {
      setActive(null);
      return;
    }
    if (next == null) return;
    e.preventDefault();
    setKeyboard(true);
    setActive(next);
  };

  return (
    <div className={cn('min-w-0', className)}>
      <div className="relative" dir="ltr">
        {shown && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-center text-xs text-white shadow-lift"
            style={{ left: `${Math.min(92, Math.max(8, ((active! + 0.5) / n) * 100))}%` }}
          >
            <span className="font-bold tabular-nums">{fmt(shown.value, format)}</span>{' '}
            <span className="text-white/75" dir="rtl">
              {unit} · {shortDayHe(shown.date)}
            </span>
          </div>
        )}
        <div
          ref={plot}
          role="group"
          tabIndex={0}
          aria-label={`${label}. חיצים: מעבר בין הימים`}
          onPointerMove={fromPointer}
          onPointerLeave={() => !keyboard && setActive(null)}
          onFocus={() => {
            setKeyboard(true);
            setActive((a) => a ?? n - 1);
          }}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
          className={cn(
            'relative flex items-end gap-[2px] rounded-md border-b border-ink-300 outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
            height,
          )}
        >
          {size === 'md' && (
            <>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-ink-100" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-ink-100" />
            </>
          )}
          {points.map((p, i) => (
            <div key={p.date} className="relative flex h-full flex-1 items-end justify-center">
              <div
                className={cn('w-full max-w-[24px] rounded-t-[4px] transition-colors', i === active ? 'bg-primary-800' : 'bg-primary-600')}
                style={{ height: `${p.value > 0 ? Math.max(4, (p.value / top) * 100) : 0}%` }}
              />
            </div>
          ))}
        </div>
        {size === 'md' && (
          <div aria-hidden="true" className="mt-1.5 flex justify-between text-[11px] tabular-nums text-ink-500">
            <span>{shortDayHe(points[0].date)}</span>
            <span>
              {fmt(0, format)}–{fmt(top, format)}
            </span>
            <span>{shortDayHe(points[n - 1].date)}</span>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {keyboard && shown ? `${shortDayHe(shown.date)}: ${fmt(shown.value, format)} ${unit}` : ''}
      </p>
      <table id={`${id}-table`} className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">יום</th>
            <th scope="col">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{shortDayHe(p.date)}</td>
              <td>{fmt(p.value, format)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
