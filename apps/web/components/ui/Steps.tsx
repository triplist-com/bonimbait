import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface StepItem {
  label: ReactNode;
  description?: ReactNode;
}

export type StepState = 'complete' | 'current' | 'upcoming';

/** State of step `index` when `current` is the active step (0-based). */
export function stepState(index: number, current: number): StepState {
  if (index < current) return 'complete';
  if (index === current) return 'current';
  return 'upcoming';
}

export interface StepsProps {
  steps: StepItem[];
  /** 0-based index of the current step; steps.length marks all complete. */
  current: number;
  orientation?: 'horizontal' | 'vertical';
  label?: string;
  /** Number shown on the first step (default 1), e.g. a slice of a longer journey. */
  startAt?: number;
  className?: string;
}

/** Ordered progress through a flow (onboarding, checkout, a build stage). */
export function Steps({ steps, current, orientation = 'horizontal', label = 'שלבים', startAt = 1, className }: StepsProps) {
  const vertical = orientation === 'vertical';
  return (
    <ol aria-label={label} className={cn(vertical ? 'flex flex-col' : 'flex items-start', className)}>
      {steps.map((step, i) => {
        const state = stepState(i, current);
        const last = i === steps.length - 1;
        return (
          <li
            key={i}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn('relative flex', vertical ? 'gap-4 pb-8 last:pb-0' : 'flex-1 flex-col items-center text-center')}
          >
            {!last && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute',
                  vertical ? 'start-4 top-9 h-[calc(100%-2.5rem)] w-0.5' : 'top-4 h-0.5 w-[calc(100%-2.5rem)] start-[calc(50%+1.25rem)]',
                  state === 'complete' ? 'bg-primary-600' : 'bg-ink-200',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                state === 'complete' && 'bg-primary-600 text-white',
                state === 'current' && 'bg-white text-primary-700 ring-2 ring-primary-600',
                state === 'upcoming' && 'bg-white text-ink-500 ring-1 ring-ink-200',
              )}
            >
              {state === 'complete' ? <Check className="size-4" aria-hidden="true" /> : <span className="num">{i + startAt}</span>}
              <span className="sr-only">{state === 'complete' ? ' (הושלם)' : state === 'current' ? ' (שלב נוכחי)' : ''}</span>
            </span>
            <span className={cn('flex flex-col', vertical ? 'pt-1' : 'mt-2 px-1')}>
              <span className={cn('text-sm font-semibold', state === 'upcoming' ? 'text-ink-500' : 'text-ink-900')}>{step.label}</span>
              {step.description && <span className="text-caption text-ink-500">{step.description}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface ProgressProps {
  value: number;
  max?: number;
  label: string;
  /** Show "40%" next to the label. */
  showValue?: boolean;
  size?: 'sm' | 'md';
  tone?: 'brand' | 'success' | 'ink';
  className?: string;
}

/** Clamp to [0, 100] and round: progressPercent(3, 8) -> 38. */
export function progressPercent(value: number, max = 100): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
}

/** Determinate progress bar; fills from the start side (right in RTL). */
export function Progress({ value, max = 100, label, showValue, size = 'md', tone = 'brand', className }: ProgressProps) {
  const pct = progressPercent(value, max);
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink-800">{label}</span>
        {showValue && <span className="num font-semibold text-ink-900">{pct}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={cn('flex w-full overflow-hidden rounded-full bg-ink-100', size === 'sm' ? 'h-1.5' : 'h-2.5')}
      >
        <span
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            tone === 'brand' && 'bg-primary-600',
            tone === 'success' && 'bg-success-600',
            tone === 'ink' && 'bg-ink-900',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
