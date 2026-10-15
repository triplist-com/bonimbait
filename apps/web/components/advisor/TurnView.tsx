'use client';

/**
 * One question and its answer: the question and what was found ("מצאנו 7
 * רגעים ב-3 סרטונים ו-3 מאמרים", a link down to the moments), the answer with
 * its citations, the exact moment playing inline, the moments and articles,
 * then follow-ups and the lead moments. The sources arrive first and show at
 * once under the answer's placeholder; the answer then streams in above them,
 * so on a phone the first screen is the answer, never just the cards.
 *
 * The same component renders the live advisor, a shared snapshot, the demo
 * replay and the /search/ preview, so the demo always shows the real UI.
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, CornerDownLeft, RotateCcw, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { track } from '@/lib/analytics/track';
import { cn } from '@/lib/cn';
import { statsLine } from '@/lib/advisor/format';
import type { AdvisorTurn } from '@/lib/advisor/client/useAdvisor';
import type { AdvisorSharePayload, AdvisorSource, AdvisorVideoSource } from '@/lib/advisor/types';
import AnswerMarkdown from './AnswerMarkdown';
import { FeedbackBar, ShareBar } from './AnswerActions';
import LeadMoments from './LeadMoments';
import MomentPlayer from './MomentPlayer';
import SourceCard from './SourceCard';

export interface PlayingMoment {
  turnId: string;
  youtubeId: string;
  second: number;
}

export interface TurnViewProps {
  turn: AdvisorTurn;
  /** 1-based position in the conversation (analytics). */
  index: number;
  conversationId?: string;
  playing: PlayingMoment | null;
  onPlay: (moment: PlayingMoment | null) => void;
  /** Ask a follow-up in the same thread; without it, follow-ups link to /ask/?q=. */
  onFollowup?: (question: string, position: number) => void;
  onRetry?: () => void;
  onFeedback?: (value: 'up' | 'down') => void;
  onShareId?: (id: string) => void;
  /** The signed answer, when it can be shared. */
  sharePayload?: AdvisorSharePayload | null;
  /** Lead moments under the answer (off in compact previews). */
  showLeads?: boolean;
  /** The question as a heading of this level. */
  headingLevel?: 1 | 2;
  className?: string;
}

export const DISCLAIMER = 'נכתב בעזרת בינה מלאכותית, על בסיס הסרטונים, הפודקאסט והמאמרים של בונים בית. לא תחליף לייעוץ מקצועי.';

function StatusLine({ turn, onJump }: { turn: AdvisorTurn; onJump?: () => void }) {
  if (turn.status === 'searching') {
    return (
      <p className="flex items-center gap-2 text-body-sm text-ink-600">
        <span aria-hidden="true" className="relative flex size-2.5">
          <span className="absolute inline-flex size-full rounded-full bg-primary-500 motion-safe:animate-ping-soft" />
          <span className="relative inline-flex size-2.5 rounded-full bg-primary-600" />
        </span>
        מחפשים בסרטונים, בפודקאסט ובמאמרים…
      </p>
    );
  }
  const line = turn.refused ? null : statsLine(turn.stats ?? { moments: 0, videos: 0, articles: 0 }) ?? fallbackLine(turn.sources);
  if (!line) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {onJump ? (
        <button
          type="button"
          onClick={onJump}
          className="group inline-flex items-center gap-2 self-start rounded-lg text-start text-body-sm font-medium text-ink-700 transition-colors hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <Sparkles aria-hidden="true" className="size-4 shrink-0 text-primary-600" />
          <span>{line}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-400 transition-transform group-hover:translate-y-0.5" />
        </button>
      ) : (
        <p className="flex items-center gap-2 text-body-sm font-medium text-ink-700">
          <Sparkles aria-hidden="true" className="size-4 text-primary-600" />
          {line}
        </p>
      )}
      {turn.rewritten && turn.sq && (
        <p className="flex items-center gap-1.5 ps-6 text-caption text-ink-500">
          <Search aria-hidden="true" className="size-3" />
          חיפשנו: {turn.sq}
        </p>
      )}
    </div>
  );
}

/** Restored turns have no stats: count the sources themselves. */
function fallbackLine(sources: AdvisorSource[]): string | null {
  const videos = sources.filter((s) => s.kind === 'video');
  const moments = videos.reduce((a, s) => a + (s.kind === 'video' ? Math.max(1, s.moments.length) : 0), 0) + (sources.length - videos.length);
  return statsLine({ moments, videos: videos.length, articles: sources.length - videos.length });
}

export default function TurnView({
  turn,
  index,
  conversationId,
  playing,
  onPlay,
  onFollowup,
  onRetry,
  onFeedback,
  onShareId,
  sharePayload,
  showLeads = true,
  headingLevel = 2,
  className,
}: TurnViewProps) {
  const [highlight, setHighlight] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  const cardId = useCallback((n: number) => `source-${turn.id}-${n}`, [turn.id]);
  const done = turn.status === 'done';
  const streaming = turn.status === 'answering';
  const hasAnswer = Boolean(turn.answer);
  const unanswered = Boolean(turn.refused);

  const cite = useCallback(
    (n: number) => {
      const el = document.getElementById(cardId(n));
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
      setHighlight(n);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlight(null), 2200);
    },
    [cardId],
  );

  const jumpToSources = useCallback(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`sources-${turn.id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [turn.id]);

  const play = useCallback(
    (source: AdvisorVideoSource, second: number) => {
      onPlay({ turnId: turn.id, youtubeId: source.youtube_id, second });
      track('video_play', { youtube_id: source.youtube_id, start: Math.floor(second), source: 'advisor' });
      track('source_clicked', { kind: source.episode ? 'podcast' : 'video', id: source.youtube_id, position: source.n, timestamp: Math.floor(second), query: turn.question });
    },
    [onPlay, turn.id, turn.question],
  );

  const open = useCallback(
    (source: AdvisorSource) => {
      track('source_clicked', {
        kind: source.kind === 'post' ? 'post' : source.episode ? 'podcast' : 'video',
        id: source.kind === 'post' ? source.slug : source.youtube_id,
        position: source.n,
        ...(source.kind === 'video' ? { timestamp: Math.floor(source.timestamp) } : {}),
        query: turn.question,
      });
    },
    [turn.question],
  );

  const playingHere = playing && playing.turnId === turn.id ? playing : null;
  const playingSource = playingHere
    ? (turn.sources.find((s) => s.kind === 'video' && s.youtube_id === playingHere.youtubeId) as AdvisorVideoSource | undefined)
    : undefined;
  const playingQuote = playingSource?.moments.find((m) => m.second === playingHere?.second)?.quote;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  // Once the answer is done, the sources it cites lead the rail (numbers unchanged).
  const railSources = done && turn.sources.some((s) => s.cited) ? [...turn.sources.filter((s) => s.cited), ...turn.sources.filter((s) => !s.cited)] : turn.sources;

  return (
    <article aria-labelledby={`q-${turn.id}`} className={cn('scroll-mt-24 space-y-5', className)}>
      <header className="space-y-3">
        <Heading id={`q-${turn.id}`} className="text-headline-sm text-ink-900">
          {turn.question}
        </Heading>
        <div role="status">
          <StatusLine turn={turn} onJump={turn.sources.length > 0 ? jumpToSources : undefined} />
        </div>
      </header>

      <section aria-label="התשובה" className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="eyebrow">
            <Sparkles aria-hidden="true" className="size-4" />
            תשובה מהשטח
          </p>
          {done && turn.confidence?.level === 'low' && !unanswered && !turn.degraded && (
            <Badge tone="warning" size="sm">
              מידע חלקי בספרייה
            </Badge>
          )}
        </div>

        <div aria-busy={!done}>
          {hasAnswer ? (
            <AnswerMarkdown markdown={turn.answer} streaming={streaming} sources={turn.sources} onCite={cite} />
          ) : turn.status === 'error' ? null : (
            <SkeletonText lines={3} />
          )}
        </div>

        {turn.status === 'error' && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-danger-50 p-4 text-body-sm text-danger-700">
            <p className="flex-1">{turn.error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" iconStart={<RotateCcw />} onClick={onRetry}>
                נסו שוב
              </Button>
            )}
          </div>
        )}

        {done && hasAnswer && (
          <>
            <p className="mt-5 border-t border-ink-100 pt-4 text-caption text-ink-500">{DISCLAIMER}</p>
            {(onFeedback || (sharePayload && turn.signature && onShareId)) && (
              <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                {onFeedback && !unanswered && !turn.degraded ? (
                  <FeedbackBar value={turn.feedback} onChange={onFeedback} query={turn.question} turn={index} conversationId={conversationId} />
                ) : (
                  <span />
                )}
                {sharePayload && turn.signature && onShareId && (
                  <ShareBar payload={sharePayload} signature={turn.signature} shareId={turn.shareId} onShareId={onShareId} turn={index} conversationId={conversationId} />
                )}
              </div>
            )}
          </>
        )}
      </section>

      {playingHere && playingSource && (
        <MomentPlayer
          youtubeId={playingSource.youtube_id}
          title={playingSource.title}
          second={playingHere.second}
          quote={playingQuote}
          n={playingSource.n}
          onClose={() => onPlay(null)}
        />
      )}

      {turn.sources.length > 0 && (
        <ul id={`sources-${turn.id}`} aria-label="המקורות של התשובה" className="scroll-mt-28 rail -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
          {railSources.map((s) => (
            <li key={`${s.kind}-${s.n}`} className="w-[78%] max-w-[19rem] motion-safe:animate-slide-up sm:w-[45%] lg:w-auto lg:max-w-none">
              <SourceCard
                source={s}
                id={cardId(s.n)}
                highlighted={highlight === s.n}
                playingSecond={s.kind === 'video' && playingHere?.youtubeId === s.youtube_id ? playingHere.second : null}
                onPlay={play}
                onOpen={open}
              />
            </li>
          ))}
        </ul>
      )}

      {done && turn.followups.length > 0 && (
        <nav aria-labelledby={`f-${turn.id}`} className="space-y-2">
          <h3 id={`f-${turn.id}`} className="text-title-sm text-ink-900">
            {unanswered ? 'אפשר לשאול למשל' : 'שאלות המשך'}
          </h3>
          <ul className="flex flex-col gap-2">
            {turn.followups.map((q, i) => {
              const cls =
                'group flex w-full items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-start text-body-sm font-medium text-ink-800 transition-colors hover:border-primary-600 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600';
              const inner = (
                <>
                  <CornerDownLeft aria-hidden="true" className="size-4 shrink-0 text-primary-600" />
                  <span className="flex-1">{q}</span>
                  <ArrowLeft aria-hidden="true" className="size-4 shrink-0 text-ink-400 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
                </>
              );
              return (
                <li key={q}>
                  {onFollowup ? (
                    <button
                      type="button"
                      className={cls}
                      onClick={() => {
                        track('followup_clicked', { question: q, position: i + 1, from_query: turn.question });
                        onFollowup(q, i + 1);
                      }}
                    >
                      {inner}
                    </button>
                  ) : (
                    <Link
                      href={`/ask/?q=${encodeURIComponent(q)}`}
                      prefetch={false}
                      className={cls}
                      onClick={() => track('followup_clicked', { question: q, position: i + 1, from_query: turn.question })}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {done && showLeads && !turn.degraded && <LeadMoments intent={turn.intent} pros={turn.pros} offer={turn.offer} unanswered={unanswered} />}
      <span className="sr-only" aria-live="polite">
        {done && hasAnswer ? 'התשובה מוכנה.' : ''}
      </span>
    </article>
  );
}
