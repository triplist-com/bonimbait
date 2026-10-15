'use client';

/**
 * The five questions, one per screen: m², floors, region, finish level,
 * extras. Phone first: big targets, one primary action per screen, and a tap
 * on an option moves on by itself (keyboard users confirm with "הבא", since
 * arrow keys change a radio group's selection as they move).
 */
import { useId, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Home, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  EXTRAS,
  FINISH_LEVELS,
  FLOOR_LABELS,
  PLANNER_REGIONS,
  QUESTION_ORDER,
  QUESTION_STEP_LABELS,
  QUESTION_TITLES,
  SIZE_LIMITS,
  SIZE_PRESETS,
  regionName,
  type QuestionId,
} from '@/lib/planner/content';
import { finishLevelRange } from '@/lib/planner/engine';
import { compactAmount } from '@/lib/planner/format';
import { EXTRA_IDS, FINISH_LEVEL_IDS, FLOOR_OPTIONS, type ExtraId, type PlannerInput, type PriceBook } from '@/lib/planner/types';

export interface PlannerWizardProps {
  book: PriceBook;
  answers: Partial<PlannerInput>;
  step: number;
  onAnswer: (question: QuestionId, patch: Partial<PlannerInput>, advance: boolean) => void;
  onStep: (step: number) => void;
  onSubmit: () => void;
  /** What the hub draft filled in, for a short note. */
  prefilled?: { sizeM2?: number; regionSlug?: string };
  compact?: boolean;
}

const optionCard =
  'group relative flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-start transition-colors ' +
  'hover:border-ink-300 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50/50 has-[:checked]:shadow-xs ' +
  'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary-600/15';
const nativeInput = 'mt-1 size-5 shrink-0 cursor-pointer accent-primary-600 focus-visible:outline-none';

/** Radio options that move on when tapped (pointer), not when arrowed through. */
function ChoiceGroup<T extends string | number>({
  name,
  labelledBy,
  options,
  value,
  onPick,
  className,
}: {
  name: string;
  labelledBy: string;
  options: Array<{ value: T; content: ReactNode }>;
  value: T | undefined;
  onPick: (value: T, viaPointer: boolean) => void;
  className?: string;
}) {
  // When the last pointer press started (0 = none). A click within a second of it is a tap.
  const pressedAt = useRef(0);
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={className}>
      {options.map((o) => (
        <label
          key={String(o.value)}
          className={optionCard}
          onPointerDown={() => (pressedAt.current = Date.now())}
          onPointerCancel={() => (pressedAt.current = 0)}
          onKeyDown={() => (pressedAt.current = 0)}
        >
          <input
            type="radio"
            name={name}
            value={String(o.value)}
            checked={value === o.value}
            // The pick happens on click: React runs onClick before onChange, and a
            // radio fires click for taps, Space and arrow keys alike. Re-tapping the
            // selected option also moves on.
            onChange={() => undefined}
            onClick={() => {
              const viaPointer = pressedAt.current > 0 && Date.now() - pressedAt.current < 1000;
              pressedAt.current = 0;
              onPick(o.value, viaPointer);
            }}
            className={nativeInput}
          />
          <span className="min-w-0 flex-1">{o.content}</span>
        </label>
      ))}
    </div>
  );
}

/** "+₪750 אלף": the sign and digits in one LTR island, the unit after it. */
function ExtraAmount({ agorot }: { agorot: number }) {
  const { value, unit } = compactAmount(agorot / 100);
  return (
    <span className="whitespace-nowrap text-sm font-semibold text-ink-700">
      <span className="num">+₪{value}</span>
      {unit && ` ${unit}`}
    </span>
  );
}

function StepHeader({ step, total, onStep, answered }: { step: number; total: number; onStep: (s: number) => void; answered: boolean[] }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink-700">
          שאלה <span className="num">{step + 1}</span> מתוך <span className="num">{total}</span>
        </span>
        <span className="text-ink-500">פחות מ-3 דקות</span>
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1.5" aria-label="התקדמות">
        {QUESTION_ORDER.map((q, i) => {
          const done = answered[i] && i !== step;
          const current = i === step;
          const reachable = i < step || answered[i];
          return (
            <li key={q}>
              <button
                type="button"
                disabled={!reachable || current}
                onClick={() => onStep(i)}
                aria-current={current ? 'step' : undefined}
                className="group flex w-full flex-col items-stretch gap-1.5 rounded-md text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-default"
              >
                <span className={cn('h-1.5 rounded-full transition-colors', current || done || i < step ? 'bg-primary-600' : 'bg-ink-200')} />
                <span className={cn('flex items-center gap-1 text-xs font-medium', current ? 'text-ink-900' : 'text-ink-500', reachable && !current && 'group-hover:text-primary-700')}>
                  {done && <Check aria-hidden="true" className="size-3 text-primary-600" />}
                  {QUESTION_STEP_LABELS[q]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function PlannerWizard({ book, answers, step, onAnswer, onStep, onSubmit, prefilled, compact }: PlannerWizardProps) {
  const uid = useId().replace(/:/g, '');
  const question = QUESTION_ORDER[step] ?? 'size';
  const titleId = `${uid}-q-${question}`;
  const answered = QUESTION_ORDER.map((q) =>
    q === 'size' ? answers.sizeM2 !== undefined : q === 'floors' ? answers.floors !== undefined : q === 'region' ? !!answers.regionSlug : q === 'finish' ? !!answers.finishLevel : answers.extras !== undefined,
  );
  const size = answers.sizeM2 ?? SIZE_LIMITS.default;
  const setSize = (n: number) => onAnswer('size', { sizeM2: Math.min(SIZE_LIMITS.max * 2, Math.max(SIZE_LIMITS.min, Math.round(n))) }, false);
  const extras = answers.extras ?? [];
  const toggleExtra = (id: ExtraId) =>
    onAnswer('extras', { extras: extras.includes(id) ? extras.filter((e) => e !== id) : [...extras, id] }, false);
  const isLast = step === QUESTION_ORDER.length - 1;
  const canNext = answered[step] || question === 'size' || question === 'extras';

  const back = step > 0 && (
    <Button variant="ghost" size="lg" onClick={() => onStep(step - 1)} iconStart={<ArrowRight className="ltr:rotate-180" />}>
      הקודם
    </Button>
  );

  return (
    <div className={cn(!compact && 'p-5 sm:p-8')}>
      <StepHeader step={step} total={QUESTION_ORDER.length} onStep={onStep} answered={answered} />

      <h2 id={titleId} className="text-headline-sm text-ink-900 focus:outline-none" tabIndex={-1} data-planner-question data-planner-focus>
        {QUESTION_TITLES[question]}
      </h2>

      {prefilled && (prefilled.sizeM2 || prefilled.regionSlug) && step < 3 && (
        <p className="mt-3 inline-flex w-fit items-start gap-1.5 rounded-xl bg-sand-100 px-2.5 py-1 text-xs font-semibold text-sand-800 ring-1 ring-inset ring-sand-200">
          <Home aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>
            מילאנו לפי הבית שלי:{' '}
            {[prefilled.sizeM2 ? `${prefilled.sizeM2} מ״ר` : null, prefilled.regionSlug ? regionName(prefilled.regionSlug) : null].filter(Boolean).join(', ')}
          </span>
        </p>
      )}

      <div className="mt-6 min-h-[17rem]">
        {question === 'size' && (
          <div>
            <p className="text-body-sm text-ink-600">שטח בנוי למגורים, לפי התוכניות (מטר אדריכלי). עוד לא יודעים? התחילו מ-200.</p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setSize(size - SIZE_LIMITS.step)}
                aria-label="פחות 10 מ״ר"
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-900 hover:border-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                <Minus aria-hidden="true" className="size-5" />
              </button>
              <label className="flex items-baseline gap-2">
                <span className="sr-only">שטח הבית במ״ר</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={SIZE_LIMITS.min}
                  max={SIZE_LIMITS.max * 2}
                  step={SIZE_LIMITS.step}
                  value={size}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) onAnswer('size', { sizeM2: Math.round(n) }, false);
                  }}
                  onBlur={() => setSize(size)}
                  dir="ltr"
                  className="num w-[4.5ch] rounded-xl bg-transparent text-center text-6xl font-extrabold tracking-tight text-ink-900 focus-visible:bg-sand-50 focus-visible:outline-none sm:text-7xl [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-2xl font-bold text-ink-700">מ״ר</span>
              </label>
              <button
                type="button"
                onClick={() => setSize(size + SIZE_LIMITS.step)}
                aria-label="עוד 10 מ״ר"
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-900 hover:border-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                <Plus aria-hidden="true" className="size-5" />
              </button>
            </div>
            <div dir="ltr" className="mt-6">
              <input
                type="range"
                min={SIZE_LIMITS.min}
                max={SIZE_LIMITS.max}
                step={SIZE_LIMITS.step}
                value={Math.min(SIZE_LIMITS.max, size)}
                onChange={(e) => onAnswer('size', { sizeM2: Number(e.target.value) }, false)}
                aria-label="שטח הבית במ״ר"
                aria-valuetext={`${size} מ״ר`}
                className="h-11 w-full cursor-pointer accent-primary-600"
              />
              <div className="flex justify-between text-xs text-ink-500">
                <span className="num">{SIZE_LIMITS.min}</span>
                <span className="num">{SIZE_LIMITS.max}+</span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="גדלים נפוצים">
              {SIZE_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSize(n)}
                  aria-pressed={size === n}
                  className={cn(
                    'h-10 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
                    size === n ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                  )}
                >
                  <span className="num">{n}</span> מ״ר
                </button>
              ))}
            </div>
          </div>
        )}

        {question === 'floors' && (
          <ChoiceGroup
            name={`${uid}-floors`}
            labelledBy={titleId}
            value={answers.floors}
            onPick={(v, pointer) => onAnswer('floors', { floors: v }, pointer)}
            className="grid gap-3"
            options={FLOOR_OPTIONS.map((f) => ({
              value: f,
              content: (
                <>
                  <span className="block text-title-sm text-ink-900">{FLOOR_LABELS[f].label}</span>
                  <span className="mt-0.5 block text-body-sm text-ink-600">{FLOOR_LABELS[f].hint}</span>
                </>
              ),
            }))}
          />
        )}

        {question === 'region' && (
          <ChoiceGroup
            name={`${uid}-region`}
            labelledBy={titleId}
            value={answers.regionSlug}
            onPick={(v, pointer) => onAnswer('region', { regionSlug: v }, pointer)}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
            options={PLANNER_REGIONS.map((r) => ({
              value: r.slug,
              content: <span className="block text-sm font-semibold leading-snug text-ink-900">{r.name}</span>,
            }))}
          />
        )}

        {question === 'finish' && (
          <ChoiceGroup
            name={`${uid}-finish`}
            labelledBy={titleId}
            value={answers.finishLevel}
            onPick={(v, pointer) => onAnswer('finish', { finishLevel: v }, pointer)}
            className="grid gap-3 sm:grid-cols-2"
            options={FINISH_LEVEL_IDS.map((f) => {
              const r = finishLevelRange(book, f);
              return {
                value: f,
                content: (
                  <>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-title-sm text-ink-900">{FINISH_LEVELS[f].label}</span>
                      <span className="num text-sm font-semibold text-ink-700">
                        ₪{r.min.toLocaleString('he-IL')}–{r.max.toLocaleString('he-IL')}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-body-sm text-ink-600">{FINISH_LEVELS[f].description}</span>
                    <span className="mt-1 block text-caption text-ink-500">למ״ר, תכנון ובנייה, לפני מע״מ</span>
                  </>
                ),
              };
            })}
          />
        )}

        {question === 'extras' && (
          <fieldset>
            <legend className="text-body-sm text-ink-600">סמנו מה שמתוכנן. אפשר גם לדלג.</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {EXTRA_IDS.filter((id) => book.extras[id]?.enabled !== false).map((id) => (
                <label key={id} className={optionCard}>
                  <input type="checkbox" checked={extras.includes(id)} onChange={() => toggleExtra(id)} className={cn(nativeInput, 'rounded')} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-title-sm text-ink-900">{EXTRAS[id].label}</span>
                      <ExtraAmount agorot={book.extras[id].amountAgorot} />
                    </span>
                    <span className="mt-0.5 block text-body-sm text-ink-600">{EXTRAS[id].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <div>{back}</div>
        {isLast ? (
          <Button size="xl" onClick={onSubmit} iconEnd={<ArrowLeft className="ltr:rotate-180" />} className="flex-1 sm:flex-none">
            הציגו את התקציב
          </Button>
        ) : (
          <Button
            size="lg"
            variant={question === 'size' ? 'primary' : 'outline'}
            disabled={!canNext}
            onClick={() => onStep(step + 1)}
            iconEnd={<ArrowLeft className="ltr:rotate-180" />}
            className={cn(question === 'size' && 'flex-1 sm:flex-none')}
          >
            הבא
          </Button>
        )}
      </div>
    </div>
  );
}
