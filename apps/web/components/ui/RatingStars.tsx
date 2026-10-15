import { cn } from '@/lib/cn';
import { toFiveStars } from '@/lib/format';

export interface RatingStarsProps {
  /** Rating on `scale` (directory reviews are 0-10). */
  value: number | null | undefined;
  scale?: number;
  /** Number of reviews, shown after the stars. */
  count?: number;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  inverse?: boolean;
  className?: string;
}

/** Row height; the row is five square cells wide. */
const SIZES = { sm: 'h-3.5 w-[4.375rem]', md: 'h-4 w-20', lg: 'h-5 w-[6.25rem]' } as const;

/**
 * Five stars with half-star precision, filled from the start side (right in
 * RTL). Drawn with a CSS mask (.bb-stars in globals.css): two spans per
 * rating instead of ten SVGs, which matters on pages that list many pros.
 * Exposed to assistive tech as one image with a text label.
 */
export function RatingStars({ value, scale = 5, count, showValue, size = 'md', inverse, className }: RatingStarsProps) {
  const stars = toFiveStars(value, scale);
  const label = `דירוג ${stars.toLocaleString('he-IL')} מתוך 5${typeof count === 'number' ? `, ${count === 1 ? 'חוות דעת אחת' : `${count} חוות דעת`}` : ''}`;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span role="img" aria-label={label} className={cn('relative inline-block shrink-0', SIZES[size])}>
        <span aria-hidden="true" className={cn('bb-stars absolute inset-0', inverse ? 'bg-white/25' : 'bg-ink-200')} />
        <span aria-hidden="true" className="bb-stars absolute inset-y-0 start-0 bg-warning-500" style={{ width: `${(stars / 5) * 100}%` }} />
      </span>
      {showValue && <span className={cn('num text-sm font-bold', inverse ? 'text-white' : 'text-ink-900')}>{stars.toFixed(1)}</span>}
      {typeof count === 'number' && (
        <span aria-hidden="true" className={cn('text-sm', inverse ? 'text-white/70' : 'text-ink-500')}>
          (<span className="num">{count}</span>)
        </span>
      )}
    </span>
  );
}
