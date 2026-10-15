import { BUILD_STAGES } from '@/lib/stages';
import { EXTRAS } from '@/lib/planner/content';
import { amountText, isolateRanges, rangeText } from '@/lib/planner/format';
import type { PlannerEstimate } from '@/lib/planner/types';
import { cn } from '@/lib/cn';
import { Money } from './Money';

/**
 * The estimate by the owner's 7 stages: range, share and a bar per stage.
 * Purchase and moving-in sit outside planning + build and say so. Server-safe
 * (used on the result screen, the report and the scenario pages).
 */
export function StageBreakdown({ estimate, compact = false, headingId }: { estimate: PlannerEstimate; compact?: boolean; headingId?: string }) {
  const maxShare = Math.max(1, ...estimate.stages.map((s) => s.sharePct));
  const extraAmount = new Map(estimate.extras.map((e) => [e.id, e.amount]));

  return (
    <ol className="divide-y divide-ink-100" aria-labelledby={headingId}>
      {estimate.stages.map((s) => {
        const stage = BUILD_STAGES.find((b) => b.id === s.id)!;
        const outside = !s.included;
        return (
          <li key={s.id} className={cn('flex gap-3 py-4 sm:gap-4', compact && 'py-3', 'break-inside-avoid')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={stage.icon} alt="" width={40} height={40} className={cn('size-10 shrink-0 rounded-xl bg-sand-50 p-1.5', outside && 'opacity-60')} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h3 className="text-title-sm text-ink-900">
                  <span className="num me-1.5 text-ink-500">{stage.order}.</span>
                  {stage.label}
                </h3>
                {outside ? (
                  <span className="text-sm font-semibold text-ink-500">לא כלול בסכום</span>
                ) : (
                  <Money min={s.min} max={s.max} className="text-body font-bold text-ink-900" unitClassName="text-sm font-semibold text-ink-600" />
                )}
              </div>
              {outside ? (
                <p className="mt-1 text-body-sm text-ink-600">
                  {s.id === 'purchase'
                    ? isolateRanges('מגרש, מס רכישה (5%-6%), עורך דין ותיווך. תלוי במגרש, ולכן לא בהערכה.')
                    : `ריהוט, מכשירי חשמל ווילונות: ${rangeText(estimate.movingIn)}. מתכננים אותו מראש, לא "נסתדר עם הוויזה".`}
                </p>
              ) : (
                <>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary-600" style={{ width: `${(s.sharePct / maxShare) * 100}%` }} />
                    </span>
                    <span className="num w-10 shrink-0 text-end text-sm font-semibold text-ink-700">{s.sharePct}%</span>
                  </div>
                  {!compact && <p className="mt-1.5 text-body-sm text-ink-600">{stage.summary}</p>}
                  {s.extras.length > 0 && (
                    <p className="mt-1 text-sm font-medium text-ink-700">
                      כולל {s.extras.map((id) => `${EXTRAS[id].label} (${amountText(extraAmount.get(id) ?? 0)})`).join(', ')}
                    </p>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
