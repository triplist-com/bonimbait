import { Star } from 'lucide-react';
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

const SIZES = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' } as const;

/**
 * Five stars with half-star precision. Stars fill from the start side (right
 * in RTL). Exposed to assistive tech as one image with a text label.
 */
export function RatingStars({ value, scale = 5, count, showValue, size = 'md', inverse, className }: RatingStarsProps) {
  const stars = toFiveStars(value, scale);
  const label = `דירוג ${stars.toLocaleString('he-IL')} מתוך 5${typeof count === 'number' ? `, ${count === 1 ? 'חוות דעת אחת' : `${count} חוות דעת`}` : ''}`;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span role="img" aria-label={label} className="inline-flex items-center gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, stars - i)); // 0, 0.5 or 1
          return (
            <span key={i} className="relative inline-flex" aria-hidden="true">
              <Star className={cn(SIZES[size], inverse ? 'text-white/25' : 'text-ink-200', 'fill-current')} strokeWidth={0} />
              {fill > 0 && (
                <span className="absolute inset-y-0 start-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                  <Star className={cn(SIZES[size], 'fill-current text-warning-500')} strokeWidth={0} />
                </span>
              )}
            </span>
          );
        })}
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
