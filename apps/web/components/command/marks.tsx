import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { ScoreBandId } from '@/lib/command/types';

/**
 * Chart marks for the Command Center, on the design system's data-viz rules
 * (docs/platform/DESIGN_SYSTEM.md §4): one series = brand magenta (slot 1),
 * ordered classes = one-hue magenta steps, chrome in ink, text never in the
 * series colour, values printed at the bar's tip.
 */

/**
 * Score bands are ordinal, so they take one-hue magenta steps light -> dark.
 * primary-400/600/800/900 passes the dataviz ordinal check on white (monotone
 * lightness, adjacent dL >= 0.06, light end 2.99:1). Ink text on the light
 * step, white on the rest (all >= 4.5:1).
 */
export const BAND_FILL: Record<ScoreBandId, string> = {
  hot: 'bg-primary-900',
  warm: 'bg-primary-800',
  mild: 'bg-primary-600',
  cold: 'bg-primary-400',
  none: 'bg-ink-300',
};

const BAND_CHIP: Record<ScoreBandId, string> = {
  hot: 'bg-primary-900 text-white',
  warm: 'bg-primary-800 text-white',
  mild: 'bg-primary-600 text-white',
  cold: 'bg-primary-400 text-ink-900',
  none: 'bg-ink-100 text-ink-600',
};

/** A lead's score as a compact chip; the number carries the meaning, the shade its band. */
export function ScoreChip({ score, band, className }: { score: number | null; band: ScoreBandId; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-7 min-w-9 items-center justify-center rounded-lg px-1.5 text-sm font-bold tabular-nums', BAND_CHIP[band], className)}
      title={score == null ? 'עדיין אין ציון' : `ציון ${score} מתוך 100`}
    >
      <bdi dir="ltr">{score ?? '—'}</bdi>
      <span className="sr-only">{score == null ? 'ללא ציון' : ` מתוך 100`}</span>
    </span>
  );
}

export type BarRow = {
  key: string;
  label: string;
  value: number;
  /** Formatted value at the bar's tip (defaults to the number). */
  display?: string;
  /** Muted second line under the label. */
  note?: string;
  href?: string;
  /** Fill class (default: the single-series magenta). */
  fill?: string;
};

/**
 * Horizontal bars for one measure across categories. Bars grow from the start
 * edge (right in RTL), square at the base and 4px rounded at the data end,
 * at most 10px thick; the value sits at the tip in ink.
 */
export function BarRows({
  rows,
  max,
  labelWidth = 'w-28 sm:w-40',
  empty = 'אין נתונים בתקופה.',
  className,
}: {
  rows: readonly BarRow[];
  max?: number;
  labelWidth?: string;
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-ink-500">{empty}</p>;
  const top = Math.max(1, max ?? Math.max(...rows.map((r) => r.value)));
  return (
    <ul className={cn('space-y-2.5', className)}>
      {rows.map((r) => {
        const label = r.href ? (
          <Link href={r.href} className="hover:text-primary-700 hover:underline">
            {r.label}
          </Link>
        ) : (
          r.label
        );
        return (
          <li key={r.key} className="flex items-center gap-3 text-sm">
            <span className={cn('shrink-0 break-words leading-snug text-ink-700', labelWidth)}>
              {label}
              {r.note && <span className="block text-xs text-ink-500">{r.note}</span>}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                aria-hidden="true"
                className={cn('h-2.5 shrink-0 rounded-e-[4px]', r.fill ?? 'bg-primary-600')}
                style={{ width: `${r.value > 0 ? Math.max(2, (r.value / top) * 78) : 0}%` }}
              />
              <bdi dir="ltr" className="shrink-0 text-xs font-semibold tabular-nums text-ink-900">
                {r.display ?? r.value.toLocaleString('en-US')}
              </bdi>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export type MeterTone = 'brand' | 'warning' | 'danger' | 'neutral';

const METER: Record<MeterTone, { fill: string; track: string }> = {
  brand: { fill: 'bg-primary-600', track: 'bg-primary-100' },
  warning: { fill: 'bg-warning-500', track: 'bg-warning-100' },
  danger: { fill: 'bg-danger-600', track: 'bg-danger-100' },
  neutral: { fill: 'bg-ink-400', track: 'bg-ink-100' },
};

/** A single ratio against a limit. The fill carries severity; the track is a lighter step of the same ramp. */
export function Meter({ share, tone = 'brand', label, className }: { share: number; tone?: MeterTone; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      className={cn('h-2.5 w-full overflow-hidden rounded-full', METER[tone].track, className)}
    >
      <div className={cn('h-full rounded-full', METER[tone].fill)} style={{ width: `${pct > 0 ? Math.max(2, pct * 100) : 0}%` }} />
    </div>
  );
}
