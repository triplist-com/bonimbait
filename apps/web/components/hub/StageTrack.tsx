import { BUILD_STAGES } from '@/lib/stages';
import { stageStatus } from '@/lib/hub/roadmap';
import type { StageId } from '@/lib/hub/types';
import { cn } from '@/lib/cn';

/**
 * The owner's 7 stages as a segmented track: done (magenta), current
 * (magenta, labelled), upcoming (neutral). Fills from the start side (right
 * in RTL). Server-safe; `animate` grows the segments in on mount (CSS only,
 * off under reduced motion).
 */
export function StageTrack({
  current,
  tone = 'light',
  animate = false,
  className,
}: {
  current: StageId | null;
  tone?: 'light' | 'dark';
  animate?: boolean;
  className?: string;
}) {
  const dark = tone === 'dark';
  return (
    <ol aria-label="שלבי הבנייה" className={cn('grid grid-cols-7 gap-1 sm:gap-1.5', className)}>
      {BUILD_STAGES.map((stage, i) => {
        const status = stageStatus(stage.id, current);
        return (
          <li key={stage.id} aria-current={status === 'current' ? 'step' : undefined} className="flex min-w-0 flex-col gap-1.5">
            <span
              aria-hidden="true"
              style={animate ? { animationDelay: `${i * 90}ms` } : undefined}
              className={cn(
                'h-2 rounded-full',
                animate && 'motion-safe:animate-fade-in',
                status === 'done' && 'bg-primary-600',
                status === 'current' && 'bg-primary-600 ring-2 ring-primary-600/25 ring-offset-1',
                status === 'current' && (dark ? 'ring-offset-ink-900' : 'ring-offset-white'),
                status === 'upcoming' && (dark ? 'bg-white/15' : 'bg-ink-100'),
              )}
            />
            <span
              className={cn(
                'break-words text-center text-2xs leading-tight sm:text-caption',
                status === 'current'
                  ? dark
                    ? 'font-bold text-white'
                    : 'font-bold text-primary-700'
                  : dark
                    ? 'text-white/65'
                    : 'text-ink-600',
              )}
            >
              {stage.label.replace('/', '/​')}
              <span className="sr-only">
                {status === 'done' ? ' (הושלם)' : status === 'current' ? ' (השלב שלכם)' : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
