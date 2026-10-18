import { compactAmount, compactRange } from '@/lib/planner/format';
import { cn } from '@/lib/cn';

/**
 * A shekel amount or range, compact ("₪2.21–2.99 מיליון"): digits in an LTR
 * isolate, the Hebrew unit after them. Server-safe.
 */
export function Money({
  min,
  max,
  amount,
  className,
  valueClassName,
  unitClassName,
}: {
  min?: number;
  max?: number;
  amount?: number;
  className?: string;
  valueClassName?: string;
  unitClassName?: string;
}) {
  const parts = amount !== undefined ? compactAmount(amount) : compactRange(min ?? 0, max ?? 0);
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5', className)}>
      <span className={cn('num', valueClassName)}>₪{parts.value}</span>
      {parts.unit && <span className={unitClassName}>{parts.unit}</span>}
    </span>
  );
}
