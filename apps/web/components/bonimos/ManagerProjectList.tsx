import Link from 'next/link';
import { ArrowLeft, BriefcaseBusiness, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/hub/Money';
import { STAGE_IDS } from '@/lib/hub/types';
import { getStage } from '@/lib/stages';
import type { ManagerProjectSummary } from '@/lib/bonimos/types';
import { agoHe } from '@/lib/demo/format';
import { cn } from '@/lib/cn';
import { VariancePctBadge, dateLabel, lateLabel, relativeDayLabel } from './parts';

/**
 * The manager's workspace: one line per assigned project with its stage,
 * budget health, the next milestone and open approvals. Projects that need
 * the manager come first. Server-safe; `hrefFor` lets the demo point the
 * rows at itself.
 */
export function ManagerProjectList({
  projects,
  today,
  now,
  hrefFor = (id) => `/manage/${id}/`,
}: {
  projects: ManagerProjectSummary[];
  today: string;
  now: string;
  hrefFor?: (id: string) => string;
}) {
  if (!projects.length) {
    return (
      <EmptyState
        variant="card"
        icon={<BriefcaseBusiness />}
        title="עוד לא שובצו לכם פרויקטים"
        description="מנהל המערכת משבץ מנהלי פרויקטים ללקוחות הליווי ממסך הניהול. ברגע שתשובצו, הפרויקט יופיע כאן עם התקציב, לוח הזמנים ואישורי התשלום."
      />
    );
  }
  const nowMs = Date.parse(now);
  return (
    <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)] gap-4 border-b border-ink-100 bg-paper px-5 py-2.5 text-caption font-semibold text-ink-600 lg:grid"
      >
        <span>פרויקט</span>
        <span>שלב</span>
        <span>צפי מול תקציב</span>
        <span>אבן הדרך הבאה</span>
        <span>אישורי תשלום</span>
      </div>
      <ul className="divide-y divide-ink-100">
        {projects.map((p) => {
          const stage = p.stage ? getStage(p.stage) : null;
          const needsMe = p.approvals.pendingReview > 0;
          return (
            <li
              key={p.id}
              className={cn(
                'relative grid gap-3 px-4 py-4 transition-colors hover:bg-paper sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)] lg:items-center lg:gap-4',
                needsMe && 'bg-primary-50/40',
              )}
            >
              <div className="min-w-0">
                <h2 className="text-title-sm text-ink-900">
                  <Link href={hrefFor(p.id)} prefetch={false} className="after:absolute after:inset-0 hover:text-primary-700 focus-visible:outline-none">
                    {p.title}
                  </Link>
                </h2>
                <p className="mt-0.5 truncate text-caption text-ink-600">
                  {[p.clientName, p.regionName, p.sizeM2 ? `${p.sizeM2} מ״ר` : null].filter(Boolean).join(' · ')}
                </p>
                {p.lastActivityAt && <p className="text-caption text-ink-500">עדכון אחרון {agoHe((nowMs - Date.parse(p.lastActivityAt)) / 60000)}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:contents">
                <Cell label="שלב">
                  <p className="text-body-sm font-semibold text-ink-900">{stage ? stage.label : 'לא צוין'}</p>
                  <MiniStages current={p.stage} />
                </Cell>
                <Cell label="צפי מול תקציב">
                  <VariancePctBadge pct={p.budget.variancePct} status={p.budget.status} size="sm" />
                  {p.budget.versionNo != null && (
                    <p className="mt-1 text-caption text-ink-600">
                      <Money value={p.budget.forecast} /> מול <Money value={p.budget.approved} />
                    </p>
                  )}
                </Cell>
                <Cell label="אבן הדרך הבאה">
                  {p.nextMilestone ? (
                    <>
                      <p className="line-clamp-1 text-body-sm font-semibold text-ink-900">{p.nextMilestone.title}</p>
                      <p className={cn('text-caption', p.nextMilestone.late ? 'font-semibold text-warning-700' : 'text-ink-600')}>
                        {p.nextMilestone.late && <TriangleAlert aria-hidden="true" className="me-1 inline size-3.5 align-[-2px]" />}
                        {dateLabel(p.nextMilestone.plannedEnd, today)} ·{' '}
                        {p.nextMilestone.late ? lateLabel(-p.nextMilestone.daysLeft) : relativeDayLabel(p.nextMilestone.daysLeft)}
                      </p>
                    </>
                  ) : (
                    <p className="text-caption text-ink-500">אין לוח זמנים</p>
                  )}
                </Cell>
                <Cell label="אישורי תשלום">
                  <div className="flex flex-wrap gap-1">
                    {p.approvals.pendingReview > 0 && (
                      <Badge tone="brand" size="sm">
                        <span className="num">{p.approvals.pendingReview}</span> לבדיקה שלכם
                      </Badge>
                    )}
                    {p.approvals.pendingClient > 0 && (
                      <Badge tone="info" size="sm">
                        <span className="num">{p.approvals.pendingClient}</span> אצל הלקוח
                      </Badge>
                    )}
                    {p.approvals.approvedUnpaid > 0 && (
                      <Badge tone="neutral" size="sm">
                        <span className="num">{p.approvals.approvedUnpaid}</span> לתשלום
                      </Badge>
                    )}
                    {p.approvals.pendingReview + p.approvals.pendingClient + p.approvals.approvedUnpaid === 0 && (
                      <span className="text-caption text-ink-500">אין בקשות פתוחות</span>
                    )}
                  </div>
                </Cell>
              </div>
              <ArrowLeft aria-hidden="true" className="absolute end-4 top-4 size-4 text-ink-400 ltr:rotate-180 lg:hidden" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-2xs font-semibold text-ink-500 lg:sr-only">{label}</p>
      {children}
    </div>
  );
}

function MiniStages({ current }: { current: ManagerProjectSummary['stage'] }) {
  const index = current ? STAGE_IDS.indexOf(current) : -1;
  return (
    <span className="mt-1.5 flex gap-0.5" aria-hidden="true">
      {STAGE_IDS.map((s, i) => (
        <span key={s} className={cn('h-1.5 flex-1 rounded-full', i < index ? 'bg-primary-600' : i === index ? 'bg-primary-400' : 'bg-ink-100')} />
      ))}
    </span>
  );
}
