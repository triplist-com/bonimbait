'use client';

/**
 * The budget planner ("תקציב ראשוני ב-3 דקות"), fully in the browser: the
 * price book comes from the server (or /api/planner/price-book/ in the modal),
 * the math is lib/planner/engine.ts. No backend call, no BACKEND_URL.
 *
 * Prefill, later wins: bb.hub.draft (m², region) < free text (the AI answer's
 * question) < the URL (?m2=&floors=&region=&finish=&extras=). A URL with every
 * answer opens on the result (a shared link).
 *
 * On every result it writes bb.planner.last (PROGRAM.md §6), so a consultation
 * booked from the result carries the estimate in the project file.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { track } from '@/lib/analytics/track';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { estimateBudget } from '@/lib/planner/engine';
import { QUESTION_ORDER, type QuestionId } from '@/lib/planner/content';
import { inputFromHubDraft, inputFromText, isCompleteInput, mergeInputs, parsePlannerQuery } from '@/lib/planner/prefill';
import { PLANNER_PATH, plannerHref } from '@/lib/planner/share';
import { plannerSnapshot, readHubDraft, writePlannerLast } from '@/lib/planner/storage';
import type { HubDraft, PlannerInput, PriceBook } from '@/lib/planner/types';
import PlannerWizard from './PlannerWizard';
import PlannerResult from './PlannerResult';

export type PlannerMode = 'page' | 'modal' | 'demo';

export interface PlannerAppProps {
  /** Server-loaded price book; without it the modal fetches the current one. */
  book?: PriceBook;
  mode?: PlannerMode;
  /** Answers to start from (demo, scenario). */
  initialInput?: Partial<PlannerInput>;
  /** A question to read answers from (the cost CTA under an AI answer). */
  initialText?: string;
  /** Open on the result (demo). */
  startOnResult?: boolean;
  /** Analytics source and Calendly utm_source. */
  source?: string;
  /** Pin "today" (demo screenshots). */
  today?: string;
}

function usePriceBook(initial?: PriceBook): PriceBook {
  const [book, setBook] = useState<PriceBook>(initial ?? DEFAULT_PRICE_BOOK);
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch('/api/planner/price-book')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { book?: PriceBook } | null) => {
        if (!cancelled && data?.book) setBook(data.book);
      })
      .catch(() => {
        // Keep the seeded defaults.
      });
    return () => {
      cancelled = true;
    };
  }, [initial]);
  return book;
}

function answeredFor(q: QuestionId, a: Partial<PlannerInput>): boolean {
  if (q === 'size') return a.sizeM2 !== undefined;
  if (q === 'floors') return a.floors !== undefined;
  if (q === 'region') return Boolean(a.regionSlug);
  if (q === 'finish') return Boolean(a.finishLevel);
  return a.extras !== undefined;
}

export default function PlannerApp({ book: initialBook, mode = 'page', initialInput, initialText, startOnResult, source, today }: PlannerAppProps) {
  const book = usePriceBook(initialBook);
  const params = useSearchParams();
  const [answers, setAnswersState] = useState<Partial<PlannerInput>>(() => mergeInputs(initialInput ?? {}));
  const answersRef = useRef(answers);
  const setAnswers = useCallback((next: Partial<PlannerInput>) => {
    answersRef.current = next;
    setAnswersState(next);
  }, []);
  const [step, setStep] = useState(0);
  const [showResult, setShowResult] = useState(Boolean(startOnResult));
  const [hubDraft, setHubDraft] = useState<HubDraft | null>(null);
  const [prefilled, setPrefilled] = useState<{ sizeM2?: number; regionSlug?: string } | undefined>();
  const started = useRef(false);
  const completedKey = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const analyticsSource = source ?? (mode === 'modal' ? 'answer_modal' : params?.get('from') || 'calculator');

  // Prefill once on mount (client only: localStorage and the URL).
  useEffect(() => {
    const draft = readHubDraft();
    setHubDraft(draft);
    const fromHub = inputFromHubDraft(draft);
    const fromUrl = mode === 'page' && params ? parsePlannerQuery(params) : {};
    const merged = mergeInputs(fromHub, inputFromText(initialText), initialInput ?? {}, fromUrl);
    setAnswers(merged);
    if (fromHub.sizeM2 || fromHub.regionSlug) setPrefilled(fromHub);
    if (mode === 'page' && isCompleteInput(fromUrl)) setShowResult(true);
    // Mount-time prefill only; later URL changes come from this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estimate = useMemo(() => estimateBudget(answers, book), [answers, book]);

  // Result side effects: the project-file snapshot, analytics and the shareable URL.
  // (Not in the demo: a sales tour must never write into a real visitor's project file.)
  useEffect(() => {
    if (!showResult) return;
    if (mode !== 'demo') writePlannerLast(plannerSnapshot(estimate));
    if (mode === 'page') window.history.replaceState(null, '', plannerHref(estimate.input));
    // Count a completion once per distinct estimate the visitor reached through the questions.
    if (started.current && completedKey.current !== estimate.estimateId) {
      completedKey.current = estimate.estimateId;
      const { input } = estimate;
      track('planner_completed', { total_ils: estimate.total.mid, size_sqm: input.sizeM2, region: input.regionSlug, stage: hubDraft?.stage });
      track('budget_estimate_completed', {
        total_ils: estimate.total.mid,
        size_sqm: input.sizeM2,
        region: input.regionSlug,
        finish_level: input.finishLevel,
        estimate_id: estimate.estimateId,
      });
    }
  }, [showResult, estimate, mode, hubDraft]);

  // Move focus to the new question (screen readers, keyboard) and keep it in view.
  const focusQuestion = useCallback(() => {
    requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const target = root.querySelector<HTMLElement>(showResult ? '[data-planner-result] h2' : '[data-planner-question]');
      target?.focus({ preventScroll: true });
      const top = root.getBoundingClientRect().top;
      if (mode !== 'modal' && (top < 0 || top > window.innerHeight * 0.4)) {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: window.scrollY + top - 96, behavior: reduce ? 'auto' : 'smooth' });
      }
    });
  }, [mode, showResult]);

  const goTo = useCallback(
    (next: number) => {
      setShowResult(false);
      setStep(Math.max(0, Math.min(QUESTION_ORDER.length - 1, next)));
      focusQuestion();
    },
    [focusQuestion],
  );

  const markStarted = useCallback(() => {
    if (started.current) return;
    started.current = true;
    track('planner_started', { source: analyticsSource });
  }, [analyticsSource]);

  const onAnswer = useCallback(
    (question: QuestionId, patch: Partial<PlannerInput>, advance: boolean) => {
      const prev = answersRef.current;
      markStarted();
      if (!answeredFor(question, prev)) {
        track('planner_step_completed', { step: QUESTION_ORDER.indexOf(question) + 1, question, source: analyticsSource });
      }
      setAnswers({ ...prev, ...patch });
      if (advance) window.setTimeout(() => goTo(QUESTION_ORDER.indexOf(question) + 1), 220);
    },
    [analyticsSource, goTo, markStarted, setAnswers],
  );

  const onSubmit = useCallback(() => {
    const prev = answersRef.current;
    markStarted();
    if (prev.extras === undefined) track('planner_step_completed', { step: QUESTION_ORDER.length, question: 'extras', source: analyticsSource });
    setAnswers({ ...prev, extras: prev.extras ?? [] });
    setShowResult(true);
    focusQuestion();
  }, [analyticsSource, focusQuestion, markStarted, setAnswers]);

  const onRestart = useCallback(() => {
    started.current = false;
    completedKey.current = null;
    setAnswers(mergeInputs(inputFromHubDraft(hubDraft)));
    setShowResult(false);
    setStep(0);
    if (mode === 'page') window.history.replaceState(null, '', PLANNER_PATH);
    focusQuestion();
  }, [focusQuestion, hubDraft, mode, setAnswers]);

  return (
    <div ref={rootRef}>
      {showResult ? (
        <PlannerResult
          book={book}
          estimate={estimate}
          hubDraft={hubDraft}
          onEdit={goTo}
          onRestart={onRestart}
          ctaSource={mode === 'modal' ? 'planner-modal' : mode === 'demo' ? 'planner-demo' : 'planner-result'}
          today={today ? new Date(today) : undefined}
          persist={mode !== 'demo'}
        />
      ) : (
        <div
          data-floating-cta="hide"
          className={mode === 'modal' ? '' : 'mx-auto max-w-3xl rounded-4xl border border-ink-100 bg-white shadow-card'}
        >
          <PlannerWizard
            book={book}
            answers={answers}
            step={step}
            onAnswer={onAnswer}
            onStep={goTo}
            onSubmit={onSubmit}
            prefilled={prefilled}
            compact={mode === 'modal'}
          />
        </div>
      )}
    </div>
  );
}
