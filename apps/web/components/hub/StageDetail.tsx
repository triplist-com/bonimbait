import Link from 'next/link';
import { ArrowLeft, ArrowRight, Clock3, Coins, FileText, Lightbulb, ListChecks, MessageCircleQuestion, PlayCircle } from 'lucide-react';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { ChipLink } from '@/components/ui/Chip';
import { Progress } from '@/components/ui/Steps';
import { VideoThumb } from '@/components/ui/VideoThumb';
import { aiHref } from '@/lib/nav';
import { STAGE_CONTENT, buildStage, durationLabel } from '@/lib/hub/content';
import { checklistProgress, nextStage, stageIndex, stageStatus } from '@/lib/hub/roadmap';
import { STAGE_IDS, type StageId, type StagePicks } from '@/lib/hub/types';
import { ChecklistToggle } from './ChecklistToggle';
import { HubSection } from './parts';
import { shareLabel } from './Roadmap';
import { SetStageButton } from './SetStageButton';
import { StageTrack } from './StageTrack';

/**
 * One stage in full: what happens, the pitfall, the whole checklist, the
 * stage's videos and guides, questions for the advisor and the consult CTA.
 * Server-safe; the ticks and the "this is our stage" button are client leaves.
 */
export function StageDetail({
  stageId,
  picks,
  checklistDone,
  projectStage,
}: {
  stageId: StageId;
  picks: StagePicks | undefined;
  checklistDone: string[];
  /** The family's current stage, when known. */
  projectStage: StageId | null;
}) {
  const stage = buildStage(stageId);
  const content = STAGE_CONTENT[stageId];
  const done = new Set(checklistDone);
  const progress = checklistProgress(stageId, done);
  const status = stageStatus(stageId, projectStage);
  const i = stageIndex(stageId);
  const prev = i > 0 ? STAGE_IDS[i - 1] : null;
  const next = nextStage(stageId);

  return (
    <div className="bg-paper pb-16">
      <header className="relative isolate overflow-hidden border-b border-sand-200 bg-sand-50">
        <div aria-hidden="true" className="bg-blueprint mask-fade-b absolute inset-0 -z-10" />
        <div className="container-page pb-8 pt-5 sm:pb-10 sm:pt-8">
          <Link href="/my-home/" prefetch={false} className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-ink-700 hover:text-primary-700">
            <ArrowRight aria-hidden="true" className="size-4 ltr:rotate-180" />
            לבית שלי
          </Link>
          <div className="mt-4 flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={stage.icon} alt="" width={48} height={42} className="mt-1 h-12 w-auto shrink-0" />
            <div className="min-w-0">
              <p className="eyebrow">
                שלב <span className="num">{stage.order}</span> מתוך <span className="num">7</span>
                {status === 'current' && <> · השלב שלכם</>}
              </p>
              <h1 className="mt-1 text-display text-ink-900">{stage.title}</h1>
              <p className="mt-2 max-w-2xl text-body-lg text-ink-700">{stage.summary}</p>
            </div>
          </div>
          <ul className="mt-5 flex flex-wrap gap-2 text-body-sm text-ink-800">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-inset ring-ink-100">
              <Clock3 aria-hidden="true" className="size-4 text-primary-600" />
              בדרך כלל {durationLabel(stageId)}
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-inset ring-ink-100">
              <Coins aria-hidden="true" className="size-4 text-primary-600" />
              {shareLabel(stageId)}
            </li>
          </ul>
          <StageTrack current={stageId} className="mt-6 max-w-2xl" />
          {projectStage && status !== 'current' && <SetStageButton stage={stageId} label={stage.label} />}
        </div>
      </header>

      <div className="container-page mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div className="min-w-0 space-y-5">
          <HubSection id="what" title="מה קורה בשלב הזה" icon={<FileText />}>
            <p className="text-body text-ink-800">{content.whatHappens}</p>
            <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-warning-50 p-3 text-body-sm text-warning-800">
              <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-700" />
              <span>
                <strong className="font-bold">פה הכי קל לטעות: </strong>
                {content.watchOut}
              </span>
            </p>
          </HubSection>

          <HubSection id="checklist" title="הצ׳קליסט של השלב" icon={<ListChecks />} subtitle="סמנו כל צעד שסגרתם. ההתקדמות נשמרת במפה שלכם.">
            <Progress value={progress.done} max={progress.total} label={`${progress.done} מתוך ${progress.total}`} showValue size="sm" className="mb-4" />
            <ul className="space-y-4">
              {content.checklist.map((item) => (
                <li key={item.id}>
                  <ChecklistToggle
                    itemId={item.id}
                    stage={stageId}
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
          </HubSection>

          {picks && picks.videos.length > 0 && (
            <HubSection id="videos" title="סרטונים לשלב" icon={<PlayCircle />}>
              <ul className="grid gap-4 sm:grid-cols-2">
                {picks.videos.map((v) => (
                  <li key={v.youtubeId} className="group">
                    <VideoThumb src={v.thumbnailUrl} duration={v.durationSeconds} href={`/video/${v.youtubeId}/`} linkLabel={v.title} sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 90vw" />
                    <Link href={`/video/${v.youtubeId}/`} prefetch={false} className="mt-2 line-clamp-2 block text-body-sm font-semibold text-ink-900 hover:text-primary-700">
                      {v.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </HubSection>
          )}

          {picks && picks.articles.length > 0 && (
            <HubSection id="guides" title="מדריכים לשלב" icon={<FileText />}>
              <ul className="space-y-2">
                {picks.articles.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/${a.slug}/`} prefetch={false} className="group block rounded-2xl border border-ink-100 p-4 transition-shadow hover:shadow-card-hover">
                      <span className="block text-title-sm text-ink-900 group-hover:text-primary-700">{a.title}</span>
                      {a.excerpt && <span className="mt-1 line-clamp-2 block text-body-sm text-ink-600">{a.excerpt}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </HubSection>
          )}
        </div>

        <aside className="min-w-0 space-y-5">
          <HubSection id="ask" title="שאלו על השלב הזה" icon={<MessageCircleQuestion />} subtitle="תשובה מהשטח, מתוך הסרטונים והמאמרים של בונים בית.">
            <ul className="flex flex-wrap gap-2">
              {content.questions.map((q) => (
                <li key={q}>
                  <ChipLink href={aiHref(q)} size="sm" prefetch={false}>
                    {q}
                  </ChipLink>
                </li>
              ))}
            </ul>
          </HubSection>
          <ConsultationCTA
            variant="card"
            source={`hub-stage-${stageId}`}
            title={`תקועים בשלב ${stage.label}?`}
            description="בפגישת ייעוץ תקציב ללא עלות נעבור על השלב שלכם, על המספרים ועל מה שצפוי בהמשך."
          />
          <nav aria-label="שלבים סמוכים" className="flex items-center justify-between gap-2 text-body-sm font-semibold">
            {prev ? (
              <Link href={`/my-home/stage/${prev}/`} prefetch={false} className="inline-flex items-center gap-1 text-ink-700 hover:text-primary-700">
                <ArrowRight aria-hidden="true" className="size-4 ltr:rotate-180" />
                {buildStage(prev).label}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/my-home/stage/${next}/`} prefetch={false} className="inline-flex items-center gap-1 text-ink-700 hover:text-primary-700">
                {buildStage(next).label}
                <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
              </Link>
            )}
          </nav>
        </aside>
      </div>
    </div>
  );
}
