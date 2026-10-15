import { CalendarRange, ChevronDown, CircleCheck, Clock, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { HEBREW_MONTHS } from '@/lib/hub/format';
import { getStage } from '@/lib/stages';
import {
  barPosition,
  groupByStage,
  milestoneStatus,
  scheduleSummary,
  slipDays,
  timelineRange,
  type MilestoneStatus,
  type StageGroup,
  type TimelineRange,
} from '@/lib/bonimos/milestones';
import type { ManagedProjectData, MilestoneView } from '@/lib/bonimos/types';
import { cn } from '@/lib/cn';
import { AddMilestoneButton, CreateScheduleButton, MilestoneRowControls } from './MilestoneControls';
import { OsSection, dateLabel, lateLabel } from './parts';

const STATUS: Record<MilestoneStatus, { label: string; tone: 'success' | 'brand' | 'warning' | 'info' | 'neutral' }> = {
  done: { label: 'הושלם', tone: 'success' },
  in_progress: { label: 'בביצוע', tone: 'brand' },
  late: { label: 'באיחור', tone: 'warning' },
  due_soon: { label: 'מתחיל בקרוב', tone: 'info' },
  upcoming: { label: 'מתוכנן', tone: 'neutral' },
};

const GRID = 'md:grid-cols-[14rem_minmax(0,1fr)]';

/** "ינו׳ 27" in January, "אוק׳" otherwise (three letters; מרץ and מאי are whole). */
function monthShort(month: string): string {
  const m = Number(month.slice(5, 7));
  const name = HEBREW_MONTHS[m - 1] ?? '';
  const short = name.length > 3 ? `${name.slice(0, 3)}׳` : name;
  return m === 1 ? `${short} ${month.slice(2, 4)}` : short;
}

/** "19.7–19.8" (day.month, the way dates are written on site). */
function shortRange(from: string, to: string): string {
  const d = (x: string) => `${Number(x.slice(8, 10))}.${Number(x.slice(5, 7))}`;
  return from === to ? d(from) : `${d(from)}–${d(to)}`;
}

function longRange(from: string, to: string, today: string): string {
  return from === to ? dateLabel(from, today) : `${dateLabel(from, today)} עד ${dateLabel(to, today)}`;
}

/**
 * לוח זמנים: milestones by stage, planned (light bar) against actual (solid
 * bar), with today's line. Time runs from the start side (right in RTL).
 * Finished stages fold into one line. Below md the bars give way to dates in
 * words. Server-safe.
 */
export function MilestonesSection({ data }: { data: ManagedProjectData }) {
  const { today } = data;
  const isManager = data.viewer.role === 'manager';
  const groups = groupByStage(data.milestones);
  const summary = scheduleSummary(data.milestones, today);

  if (!data.milestones.length) {
    return (
      <OsSection id="schedule" icon={<CalendarRange />} title="לוח זמנים" subtitle="אבני הדרך של הפרויקט, מתוכנן מול בפועל.">
        <EmptyState
          icon={<CalendarRange />}
          title="עוד אין לוח זמנים"
          description={
            isManager
              ? 'בנו לוח זמנים ראשוני מהשלב הנוכחי ועד המפתח, לפי משכי השלבים במחירון בונים בית. אחר כך מזיזים תאריכים לפי החוזים בפועל.'
              : 'מנהל הפרויקט יבנה כאן את לוח הזמנים, ותראו בכל רגע מה מתוכנן, מה הושלם ומה מתעכב.'
          }
          actions={
            isManager ? (
              <>
                <CreateScheduleButton />
                <AddMilestoneButton milestones={data.milestones} defaultStage={data.project.stage} today={today} variant="ghost" />
              </>
            ) : undefined
          }
        />
      </OsSection>
    );
  }

  const range = timelineRange(data.milestones, today);

  return (
    <OsSection
      id="schedule"
      icon={<CalendarRange />}
      title="לוח זמנים"
      subtitle={
        <>
          <span className="num">{summary.done}</span> מתוך <span className="num">{summary.total}</span> אבני דרך הושלמו
          {summary.late > 0 && (
            <>
              {' '}
              · <span className="font-semibold text-warning-700">{summary.late === 1 ? 'אחת באיחור' : `${summary.late} באיחור`}</span>
            </>
          )}
          {summary.onTimeShare != null && (
            <>
              {' '}
              · <span className="num">{Math.round(summary.onTimeShare * 100)}%</span> הושלמו בזמן
            </>
          )}
        </>
      }
      action={isManager ? <AddMilestoneButton milestones={data.milestones} defaultStage={data.project.stage} today={today} /> : undefined}
    >
      <div className="hidden md:block">
        <MonthAxis range={range} />
      </div>
      <ol className="space-y-2">
        {groups.map((g) => (
          <StageBlock key={g.stage} group={g} range={range} today={today} isManager={isManager} />
        ))}
      </ol>
      <p className="mt-4 hidden items-center gap-4 text-caption text-ink-600 md:flex" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-full bg-ink-100 ring-1 ring-inset ring-ink-300" /> מתוכנן
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-full bg-ink-800" /> בוצע
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-full bg-primary-600" /> בביצוע
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-primary-600" /> היום
        </span>
      </p>
    </OsSection>
  );
}

function StageBlock({ group: g, range, today, isManager }: { group: StageGroup; range: TimelineRange; today: string; isManager: boolean }) {
  const stage = getStage(g.stage);
  const finished = g.done === g.milestones.length;
  const span = barPosition(range, g.plannedStart, g.plannedEnd);
  const actual = g.actualStart ? barPosition(range, g.actualStart, g.actualEnd ?? today, 0.8) : null;
  return (
    <li>
      <details open={!finished} className="group/stage">
        <summary
          className={cn(
            'grid cursor-pointer list-none items-center gap-2 rounded-xl py-2 hover:bg-paper md:gap-4 [&::-webkit-details-marker]:hidden',
            GRID,
          )}
        >
          <span className="flex items-center gap-2 text-body-sm font-bold text-ink-900">
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-500 transition-transform group-open/stage:rotate-180" />
            {stage?.label ?? g.stage}
            <span className="text-caption font-normal text-ink-500">
              <span className="num">
                {g.done}/{g.milestones.length}
              </span>{' '}
              הושלמו
            </span>
            {finished && (
              <>
                <CircleCheck aria-hidden="true" className="size-4 text-success-600" />
                <span className="sr-only">השלב הושלם</span>
              </>
            )}
          </span>
          <span aria-hidden="true" className="relative hidden h-3 md:block">
            <Gridlines range={range} />
            <span className="absolute inset-y-0.5 rounded-full bg-ink-100 ring-1 ring-inset ring-ink-200" style={{ insetInlineStart: `${span.startPct}%`, width: `${span.widthPct}%` }} />
            {actual && (
              <span
                className={cn('absolute inset-y-1 rounded-full', g.actualEnd ? 'bg-ink-800' : 'bg-primary-600')}
                style={{ insetInlineStart: `${actual.startPct}%`, width: `${actual.widthPct}%` }}
              />
            )}
          </span>
        </summary>
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {g.milestones.map((m) => (
            <MilestoneRow key={m.id} m={m} range={range} today={today} isManager={isManager} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function MonthAxis({ range }: { range: TimelineRange }) {
  const stride = range.months.length > 20 ? 3 : range.months.length > 10 ? 2 : 1;
  return (
    <div aria-hidden="true" className={cn('mb-1 grid gap-4', GRID)}>
      <span />
      <div className="relative h-9 text-2xs text-ink-500">
        {range.todayPct != null && (
          <span
            className="absolute top-0 -translate-x-1/2 rounded-full bg-primary-600 px-1.5 font-bold leading-4 text-white rtl:translate-x-1/2"
            style={{ insetInlineStart: `${range.todayPct}%` }}
          >
            היום
          </span>
        )}
        {range.months.map((mo, i) =>
          i % stride === 0 ? (
            <span
              key={mo.month}
              className="absolute bottom-0 whitespace-nowrap border-s border-ink-200 ps-1 leading-4"
              style={{ insetInlineStart: `${mo.startPct}%` }}
            >
              {monthShort(mo.month)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Gridlines({ range }: { range: TimelineRange }) {
  return (
    <>
      {range.months.map((mo) => (
        <span key={mo.month} className="absolute -inset-y-2 w-px bg-ink-100" style={{ insetInlineStart: `${mo.startPct}%` }} />
      ))}
      {range.todayPct != null && <span className="absolute -inset-y-2.5 z-10 w-0.5 bg-primary-600" style={{ insetInlineStart: `${range.todayPct}%` }} />}
    </>
  );
}

function MilestoneRow({ m, range, today, isManager }: { m: MilestoneView; range: TimelineRange; today: string; isManager: boolean }) {
  const status = milestoneStatus(m, today);
  const slip = slipDays(m, today);
  const planned = barPosition(range, m.plannedStart, m.plannedEnd);
  const actualTo = m.actualEnd ?? (m.actualStart ? today : null);
  const actual = m.actualStart && actualTo && actualTo >= m.actualStart ? barPosition(range, m.actualStart, actualTo, 0.8) : null;
  const meta = STATUS[status];
  const lateText =
    m.actualEnd ? (slip > 0 ? lateLabel(slip) : slip < 0 ? 'לפני הזמן' : 'בזמן') : status === 'late' ? lateLabel(slip) : null;

  return (
    <li className={cn('grid items-center gap-x-4 gap-y-1 py-2', GRID)}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-sm font-semibold text-ink-900">
            <span className="min-w-0">{m.title}</span>
            <Badge size="sm" tone={meta.tone} icon={status === 'done' ? <CircleCheck /> : status === 'late' ? <TriangleAlert /> : status === 'in_progress' ? <Clock /> : undefined}>
              {meta.label}
            </Badge>
          </p>
          <p className="mt-0.5 text-caption text-ink-600">
            {m.actualEnd ? 'בוצע ' : 'מתוכנן '}
            <span className="md:hidden">{m.actualEnd ? longRange(m.actualStart ?? m.actualEnd, m.actualEnd, today) : longRange(m.plannedStart, m.plannedEnd, today)}</span>
            <span className="num hidden md:inline">{m.actualEnd ? shortRange(m.actualStart ?? m.actualEnd, m.actualEnd) : shortRange(m.plannedStart, m.plannedEnd)}</span>
            {!m.actualEnd && m.actualStart && (
              <>
                {' '}
                · התחיל <span className="md:hidden">{dateLabel(m.actualStart, today)}</span>
                <span className="num hidden md:inline">{shortRange(m.actualStart, m.actualStart)}</span>
              </>
            )}
            {lateText && <span className={cn((slip > 0 || status === 'late') && 'font-semibold text-warning-700')}> · {lateText}</span>}
          </p>
          {m.note && <p className="mt-0.5 text-caption text-ink-500">{m.note}</p>}
        </div>
        {isManager && <MilestoneRowControls milestone={m} today={today} />}
      </div>
      <div aria-hidden="true" className="relative hidden h-5 md:block">
        <Gridlines range={range} />
        <span
          className={cn('absolute inset-y-0.5 rounded-full bg-ink-100 ring-1 ring-inset', status === 'late' ? 'ring-warning-500' : 'ring-ink-300')}
          style={{ insetInlineStart: `${planned.startPct}%`, width: `${planned.widthPct}%` }}
        />
        {actual && (
          <span
            className={cn('absolute inset-y-1.5 rounded-full', m.actualEnd ? 'bg-ink-800' : 'bg-primary-600')}
            style={{ insetInlineStart: `${actual.startPct}%`, width: `${actual.widthPct}%` }}
          />
        )}
      </div>
    </li>
  );
}
