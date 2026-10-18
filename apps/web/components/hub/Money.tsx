import { moneyParts, moneyRangeParts, varianceParts } from '@/lib/hub/format';
import { cn } from '@/lib/cn';

/**
 * Shekel amounts inside Hebrew text: the digits sit in an LTR isolate
 * (.num) so ranges never flip ("2.4–2.8", not "2.8–2.4"). Server-safe.
 */
export function Money({ value, className }: { value: number; className?: string }) {
  const p = moneyParts(value);
  return (
    <span className={className}>
      <span className="num">{p.value}</span> {p.unit}
    </span>
  );
}

export function MoneyRange({ min, max, className }: { min: number; max: number; className?: string }) {
  const p = moneyRangeParts(min, max);
  return (
    <span className={className}>
      {min <= 0 && max > 0 ? 'עד ' : ''}
      <span className="num">{p.value}</span> {p.unit}
    </span>
  );
}

/** "+45 אלף ₪" / "−30 אלף ₪" (sign inside the LTR isolate). */
export function Variance({ value, className }: { value: number; className?: string }) {
  const p = varianceParts(value);
  return (
    <span className={cn('whitespace-nowrap', className)}>
      <span className="num">
        {p.sign}
        {p.value}
      </span>{' '}
      {p.unit}
    </span>
  );
}
