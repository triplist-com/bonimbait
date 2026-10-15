import Link from 'next/link';
import { ArrowLeft, Check, ChevronDown, Lightbulb, MessageCircleQuestion, Route } from 'lucide-react';
import { ChipLink } from '@/components/ui/Chip';
import { Progress } from '@/components/ui/Steps';
import { aiHref } from '@/lib/nav';
import { BUILD_STAGES } from '@/lib/stages';
import { stageBudgetShare } from '@/lib/hub/budget';
import { STAGE_CONTENT, durationLabel } from '@/lib/hub/content';
import { checklistProgress, stageStatus } from '@/lib/hub/roadmap';
import type { HubViewData, StageId } from '@/lib/hub/types';
import { cn } from '@/lib/cn';
import { ChecklistToggle } from './ChecklistToggle';
import { HubSection } from './parts';
import { StagePicksList } from './StagePicksList';

/** "3 מתוך 9 צעדים", or "עברתם את השלב" for a passed stage nobody ticked. */
function StageProgressNote({ status, done, total }: { status: 'done' | 'current' | 'upcoming'; done: number; total: number }) {
  if (status === 'done' && done === 0) return <>עברתם את השלב</>;
  if (status === 'upcoming' && done === 0) return <><span className="num">{total}</span> צעדים</>;
  return (
    <>
      <span className="num">{done}</span> מתוך <span className="num">{total}</span> צעדים
    </>
  );
}

/** Share-of-budget label for a stage: "כ-31% מהתקציב", or the land note. */
export function shareLabel(stage: StageId): string {
  const share = stageBudgetShare(stage);
  return share > 0 ? `כ-${share}% מהתקציב` : 'מחוץ לתקציב הבנייה';
}

/**
 * The personal roadmap: the owner's 7 stages, with the family's own stage
 * open. Each stage: what happens, typical duration and share of the budget,
 * the pitfall, its checklist, the top videos and guides, and questions for
 * the advisor. Native <details>, so it works before hydration.
 */
export function Roadmap({ data, stagePageBase = '/my-home/stage/' }: { data: HubViewData; stagePageBase?: string | null }) {
  const current = data.project.stage;
  const done = new Set(data.checklistDone);

  return (
    <HubSection
      id="roadmap"
      icon={<Route />}
      title="מפת הדרך שלכם"
      subtitle="שבעה שלבים מהמגרש ועד המפתח. לכל שלב: מה קורה, כמה זמן, כמה מהתקציב ומה בודקים."
    >
      <ol className="space-y-2.5">
        {BUILD_STAGES.map((stage) => {
          const status = stageStatus(stage.id, current);
          const content = STAGE_CONTENT[stage.id];
          const progress = checklistProgress(stage.id, done);
          return (
            <li key={stage.id}>
              <details
                open={status === 'current' || undefined}
                className={cn(
                  'group/stage rounded-2xl border bg-white transition-shadow open:shadow-card',
                  status === 'current' ? 'border-primary-200 ring-1 ring-primary-100' : 'border-ink-100',
                )}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3 sm:gap-4 sm:p-4 [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                      status === 'done' && 'bg-primary-600 text-white',
                      status === 'current' && 'bg-white text-primary-700 ring-2 ring-primary-600',
                      status === 'upcoming' && 'bg-ink-50 text-ink-500 ring-1 ring-ink-200',
                    )}
                  >
                    {status === 'done' ? <Check className="size-4" /> : <span className="num">{stage.order}</span>}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stage.icon} alt="" width={48} height={42} className="hidden h-8 w-auto shrink-0 sm:block" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-title-sm text-ink-900">{stage.title}</span>
                      {status === 'current' && <span className="text-caption font-bold text-primary-700">אתם כאן</span>}
                    </span>
                    <span className="mt-0.5 block text-caption text-ink-600">
                      {durationLabel(stage.id)} · {shareLabel(stage.id)} · <StageProgressNote status={status} done={progress.done} total={progress.total} />
                    </span>
                  </span>
                  <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-ink-500 transition-transform group-open/stage:rotate-180" />
                  <span className="sr-only">{status === 'done' ? 'הושלם' : status === 'current' ? 'השלב הנוכחי' : 'בהמשך'}</span>
                </summary>

                <div className="space-y-5 border-t border-ink-100 px-3 pb-4 pt-4 sm:px-4">
                  <p className="text-body-sm text-ink-800">{content.whatHappens}</p>
                  <p className="flex items-start gap-2.5 rounded-xl bg-warning-50 p-3 text-body-sm text-warning-800">
                    <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-700" />
                    <span>
                      <strong className="font-bold">פה הכי קל לטעות: </strong>
                      {content.watchOut}
                    </span>
                  </p>
                  <div>
                    <Progress
                      value={progress.done}
                      max={progress.total}
                      label="הצ׳קליסט של השלב"
                      showValue
                      size="sm"
                      className="mb-3"
                    />
                    <ul className="space-y-3">
                      {content.checklist.map((item) => (
                        <li key={item.id}>
                          <ChecklistToggle
                            itemId={item.id}
                            stage={stage.id}
                            checked={done.has(item.id)}
                            title={item.title}
                            description={
                              <>
                                {item.why}
                                {item.link && (
                                  <>
                                    {' '}
                                    <Link href={item.link.href} prefetch={false} className="font-semibold text-primary-700 hover:underline">
                                      {item.link.label}
                                    </Link>
                                  </>
                                )}
                              </>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <StagePicksList picks={data.picks[stage.id]} />
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-caption font-bold text-ink-800">
                      <MessageCircleQuestion aria-hidden="true" className="size-4 text-primary-600" />
                      שאלו על השלב הזה
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {content.questions.map((q) => (
                        <li key={q}>
                          <ChipLink href={aiHref(q)} size="sm" prefetch={false}>
                            {q}
                          </ChipLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {stagePageBase && (
                    <Link
                      href={`${stagePageBase}${stage.id}/`}
                      prefetch={false}
                      className="inline-flex items-center gap-1 text-body-sm font-semibold text-ink-900 hover:text-primary-700"
                    >
                      לכל התוכן של שלב {stage.label}
                      <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
                    </Link>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </HubSection>
  );
}
