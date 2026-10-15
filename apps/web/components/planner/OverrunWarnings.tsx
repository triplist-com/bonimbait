import { TriangleAlert } from 'lucide-react';
import { absoluteUrl } from '@/lib/site';
import { isolateRanges } from '@/lib/planner/format';
import { momentClock, momentHref, selectOverrunWarnings } from '@/lib/planner/warnings';
import type { PlannerEstimate } from '@/lib/planner/types';
import MomentPlayer from './MomentPlayer';

/**
 * "פה הכי קל לחרוג": three warnings for these answers, each with the podcast
 * moment that explains it. On screen the moment plays inline; in print it is a
 * link with its time. Server-safe (MomentPlayer is the client leaf).
 */
export function OverrunWarnings({ estimate, print = false, stacked = false }: { estimate: PlannerEstimate; print?: boolean; stacked?: boolean }) {
  const warnings = selectOverrunWarnings(estimate.input);
  return (
    <ol className={print || stacked ? 'grid gap-3' : 'grid gap-4 lg:grid-cols-3'}>
      {warnings.map((w, i) => (
        <li key={w.id} className="flex flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-card break-inside-avoid sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-xl bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-100">
              <TriangleAlert className="size-[1.125rem]" />
            </span>
            <span className="num text-sm font-bold text-ink-500">{i + 1}/3</span>
          </div>
          <h3 className="mt-3 text-title text-ink-900">{w.title}</h3>
          {/* Not <Badge>: it is nowrap, and this line can be long (cn() does not merge classes). */}
          <p className="mt-2 w-fit rounded-xl bg-warning-50 px-2.5 py-1 text-xs font-semibold leading-snug text-warning-700 ring-1 ring-inset ring-warning-100">
            {isolateRanges(w.impact(estimate))}
          </p>
          <p className="mt-3 text-body-sm text-ink-700">{isolateRanges(w.body)}</p>
          <blockquote className="mt-3 border-s-4 border-primary-600 ps-3 text-body-sm text-ink-800">
            <p>&quot;{isolateRanges(w.quote.text)}&quot;</p>
            <footer className="mt-1 text-caption text-ink-600">{w.quote.who}</footer>
          </blockquote>
          <p className="mt-3 text-body-sm text-ink-700">
            <strong className="font-bold text-ink-900">מה עושים: </strong>
            {isolateRanges(w.tip)}
          </p>
          <div className="mt-auto">
            {print ? (
              <p className="mt-3 text-xs text-ink-600">
                {w.moment.episode} בפודקאסט, מדקה <span className="num">{momentClock(w.moment.start)}</span>:{' '}
                <span dir="ltr" className="break-all">
                  {absoluteUrl(momentHref(w.moment))}
                </span>
              </p>
            ) : (
              <MomentPlayer moment={w.moment} title={`${w.title}: ${w.moment.label}`} />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
