import { BUILD_STAGES } from '@/lib/stages';
import { monthsText } from '@/lib/planner/format';
import type { PlannerEstimate } from '@/lib/planner/types';

/**
 * Rough timeline: one bar, a segment per included stage sized by its longest
 * duration, then the total ("planning to keys"). Server-safe. `keysBetween` is
 * computed by the caller from today's date (client) or the report date.
 */
export function PlannerTimeline({ estimate, keysBetween }: { estimate: PlannerEstimate; keysBetween?: [string, string] }) {
  const stages = estimate.stages.filter((s) => s.included && s.months[1] > 0);
  const total = stages.reduce((a, s) => a + s.months[1], 0) || 1;
  const [lo, hi] = estimate.totalMonths;

  return (
    <div>
      <div className="flex h-10 w-full gap-[2px] overflow-hidden rounded-xl" role="img" aria-label={`ציר זמן משוער: ${monthsText(estimate.totalMonths)} מתכנון ועד מפתח`}>
        {stages.map((s, i) => (
          <span
            key={s.id}
            className={i % 2 === 0 ? 'bg-primary-600' : 'bg-primary-300'}
            style={{ width: `${(s.months[1] / total) * 100}%` }}
          />
        ))}
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-start gap-2">
            <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${i % 2 === 0 ? 'bg-primary-600' : 'bg-primary-300'}`} />
            <span>
              <span className="block text-sm font-semibold text-ink-900">{BUILD_STAGES.find((b) => b.id === s.id)?.label}</span>
              <span className="block text-sm text-ink-600">{monthsText(s.months)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-body text-ink-800">
        בסך הכול <strong className="num font-bold">{lo}–{hi}</strong> חודשים מהאדריכל ועד המפתח
        {keysBetween ? (
          <>
            . אם מתחילים לתכנן החודש: מפתח בין <strong>{keysBetween[0]}</strong> ל<strong>{keysBetween[1]}</strong>.
          </>
        ) : (
          '.'
        )}
      </p>
      <p className="mt-1 text-body-sm text-ink-600">מהיתר ועד מפתח כ-14 חודשים בניהול טוב. בלי פיקוח ראינו גם 24.</p>
    </div>
  );
}
