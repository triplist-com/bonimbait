'use client';

/**
 * The reveal at the end of onboarding: "המפה האישית שלכם מוכנה". The stage
 * track fills in, then this week's three steps, the first estimate and the
 * countdown. Members go on to their dashboard; anonymous visitors are invited
 * to keep it (free signup) or continue without one.
 */
import type { RefObject } from 'react';
import { ArrowLeft, CalendarDays, Coins, LoaderCircle, UserRoundPlus } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { buildStage, durationLabel } from '@/lib/hub/content';
import { monthLabel } from '@/lib/hub/format';
import { daysUntilMonth } from '@/lib/hub/onboarding';
import { weeklyActions } from '@/lib/hub/roadmap';
import type { HubDraft, HubEstimate } from '@/lib/hub/types';
import { MoneyRange } from './Money';
import { StageTrack } from './StageTrack';

export function OnboardingReveal({
  draft,
  today,
  isMember,
  saveState,
  saveError,
  onRetry,
  estimate,
  headingRef,
}: {
  draft: HubDraft;
  today: string;
  isMember: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string | null;
  onRetry: () => void;
  estimate: HubEstimate | null;
  headingRef: RefObject<HTMLHeadingElement>;
}) {
  if (!draft.stage) return null;
  const stage = buildStage(draft.stage);
  const actions = weeklyActions(draft.stage, new Set(), 3);
  const days = draft.targetMoveIn ? daysUntilMonth(draft.targetMoveIn, today) : null;

  return (
    // -mb-20 runs the dark band into the footer's top margin (no light seam between two dark bands).
    <div data-floating-cta="hide" className="relative isolate -mb-20 min-h-[calc(100dvh-var(--bb-header-h))] overflow-hidden bg-ink-950 text-white">
      <span aria-hidden="true" className="bg-blueprint-dark absolute inset-0 -z-10" />
      <span aria-hidden="true" className="absolute -top-40 end-[-6rem] -z-10 size-[28rem] rounded-full bg-primary-600/25 blur-3xl" />
      <div className="mx-auto w-full max-w-2xl px-4 pb-32 pt-8 sm:pt-14">
        <div className="motion-safe:animate-slide-up">
          <p className="eyebrow !text-primary-300">הבית שלי</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-display text-white outline-none">
            המפה האישית שלכם מוכנה
          </h1>
          <p className="mt-3 text-body-lg text-white/75">
            אתם בשלב <span className="num">{stage.order}</span> מתוך <span className="num">7</span>: {stage.title}. שלב כזה נמשך לרוב {durationLabel(stage.id)}.
          </p>
        </div>

        <div className="mt-8 rounded-3xl bg-white/[0.06] p-4 ring-1 ring-inset ring-white/10 sm:p-5">
          <StageTrack current={draft.stage} tone="dark" animate />
        </div>

        <section aria-labelledby="reveal-week" className="mt-8">
          <h2 id="reveal-week" className="text-title-lg text-white">
            מה עושים השבוע
          </h2>
          <ol className="stagger-children mt-3 space-y-2">
            {actions.map((a, i) => (
              <li key={a.id} className="flex gap-3 rounded-2xl bg-white p-4 text-ink-900 shadow-lift">
                <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">
                  <span className="num">{i + 1}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-title-sm">{a.title}</span>
                  <span className="mt-0.5 block text-caption text-ink-600">{a.why}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {estimate && (
            <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-inset ring-white/10">
              <dt className="flex items-center gap-2 text-caption font-semibold text-white/70">
                <Coins aria-hidden="true" className="size-4 text-primary-300" />
                הערכה ראשונית לבית
              </dt>
              <dd className="mt-1 text-title-lg text-white">
                <MoneyRange min={estimate.totalMin} max={estimate.totalMax} />
              </dd>
              <dd className="text-caption text-white/60">{estimate.basis === 'planner' ? 'לפי מתכנן התקציב שלכם' : 'לפי מחשבון בונים בית'}, נכון ל-2026</dd>
            </div>
          )}
          <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-inset ring-white/10">
            <dt className="flex items-center gap-2 text-caption font-semibold text-white/70">
              <CalendarDays aria-hidden="true" className="size-4 text-primary-300" />
              עד הכניסה הביתה
            </dt>
            {draft.targetMoveIn && days != null && days >= 0 ? (
              <>
                <dd className="mt-1 text-title-lg text-white">
                  <span className="num">{days.toLocaleString('he-IL')}</span> ימים
                </dd>
                <dd className="text-caption text-white/60">יעד: {monthLabel(draft.targetMoveIn)}</dd>
              </>
            ) : (
              <dd className="mt-1 text-body-sm text-white/80">קבעו יעד בכל רגע, ונראה לכם אם הקצב ריאלי.</dd>
            )}
          </div>
        </dl>

        <div className="mt-8 space-y-3">
          {isMember ? (
            <>
              {saveState === 'error' ? (
                <div className="rounded-2xl bg-danger-50 p-4 text-danger-800" role="alert">
                  <p className="text-body-sm font-semibold">{saveError ?? 'השמירה נכשלה.'}</p>
                  <Button variant="secondary" size="md" className="mt-3" onClick={onRetry}>
                    נסו לשמור שוב
                  </Button>
                </div>
              ) : (
                <ButtonLink
                  href="/my-home/"
                  size="xl"
                  fullWidth
                  aria-disabled={saveState === 'saving' || undefined}
                  iconStart={saveState === 'saving' ? <LoaderCircle className="animate-spin" /> : undefined}
                  iconEnd={saveState === 'saving' ? undefined : <ArrowLeft className="ltr:rotate-180" />}
                  prefetch={false}
                >
                  {saveState === 'saving' ? 'שומרים את המפה…' : 'לבית שלי'}
                </ButtonLink>
              )}
            </>
          ) : (
            <>
              <ButtonLink href="/signup/?next=/my-home/" size="xl" fullWidth iconStart={<UserRoundPlus />} prefetch={false}>
                שמרו את המפה: הרשמה בחינם
              </ButtonLink>
              <ButtonLink href="/my-home/" variant="inverse" size="lg" fullWidth iconEnd={<ArrowLeft className="ltr:rotate-180" />} prefetch={false}>
                להמשיך בלי הרשמה
              </ButtonLink>
              <p className="text-center text-caption text-white/60">בלי הרשמה המפה נשמרת רק בדפדפן הזה.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
