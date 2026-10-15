import { cn } from '@/lib/cn';
import { BAND_LABELS } from '@/lib/project-file/score';
import type { ScoreBand } from '@/lib/project-file/types';

const RING: Record<ScoreBand, string> = {
  hot: 'stroke-primary-600',
  warm: 'stroke-warning-500',
  cool: 'stroke-ink-400',
};
const TEXT: Record<ScoreBand, string> = {
  hot: 'text-primary-700',
  warm: 'text-warning-700',
  cool: 'text-ink-600',
};
const SIZES = {
  sm: { box: 'size-11', font: 'text-sm', stroke: 3.5 },
  md: { box: 'size-14', font: 'text-lg', stroke: 4 },
  lg: { box: 'size-24', font: 'text-3xl', stroke: 5 },
} as const;

/**
 * The lead score as a ring (0-100) with its band: magenta = חם, amber =
 * פושר, ink = ראשוני. Colour is never the only signal: the band word is in
 * the label and, at `showBand`, under the ring.
 */
export default function ScoreBadge({
  score,
  band,
  size = 'md',
  showBand = false,
  className,
}: {
  score: number | null;
  band: ScoreBand | null;
  size?: keyof typeof SIZES;
  showBand?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const r = 18 - s.stroke / 2;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  const tone: ScoreBand = band ?? 'cool';
  const label = score === null ? 'ללא ציון' : `ציון ${score} מתוך 100, ${BAND_LABELS[tone]}`;
  return (
    <span className={cn('inline-flex shrink-0 flex-col items-center gap-1', className)} role="img" aria-label={label}>
      <span className={cn('relative inline-flex items-center justify-center', s.box)}>
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth={s.stroke} className="stroke-ink-100" />
          {score !== null && (
            <circle
              cx="18"
              cy="18"
              r={r}
              fill="none"
              strokeWidth={s.stroke}
              strokeLinecap="round"
              strokeDasharray={`${(value / 100) * c} ${c}`}
              className={RING[tone]}
            />
          )}
        </svg>
        <span aria-hidden="true" className={cn('num font-extrabold leading-none', s.font, score === null ? 'text-ink-400' : TEXT[tone])}>
          {score ?? '–'}
        </span>
      </span>
      {showBand && score !== null && (
        <span aria-hidden="true" className={cn('text-xs font-bold', TEXT[tone])}>
          {BAND_LABELS[tone]}
        </span>
      )}
    </span>
  );
}
