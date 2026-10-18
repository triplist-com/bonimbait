import Link from 'next/link';
import { CalendarDays, CircleCheck, Info, MapPin, Pencil, Ruler, TriangleAlert, Wallet } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Steps';
import { buildStage } from '@/lib/hub/content';
import { daysLabel, monthLabel } from '@/lib/hub/format';
import { checklistProgress, paceCheck } from '@/lib/hub/roadmap';
import type { HubViewData } from '@/lib/hub/types';
import { MoneyRange } from './Money';
import { StageTrack } from './StageTrack';

/**
 * Top of the dashboard: the project summary, where the family is on the 7
 * stages, and the days left to the move-in target with a pace check.
 * Server-safe (also rendered in the browser for local and demo modes).
 */
export function HubHeader({
  data,
  editHref,
  actions,
}: {
  data: HubViewData;
  /** Where "עדכון פרטים" goes (the onboarding, prefilled); none in the demo. */
  editHref?: string | null;
  /** Extra links next to it (the account page for members). */
  actions?: React.ReactNode;
}) {
  const { project, today } = data;
  const done = new Set(data.checklistDone);
  const stage = project.stage ? buildStage(project.stage) : null;
  const progress = project.stage ? checklistProgress(project.stage, done) : null;
  const pace = paceCheck(project.stage, project.targetMoveIn, today, done);

  return (
    <header className="relative isolate overflow-hidden border-b border-sand-200 bg-sand-50">
      <div aria-hidden="true" className="bg-blueprint mask-fade-b absolute inset-0 -z-10" />
      <div className="container-page pb-8 pt-6 sm:pb-10 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">הבית שלי · תיק פרויקט</p>
          <div className="flex flex-wrap items-center gap-1">
            {actions}
            {editHref && (
              <ButtonLink href={editHref} variant="ghost" size="sm" iconStart={<Pencil />} prefetch={false}>
                עדכון פרטים
              </ButtonLink>
            )}
          </div>
        </div>
        <h1 className="mt-2 text-headline text-ink-900">{project.title}</h1>

        <ul aria-label="פרטי הפרויקט" className="mt-4 flex flex-wrap gap-2">
          {project.regionName && (
            <Fact icon={<MapPin />}>{project.regionName}</Fact>
          )}
          {project.sizeM2 && (
            <Fact icon={<Ruler />}>
              <span className="num">{project.sizeM2}</span> מ״ר
            </Fact>
          )}
          {project.budgetRangeNis ? (
            <Fact icon={<Wallet />}>
              תקציב <MoneyRange min={project.budgetRangeNis[0]} max={project.budgetRangeNis[1]} />
            </Fact>
          ) : (
            editHref && <MissingFact href={editHref} icon={<Wallet />} label="הוסיפו תקציב" />
          )}
          {project.targetMoveIn ? (
            <Fact icon={<CalendarDays />}>כניסה: {monthLabel(project.targetMoveIn)}</Fact>
          ) : (
            editHref && <MissingFact href={editHref} icon={<CalendarDays />} label="הוסיפו מועד כניסה" />
          )}
        </ul>

        <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
          <section aria-labelledby="hub-stage-heading" className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
            {stage ? (
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={stage.icon} alt="" width={48} height={42} className="h-10 w-auto shrink-0" />
                <div className="min-w-0">
                  <p className="text-caption font-semibold text-ink-600">
                    שלב <span className="num">{stage.order}</span> מתוך <span className="num">7</span>
                  </p>
                  <h2 id="hub-stage-heading" className="text-title-lg text-ink-900">
                    {stage.title}
                  </h2>
                  <p className="mt-0.5 text-body-sm text-ink-600">{stage.summary}</p>
                </div>
              </div>
            ) : (
              <h2 id="hub-stage-heading" className="text-title-lg text-ink-900">
                באיזה שלב אתם?
              </h2>
            )}
            <StageTrack current={project.stage} className="mt-5" />
            {progress && (
              <Progress
                value={progress.done}
                max={progress.total}
                label={`${progress.done} מתוך ${progress.total} צעדים בשלב הזה`}
                size="sm"
                className="mt-5"
              />
            )}
          </section>

          <section aria-labelledby="hub-countdown-heading" className="flex flex-col justify-between rounded-3xl bg-ink-900 p-5 text-white shadow-card sm:p-6">
            <h2 id="hub-countdown-heading" className="sr-only">
              הזמן עד הכניסה הביתה
            </h2>
            {project.targetMoveIn && pace.daysLeft != null && pace.daysLeft >= 0 ? (
              <div>
                <p className="text-display leading-none text-white">
                  <span className="num">{pace.daysLeft.toLocaleString('he-IL')}</span>
                </p>
                <p className="mt-2 text-body-sm text-white/75">
                  {pace.daysLeft === 1 ? 'יום' : 'ימים'} עד הכניסה הביתה · {monthLabel(project.targetMoveIn)}
                </p>
              </div>
            ) : project.targetMoveIn ? (
              <div>
                <p className="text-title-lg text-white">מועד הכניסה עבר</p>
                <p className="mt-1 text-body-sm text-white/75">
                  {monthLabel(project.targetMoveIn)} עבר לפני {daysLabel(pace.daysLeft ?? 0)}. עדכנו יעד חדש.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-title-lg text-white">מתי נכנסים הביתה?</p>
                <p className="mt-1 text-body-sm text-white/75">קבעו חודש יעד, ונראה לכם אם הקצב ריאלי לשלב שלכם.</p>
              </div>
            )}
            <PaceLine pace={pace} editHref={editHref} />
          </section>
        </div>
      </div>
    </header>
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

function MissingFact({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-ink-300 px-3 py-1.5 text-body-sm font-semibold text-primary-700 hover:border-primary-600 [&_svg]:size-4"
      >
        <span aria-hidden="true" className="contents">
          {icon}
        </span>
        {label}
      </Link>
    </li>
  );
}

function PaceLine({ pace, editHref }: { pace: ReturnType<typeof paceCheck>; editHref?: string | null }) {
  const remaining = pace.remaining;
  const range = remaining ? `${remaining.min}–${remaining.max}` : null;
  let icon = <Info />;
  let text: React.ReactNode = 'לפי זמני שלבים אופייניים';
  let tone = 'text-white/75';
  switch (pace.status) {
    case 'on-track':
      icon = <CircleCheck />;
      tone = 'text-success-100';
      text = (
        <>
          בקצב סביר: לרוב נשארים <span className="num">{range}</span> חודשים
        </>
      );
      break;
    case 'tight':
      icon = <TriangleAlert />;
      tone = 'text-warning-100';
      text = (
        <>
          לוח זמנים צפוף: לרוב נשארים <span className="num">{range}</span> חודשים
        </>
      );
      break;
    case 'roomy':
      icon = <CircleCheck />;
      tone = 'text-success-100';
      text = 'יש לכם מרווח בלוח הזמנים';
      break;
    case 'past':
      icon = <TriangleAlert />;
      tone = 'text-warning-100';
      text = 'עדכנו את מועד הכניסה';
      break;
    case 'unknown':
      if (range) {
        text = (
          <>
            לרוב נשארים <span className="num">{range}</span> חודשי עבודה מהשלב שלכם
          </>
        );
      }
      break;
  }
  return (
    <p className={`mt-4 flex items-start gap-2 text-caption ${tone} [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0`}>
      <span aria-hidden="true" className="contents">
        {icon}
      </span>
      <span>
        {text}
        {(pace.status === 'past' || pace.status === 'unknown') && editHref && (
          <>
            {' '}
            <Link href={editHref} prefetch={false} className="font-semibold text-white underline underline-offset-4">
              {pace.status === 'past' ? 'לעדכון' : 'קבעו יעד'}
            </Link>
          </>
        )}
      </span>
    </p>
  );
}
