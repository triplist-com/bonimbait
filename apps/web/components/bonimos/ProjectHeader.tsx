import Link from 'next/link';
import { ArrowLeft, BellRing, CalendarDays, Coins, Flag, MapPin, Milestone, Ruler, Wallet } from 'lucide-react';
import { Money, Variance } from '@/components/hub/Money';
import { StageTrack } from '@/components/hub/StageTrack';
import { daysBetween, monthLabel } from '@/lib/hub/format';
import { getStage } from '@/lib/stages';
import { approvalCounts } from '@/lib/bonimos/approvals';
import { projectBudget } from '@/lib/bonimos/budget';
import { milestoneStatus, nextMilestone, slipDays } from '@/lib/bonimos/milestones';
import type { ManagedProjectData } from '@/lib/bonimos/types';
import { cn } from '@/lib/cn';
import { KpiTile, PersonCard, VariancePctBadge, dateLabel, lateLabel, relativeDayLabel } from './parts';

/**
 * The top of the managed project view: what the project is, who is on it,
 * and four numbers (approved budget, forecast vs budget, paid so far, the
 * next milestone), plus whose turn it is. Server-safe.
 */
export function ProjectHeader({ data, backHref, backLabel }: { data: ManagedProjectData; backHref?: string | null; backLabel?: string }) {
  const { project, viewer, today } = data;
  const stage = project.stage ? getStage(project.stage) : null;
  const { version, health } = projectBudget(data.versions, data.budgetItems);
  const next = nextMilestone(data.milestones);
  const counts = approvalCounts(data.payments);
  const managers = data.people.filter((p) => p.role === 'manager');
  const client = data.people.find((p) => p.role === 'owner');
  const isManager = viewer.role === 'manager';
  const myTurn = isManager ? counts.pendingReview : counts.pendingClient;

  return (
    <header className="relative isolate overflow-hidden border-b border-sand-200 bg-sand-50">
      <div aria-hidden="true" className="bg-blueprint mask-fade-b absolute inset-0 -z-10" />
      <div className="container-page pb-7 pt-5 sm:pb-9 sm:pt-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">
            <span dir="ltr">Bonim.Os</span> · ליווי מלא עד המפתח
          </p>
          {backHref && (
            <Link
              href={backHref}
              prefetch={false}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-700 hover:bg-white hover:text-ink-900"
            >
              {backLabel ?? 'חזרה'}
              <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
            </Link>
          )}
        </div>
        <h1 className="mt-1.5 text-headline text-ink-900">{project.title}</h1>

        <ul aria-label="פרטי הפרויקט" className="mt-3 flex flex-wrap gap-2">
          {project.regionName && <Fact icon={<MapPin />}>{project.regionName}</Fact>}
          {project.sizeM2 && (
            <Fact icon={<Ruler />}>
              <span className="num">{project.sizeM2}</span> מ״ר
            </Fact>
          )}
          {stage && (
            <Fact icon={<Flag />}>
              שלב <span className="num">{stage.order}</span> מתוך <span className="num">7</span>: {stage.label}
            </Fact>
          )}
          {project.targetMoveIn && <Fact icon={<CalendarDays />}>כניסה מתוכננת: {monthLabel(project.targetMoveIn)}</Fact>}
        </ul>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <dl className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
              <KpiTile
                label="התקציב המאושר"
                icon={<Wallet />}
                hint={
                  version ? (
                    <>
                      גרסה <span className="num">{version.versionNo}</span> · {dateLabel(version.createdAt.slice(0, 10), today)}
                    </>
                  ) : (
                    'עוד לא אושר תקציב'
                  )
                }
              >
                {version ? <Money value={health.approved} /> : '—'}
              </KpiTile>
              <KpiTile
                label="צפי מול התקציב"
                icon={<Coins />}
                hint={
                  health.status === 'none' ? (
                    'יתעדכן עם ההצעות והתשלומים'
                  ) : (
                    <>
                      צפי סופי <Money value={health.forecast} /> (<Variance value={health.variance} />)
                    </>
                  )
                }
              >
                <VariancePctBadge pct={health.variancePct} status={health.status} />
              </KpiTile>
              <KpiTile
                label="שולם עד היום"
                icon={<Coins />}
                hint={
                  health.approved > 0 ? (
                    <>
                      <span className="num">{Math.round(health.paidShare * 100)}%</span> מהתקציב
                    </>
                  ) : undefined
                }
              >
                <Money value={health.actual} />
              </KpiTile>
              <KpiTile
                label="אבן הדרך הבאה"
                icon={<Milestone />}
                hint={next ? <NextHint plannedEnd={next.plannedEnd} today={today} late={milestoneStatus(next, today) === 'late'} slip={slipDays(next, today)} /> : undefined}
              >
                <span className="line-clamp-2 text-title">{next ? next.title : 'לוח הזמנים עוד ריק'}</span>
              </KpiTile>
            </dl>
            {stage && (
              <div className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-inset ring-ink-100">
                <StageTrack current={project.stage} />
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-2.5" aria-label="הצוות בפרויקט">
            {isManager && client && <PersonCard person={client} roleLabel="הלקוח" />}
            {managers.map((m) => (
              <PersonCard key={m.userId} person={m} roleLabel={isManager && m.userId === viewer.userId ? `${m.title ?? 'מנהל/ת הפרויקט'} (אתם)` : undefined} />
            ))}
            {!managers.length && (
              <p className="rounded-2xl bg-white p-3 text-body-sm text-ink-600 ring-1 ring-inset ring-ink-100">מנהל הפרויקט ישובץ בקרוב.</p>
            )}
          </div>
        </div>

        {myTurn > 0 && (
          <a
            href="#payments"
            className={cn(
              'mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-body-sm font-semibold shadow-xs transition-colors',
              'bg-primary-600 text-white hover:bg-primary-700',
            )}
          >
            <span className="flex items-center gap-2.5">
              <BellRing aria-hidden="true" className="size-5 shrink-0" />
              {isManager
                ? myTurn === 1
                  ? 'בקשת תשלום אחת מחכה לבדיקה שלכם'
                  : `${myTurn} בקשות תשלום מחכות לבדיקה שלכם`
                : myTurn === 1
                  ? 'תשלום אחד מחכה לאישור שלכם'
                  : `${myTurn} תשלומים מחכים לאישור שלכם`}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              לאישורי התשלום
              <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
            </span>
          </a>
        )}
      </div>
    </header>
  );
}

function NextHint({ plannedEnd, today, late, slip }: { plannedEnd: string; today: string; late: boolean; slip: number }) {
  if (late) {
    return (
      <span className="font-semibold text-warning-700">
        {dateLabel(plannedEnd, today)} · {lateLabel(slip)}
      </span>
    );
  }
  return (
    <>
      {dateLabel(plannedEnd, today)} · {relativeDayLabel(daysBetween(today, plannedEnd))}
    </>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-body-sm text-ink-800 shadow-xs ring-1 ring-inset ring-ink-100 [&_svg]:size-4 [&_svg]:text-primary-600">
      <span aria-hidden="true" className="contents">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}
