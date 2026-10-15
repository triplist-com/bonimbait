import Link from 'next/link';
import { ArrowRight, CalendarCheck, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ActionResult } from '@/lib/admin/guard';
import { cn } from '@/lib/cn';
import { agoHe } from '@/lib/demo/format';
import { projectHeadline } from '@/lib/project-file/format';
import { BAND_THRESHOLDS } from '@/lib/project-file/score';
import { CONSULT_STAGES, CONSULT_TABS, type ConsultAction, type ConsultStage } from '@/lib/revenue/consult-workflow';
import type { ConsultLeadView } from '@/lib/revenue/consult-view';
import ConsultActions from './ConsultActions';
import ProjectFilePanel from './ProjectFilePanel';
import ScoreBadge from './ScoreBadge';

export type QueueHref = (q: { tab?: ConsultStage; lead?: string | null }) => string;

function standout(lead: ConsultLeadView): string | null {
  const reasons = lead.score?.reasons ?? [];
  return (reasons.find((r) => r.code === 'pro_questions') ?? reasons.find((r) => r.group === 'intent'))?.label ?? null;
}

function QueueItem({ lead, href, active }: { lead: ConsultLeadView; href: string; active: boolean }) {
  const headline = projectHeadline(lead.file);
  const tag = standout(lead);
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex gap-3 rounded-2xl border bg-white p-3.5 transition-[border-color,box-shadow] hover:border-ink-300 hover:shadow-card',
          active ? 'border-primary-600 ring-1 ring-primary-600' : 'border-ink-100',
        )}
      >
        <ScoreBadge score={lead.score?.score ?? null} band={lead.score?.band ?? null} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-bold text-ink-900">{lead.name}</span>
            <span className="shrink-0 text-caption text-ink-500">{agoHe(lead.minutesAgo)}</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-ink-600">{headline || 'עוד אין פרטים על הפרויקט'}</span>
          {(tag || lead.bookedAt) && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {tag && (
                <Badge tone="brand" size="sm">
                  {tag}
                </Badge>
              )}
              {lead.bookedAt && (
                <Badge tone="info" size="sm" icon={<CalendarCheck />}>
                  נקבעה פגישה
                </Badge>
              )}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/**
 * "תור הייעוצים": consultation leads by score, a tab per stage, and the
 * selected lead's project file. Server-safe and data-driven, so the admin
 * page (live) and /platform/demo/consult-queue/ (fixtures) share it.
 */
export default function ConsultQueue({
  tab,
  counts,
  items,
  selected,
  now,
  hrefFor,
  focus,
  action,
  fullRecordHref,
}: {
  tab: ConsultStage;
  counts: Record<ConsultStage, number>;
  items: ConsultLeadView[];
  selected: ConsultLeadView | null;
  /** ISO time the data was loaded. */
  now: string;
  hrefFor: QueueHref;
  /** A lead was picked explicitly: on phones show its panel instead of the list. */
  focus: boolean;
  /** Server action for the quick actions; omitted in the demo. */
  action?: (id: string, a: ConsultAction) => Promise<ActionResult>;
  fullRecordHref?: (id: string) => string;
}) {
  const hot = items.filter((i) => (i.score?.score ?? 0) >= BAND_THRESHOLDS.hot).length;

  return (
    <div className="space-y-5">
      <nav aria-label="שלבים בתור" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {CONSULT_TABS.map((t) => (
          <Link
            key={t}
            href={hrefFor({ tab: t })}
            aria-current={t === tab ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors',
              t === tab ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-300',
            )}
          >
            {CONSULT_STAGES[t].label}
            <span className={cn('num rounded-full px-1.5 text-xs', t === tab ? 'bg-white/20' : 'bg-ink-100 text-ink-600')}>{counts[t] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
        <section aria-label="הפניות בתור" className={cn(focus && 'hidden lg:block')}>
          <p className="mb-3 text-sm text-ink-600">
            {items.length === 0 ? 'אין פניות בשלב הזה.' : (
              <>
                <span className="num font-semibold text-ink-900">{items.length}</span> פניות, מהציון הגבוה לנמוך
                {hot > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold text-primary-700">
                      <span className="num">{hot}</span> חמות
                    </span>
                  </>
                )}
              </>
            )}
          </p>
          {items.length === 0 ? (
            <EmptyState icon={<Inbox />} title="התור ריק" description="פניות חדשות לייעוץ יופיעו כאן לפי הציון שלהן." />
          ) : (
            <ol className="space-y-2.5">
              {items.map((lead) => (
                <QueueItem key={lead.id} lead={lead} href={hrefFor({ tab, lead: lead.id })} active={selected?.id === lead.id} />
              ))}
            </ol>
          )}
        </section>

        <section aria-label="תיק הפרויקט" className={cn(!focus && 'hidden lg:block')}>
          {focus && (
            <Link href={hrefFor({ tab })} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 lg:hidden">
              <ArrowRight aria-hidden="true" className="size-4 ltr:rotate-180" />
              חזרה לתור
            </Link>
          )}
          {selected ? (
            <div className="lg:sticky lg:top-6">
              <ProjectFilePanel
                lead={selected}
                now={now}
                fullRecordHref={fullRecordHref ? fullRecordHref(selected.id) : null}
                actions={<ConsultActions key={selected.id} leadId={selected.id} stage={selected.stage} action={action} />}
              />
            </div>
          ) : (
            <EmptyState title="בחרו פנייה מהתור" description="התיק המלא יופיע כאן: השלב, האזור, התקציב, מה שאלו ולמה הציון." />
          )}
        </section>
      </div>
    </div>
  );
}
