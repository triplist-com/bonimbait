'use client';

/**
 * "מיפוי מצב → מפת דרך אישית": five questions (stage, region, m², budget,
 * move-in month), one per screen, most of them a single tap that moves on.
 * Anonymous visitors keep the answers in bb.hub.draft (PROGRAM.md §6);
 * members save them as their project. Ends in the reveal.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { track } from '@/lib/analytics/track';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { BUILD_STAGES } from '@/lib/stages';
import { estimateFromCalculator, initialEstimate } from '@/lib/hub/estimate';
import { HEBREW_MONTHS, monthLabel } from '@/lib/hub/format';
import { readDraft, readPlanner, writeDraft } from '@/lib/hub/local';
import {
  BUDGET_BANDS,
  ONBOARDING_STEPS,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_OPTIONS,
  addMonths,
  isDraftComplete,
  normalizeDraft,
  onboardingEventProps,
  suggestMoveIn,
  type OnboardingStep,
} from '@/lib/hub/onboarding';
import type { HubDraft } from '@/lib/hub/types';
import type { PriceBook } from '@/lib/planner/types';
import { saveOnboardingAction } from '@/app/my-home/actions';
import { cn } from '@/lib/cn';
import { MoneyRange } from './Money';
import { OnboardingReveal } from './OnboardingReveal';

const TITLES: Record<OnboardingStep, { title: string; subtitle: string }> = {
  stage: { title: 'באיזה שלב אתם?', subtitle: 'בחרו את השלב שאתם בו עכשיו. אפשר לשנות בכל רגע.' },
  region: { title: 'איפה בונים?', subtitle: 'האזור משפיע על מחירים, על בעלי המקצוע ועל קבוצת הקהילה שלכם.' },
  size: { title: 'כמה גדול הבית?', subtitle: 'בערך מספיק. אפשר לעדכן כשהתוכניות יהיו מוכנות.' },
  budget: { title: 'מה התקציב שלכם לתכנון ובנייה?', subtitle: 'בלי מחיר המגרש. גם טווח משוער עוזר.' },
  moveIn: { title: 'מתי תרצו להיכנס הביתה?', subtitle: 'נבדוק מול זמני שלבים אופייניים אם היעד ריאלי.' },
};

function OptionButton({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-start transition-[border-color,box-shadow,background-color] duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
        selected ? 'border-primary-600 bg-primary-50/50 shadow-xs ring-1 ring-primary-600' : 'border-ink-200 hover:border-ink-300 hover:shadow-xs',
        className,
      )}
    >
      {children}
      {selected && <Check aria-hidden="true" className="ms-auto size-5 shrink-0 text-primary-600" />}
    </button>
  );
}

export default function OnboardingFlow({
  initialDraft,
  isMember,
  today,
  editing,
  book,
}: {
  initialDraft: HubDraft;
  isMember: boolean;
  today: string;
  editing: boolean;
  /** The owner's current price book (the page loads it), for the estimate in the reveal. */
  book?: PriceBook;
}) {
  const [draft, setDraft] = useState<HubDraft>(() => normalizeDraft(initialDraft));
  const [stepIndex, setStepIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exactSize, setExactSize] = useState('');
  const [customMonth, setCustomMonth] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const step = ONBOARDING_STEPS[stepIndex];

  // Anonymous: resume what's in this browser (unless the server gave answers).
  useEffect(() => {
    if (isMember) return;
    const local = readDraft();
    if (Object.keys(local).length) setDraft((d) => ({ ...local, ...normalizeDraft(d) }));
  }, [isMember]);

  // Screen readers and keyboards follow the question.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [stepIndex, revealed]);

  const estimate = useMemo(() => estimateFromCalculator(draft, book), [draft, book]);
  const suggested = draft.stage ? suggestMoveIn(draft.stage, today) : addMonths(today.slice(0, 7), 24);

  function update(patch: Partial<HubDraft>, advance = true) {
    const next = normalizeDraft({ ...draft, ...patch });
    // An explicit "don't know" clears the optional answer.
    if ('budgetRangeNis' in patch && !patch.budgetRangeNis) delete next.budgetRangeNis;
    if ('targetMoveIn' in patch && !patch.targetMoveIn) delete next.targetMoveIn;
    setDraft(next);
    if (!isMember) writeDraft(next);
    if (advance) goNext(next);
  }

  function goNext(current: HubDraft) {
    if (stepIndex < ONBOARDING_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }
    finish(current);
  }

  async function finish(final: HubDraft) {
    if (!isDraftComplete(final)) {
      setStepIndex(!final.stage ? 0 : !final.regionSlug ? 1 : 2);
      return;
    }
    setRevealed(true);
    track('hub_onboarding_completed', onboardingEventProps(final, today));
    if (!isMember) return;
    setSaveState('saving');
    try {
      const res = await saveOnboardingAction({ draft: final, planner: readPlanner() });
      if (res.ok) {
        setSaveState('saved');
        return;
      }
      if (res.error === 'auth') writeDraft(final); // session expired: keep it locally
      setSaveError(res.message);
      setSaveState('error');
    } catch {
      setSaveError('אין חיבור כרגע. נסו שוב.');
      setSaveState('error');
    }
  }

  if (revealed) {
    return (
      <OnboardingReveal
        draft={draft}
        today={today}
        isMember={isMember}
        saveState={saveState}
        saveError={saveError}
        onRetry={() => finish(draft)}
        estimate={initialEstimate(draft, readPlanner(), book)}
        headingRef={headingRef}
      />
    );
  }

  const { title, subtitle } = TITLES[step];
  const sizeValue = Number(exactSize);
  const exactValid = exactSize !== '' && Number.isFinite(sizeValue) && sizeValue >= SIZE_MIN && sizeValue <= SIZE_MAX;
  const [moveYear, moveMonth] = (draft.targetMoveIn ?? suggested).split('-');
  const years = Array.from({ length: 8 }, (_, i) => String(Number(today.slice(0, 4)) + i));

  return (
    <div data-floating-cta="hide" className="min-h-[calc(100dvh-var(--bb-header-h))] bg-sand-50">
      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-5 sm:pt-10">
        <div className="flex items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <Button variant="ghost" size="sm" iconStart={<ArrowRight className="ltr:rotate-180" />} onClick={() => setStepIndex((i) => i - 1)}>
              חזרה
            </Button>
          ) : (
            <span className="text-caption font-bold text-primary-700">{editing ? 'עדכון פרטי הפרויקט' : 'הבית שלי · מיפוי מהיר'}</span>
          )}
          <ButtonLink href={editing ? '/my-home/' : '/'} variant="ghost" size="sm" iconStart={<X />} prefetch={false} aria-label="יציאה מהמיפוי">
            יציאה
          </ButtonLink>
        </div>

        <div className="mt-4" aria-hidden="true">
          <div className="flex gap-1.5">
            {ONBOARDING_STEPS.map((s, i) => (
              <span key={s} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= stepIndex ? 'bg-primary-600' : 'bg-ink-200')} />
            ))}
          </div>
        </div>
        <p className="mt-3 text-caption font-semibold text-ink-600">
          שאלה <span className="num">{stepIndex + 1}</span> מתוך <span className="num">{ONBOARDING_STEPS.length}</span>
        </p>

        <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-headline-sm text-ink-900 outline-none">
          {title}
        </h1>
        <p className="mt-1 text-body-sm text-ink-600">{subtitle}</p>

        <div className="mt-6" key={step}>
          {step === 'stage' && (
            <ul className="grid gap-2">
              {BUILD_STAGES.map((s) => (
                <li key={s.id}>
                  <OptionButton selected={draft.stage === s.id} onClick={() => update({ stage: s.id })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.icon} alt="" width={48} height={42} className="h-8 w-auto shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-title-sm text-ink-900">{s.title}</span>
                      <span className="block text-caption text-ink-600">{s.summary}</span>
                    </span>
                  </OptionButton>
                </li>
              ))}
            </ul>
          )}

          {step === 'region' && (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MEMBER_REGIONS.map((r) => (
                <li key={r.slug}>
                  <OptionButton selected={draft.regionSlug === r.slug} onClick={() => update({ regionSlug: r.slug })} className="min-h-12 px-3 py-2.5">
                    <span className="text-body-sm font-semibold text-ink-900">{r.name}</span>
                  </OptionButton>
                </li>
              ))}
            </ul>
          )}

          {step === 'size' && (
            <div className="space-y-4">
              <ul className="grid gap-2 sm:grid-cols-2">
                {SIZE_OPTIONS.map((o) => (
                  <li key={o.id}>
                    <OptionButton
                      selected={draft.sizeM2 != null && !exactSize && SIZE_OPTIONS.find((x) => x.value === draft.sizeM2)?.id === o.id}
                      onClick={() => {
                        setExactSize('');
                        update({ sizeM2: o.value });
                      }}
                    >
                      <span className="text-title-sm text-ink-900">{o.label}</span>
                    </OptionButton>
                  </li>
                ))}
              </ul>
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (exactValid) update({ sizeM2: Math.round(sizeValue) });
                }}
              >
                <label className="flex-1">
                  <span className="mb-1.5 block text-sm font-semibold text-ink-800">או מספר מדויק</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={SIZE_MIN}
                    max={SIZE_MAX}
                    value={exactSize}
                    onChange={(e) => setExactSize(e.target.value)}
                    placeholder={String(draft.sizeM2 ?? 200)}
                    dir="ltr"
                    endAdornment="מ״ר"
                    className="text-start"
                  />
                </label>
                <Button type="submit" variant="secondary" disabled={!exactValid}>
                  המשך
                </Button>
              </form>
            </div>
          )}

          {step === 'budget' && (
            <div className="space-y-4">
              {estimate && (
                <p className="rounded-2xl bg-white p-4 text-body-sm text-ink-800 ring-1 ring-inset ring-ink-100">
                  לבית של <span className="num">{draft.sizeM2}</span> מ״ר
                  {draft.regionSlug && <> ב{MEMBER_REGIONS.find((r) => r.slug === draft.regionSlug)?.name}</>}, ההערכה הראשונית היא{' '}
                  <strong className="font-bold">
                    <MoneyRange min={estimate.totalMin} max={estimate.totalMax} />
                  </strong>{' '}
                  (מחשבון בונים בית, נכון ל-2026).
                </p>
              )}
              <ul className="grid gap-2 sm:grid-cols-2">
                {BUDGET_BANDS.map((b) => (
                  <li key={b.id}>
                    <OptionButton
                      selected={draft.budgetRangeNis?.[0] === b.range[0] && draft.budgetRangeNis?.[1] === b.range[1]}
                      onClick={() => update({ budgetRangeNis: b.range })}
                    >
                      <span className="text-title-sm text-ink-900">{b.label}</span>
                    </OptionButton>
                  </li>
                ))}
                <li className="sm:col-span-2">
                  <OptionButton onClick={() => update({ budgetRangeNis: undefined })}>
                    <span className="text-body-sm font-semibold text-ink-700">עוד לא יודעים, נתחיל מההערכה</span>
                  </OptionButton>
                </li>
              </ul>
            </div>
          )}

          {step === 'moveIn' && (
            <div className="space-y-2">
              <OptionButton selected={draft.targetMoveIn === suggested && !customMonth} onClick={() => update({ targetMoveIn: suggested })}>
                <span className="min-w-0">
                  <span className="block text-title-sm text-ink-900">בערך ב{monthLabel(suggested)}</span>
                  <span className="block text-caption text-ink-600">יעד ריאלי לפי השלב שלכם וזמני שלבים אופייניים</span>
                </span>
              </OptionButton>
              <OptionButton selected={customMonth} onClick={() => setCustomMonth(true)}>
                <span className="text-title-sm text-ink-900">חודש אחר</span>
              </OptionButton>
              {customMonth && (
                <form
                  className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-2xl bg-white p-3 ring-1 ring-inset ring-ink-100"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    update({ targetMoveIn: `${data.get('year')}-${data.get('month')}` });
                  }}
                >
                  <label>
                    <span className="mb-1 block text-caption font-semibold text-ink-700">חודש</span>
                    <Select name="month" defaultValue={moveMonth}>
                      {HEBREW_MONTHS.map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    <span className="mb-1 block text-caption font-semibold text-ink-700">שנה</span>
                    <Select name="year" defaultValue={years.includes(moveYear) ? moveYear : years[2]}>
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button type="submit" variant="secondary">
                    המשך
                  </Button>
                </form>
              )}
              <OptionButton onClick={() => update({ targetMoveIn: undefined })}>
                <span className="text-body-sm font-semibold text-ink-700">עוד לא יודעים</span>
              </OptionButton>
            </div>
          )}
        </div>

        {step !== 'stage' && step !== 'region' && draft.stage && (
          <p className="mt-6 flex items-center gap-1.5 text-caption text-ink-500">
            {ONBOARDING_STEPS.length - stepIndex - 1 === 0 ? (
              'שאלה אחרונה, והמפה שלכם מוכנה'
            ) : ONBOARDING_STEPS.length - stepIndex - 1 === 1 ? (
              'עוד שאלה אחת והמפה שלכם מוכנה'
            ) : (
              <>
                עוד <span className="num">{ONBOARDING_STEPS.length - stepIndex - 1}</span> שאלות והמפה שלכם מוכנה
              </>
            )}
            <ArrowLeft aria-hidden="true" className="size-3.5 ltr:rotate-180" />
          </p>
        )}
      </div>
    </div>
  );
}
