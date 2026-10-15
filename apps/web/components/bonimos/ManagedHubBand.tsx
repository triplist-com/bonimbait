import { ArrowLeft, BellRing } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import type { ManagedHubSummary } from '@/lib/bonimos/types';
import { PersonCard, VariancePctBadge, dateLabel, lateLabel, relativeDayLabel } from './parts';

/**
 * The managed client's own hub (/my-home/) gains one band: who manages the
 * build, the live numbers, and the way into the full project file in
 * Bonim.Os. Everything else in the hub stays as it was. Server-safe.
 */
export function ManagedHubBand({ summary, today }: { summary: ManagedHubSummary; today: string }) {
  const href = `/manage/${summary.projectId}/`;
  const next = summary.nextMilestone;
  return (
    <section aria-labelledby="bonimos-band-heading" className="mb-5 overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card lg:mb-6">
      <div className="grid gap-5 border-s-4 border-primary-600 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="eyebrow">
              <span dir="ltr">Bonim.Os</span> · ליווי מלא עד המפתח
            </p>
            <h2 id="bonimos-band-heading" className="mt-1 text-title-lg text-ink-900">
              הפרויקט שלכם בליווי בונים בית
            </h2>
          </div>
          {summary.managers.length ? (
            summary.managers.map((m) => <PersonCard key={m.userId} person={m} roleLabel={`${m.title ?? 'מנהל/ת הפרויקט'} שלכם`} />)
          ) : (
            <p className="text-body-sm text-ink-600">מנהל הפרויקט שלכם ישובץ בימים הקרובים.</p>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-2xl bg-paper p-3 ring-1 ring-inset ring-ink-100">
            <dt className="text-caption font-semibold text-ink-600">צפי מול תקציב</dt>
            <dd className="mt-1">
              {summary.budget ? <VariancePctBadge pct={summary.budget.variancePct} status={summary.budget.status} size="sm" /> : <span className="text-body-sm text-ink-600">עוד לא אושר</span>}
            </dd>
          </div>
          <div className="rounded-2xl bg-paper p-3 ring-1 ring-inset ring-ink-100">
            <dt className="text-caption font-semibold text-ink-600">אבן הדרך הבאה</dt>
            <dd className="mt-0.5 line-clamp-1 text-body-sm font-semibold text-ink-900">{next ? next.title : 'עוד אין לוח זמנים'}</dd>
            {next && (
              <dd className={next.late ? 'text-caption font-semibold text-warning-700' : 'text-caption text-ink-600'}>
                {dateLabel(next.plannedEnd, today)} · {next.late ? lateLabel(-next.daysLeft) : relativeDayLabel(next.daysLeft)}
              </dd>
            )}
          </div>
          <div className={summary.waitingForYou ? 'rounded-2xl bg-primary-50 p-3 ring-1 ring-inset ring-primary-100' : 'rounded-2xl bg-paper p-3 ring-1 ring-inset ring-ink-100'}>
            <dt className="text-caption font-semibold text-ink-600">מחכה לאישור שלכם</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-body-sm font-semibold text-ink-900">
              {summary.waitingForYou > 0 && <BellRing aria-hidden="true" className="size-4 text-primary-600" />}
              {summary.waitingForYou === 0 ? 'אין כרגע' : summary.waitingForYou === 1 ? 'תשלום אחד' : `${summary.waitingForYou} תשלומים`}
            </dd>
            {summary.photosThisWeek > 0 && (
              <dd className="text-caption text-ink-600">
                {summary.photosThisWeek === 1 ? 'תמונה חדשה' : `${summary.photosThisWeek} תמונות חדשות`} מהשטח השבוע
              </dd>
            )}
          </div>
        </dl>

        <ButtonLink href={href} size="lg" iconEnd={<ArrowLeft className="ltr:rotate-180" />} prefetch={false} className="w-full lg:w-auto">
          לתיק הניהול
        </ButtonLink>
      </div>
    </section>
  );
}
