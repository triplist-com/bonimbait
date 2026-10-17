import { ArrowLeft, Route } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatCount, formatShare } from '@/lib/command/format';
import type { CommandCenterData } from '@/lib/command/types';
import { DeltaText } from './Tile';

/**
 * "המסע של הבונים": one number per pillar for the period, in the order a
 * builder meets them: a question to the advisor, a first budget, a personal
 * roadmap in "הבית שלי", a consult request with the project file, a booked
 * meeting. Plus the hub's member projects and the stages they're in (its
 * staff aggregates). Server-safe.
 */
export default function JourneyStrip({ journey, vs }: { journey: CommandCenterData['journey']; vs: string }) {
  const { steps, hub } = journey;
  return (
    <Card as="section" padding="none" aria-labelledby="journey-title" className="min-w-0 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="journey-title" className="flex items-center gap-2 text-title text-ink-900">
          <Route className="size-5 text-primary-600" aria-hidden="true" />
          המסע של הבונים
        </h2>
        <p className="text-sm text-ink-600">מהשאלה הראשונה ועד הפגישה, בתקופה</p>
      </header>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.id} className="relative min-w-0">
            <p className="text-caption font-semibold text-ink-500">{s.source}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <bdi dir="ltr" className="text-headline-sm font-extrabold tabular-nums text-ink-900">
                {formatCount(s.value.current)}
              </bdi>
              {i < steps.length - 1 && <ArrowLeft className="hidden size-4 shrink-0 text-ink-300 lg:inline ltr:rotate-180" aria-hidden="true" />}
            </p>
            <p className="text-sm font-medium text-ink-800">{s.label}</p>
            <DeltaText delta={s.value} label={vs} className="mt-0.5" />
          </li>
        ))}
      </ol>
      {hub && (
        <p className="mt-5 border-t border-ink-100 pt-3 text-sm text-ink-600">
          בבית שלי: <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(hub.joined.current)}</bdi> פרויקטים חדשים עם חשבון בתקופה, מתוך{' '}
          <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(hub.projects)}</bdi>
          {hub.topStages.length > 0 && (
            <>
              {' '}
              · השלבים המובילים:{' '}
              {hub.topStages.map((s, i) => (
                <span key={s.stage}>
                  {i > 0 && ', '}
                  {s.label} (<bdi dir="ltr">{formatShare(s.share)}</bdi>)
                </span>
              ))}
            </>
          )}
        </p>
      )}
    </Card>
  );
}
