import { TriangleAlert } from 'lucide-react';
import { absoluteUrl } from '@/lib/site';
import { momentClock, momentHref, selectOverrunWarnings } from '@/lib/planner/warnings';
import type { PlannerEstimate } from '@/lib/planner/types';
import { Badge } from '@/components/ui/Badge';
import MomentPlayer from './MomentPlayer';

/**
 * "פה הכי קל לחרוג": three warnings for these answers, each with the podcast
 * moment that explains it. On screen the moment plays inline; in print it is a
 * link with its time. Server-safe (MomentPlayer is the client leaf).
 */
export function OverrunWarnings({ estimate, print = false }: { estimate: PlannerEstimate; print?: boolean }) {
  const warnings = selectOverrunWarnings(estimate.input);
  return (
    <ol className="grid gap-4 lg:grid-cols-3">
      {warnings.map((w, i) => (
        <li key={w.id} className="flex flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-card break-inside-avoid sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-xl bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-100">
              <TriangleAlert className="size-[1.125rem]" />
            </span>
            <span className="num text-sm font-bold text-ink-500">{i + 1}/3</span>
          </div>
          <h3 className="mt-3 text-title text-ink-900">{w.title}</h3>
          <Badge tone="warning" className="mt-2 h-auto w-fit whitespace-normal py-1 leading-snug">
            {w.impact(estimate)}
          </Badge>
          <p className="mt-3 text-body-sm text-ink-700">{w.body}</p>
          <blockquote className="mt-3 border-s-4 border-primary-600 ps-3 text-body-sm text-ink-800">
            <p>&quot;{w.quote.text}&quot;</p>
            <footer className="mt-1 text-caption text-ink-600">{w.quote.who}</footer>
          </blockquote>
          <p className="mt-3 text-body-sm text-ink-700">
            <strong className="font-bold text-ink-900">מה עושים: </strong>
            {w.tip}
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
