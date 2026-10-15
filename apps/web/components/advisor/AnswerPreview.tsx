'use client';

/**
 * The answer on /search/: a short preview above the results grid. It runs the
 * same advisor stream, shows what was found, the opening of the answer and the
 * best moments, then "המשיכו לשאול". The finished turn is kept in this
 * browser, so the advisor page reopens it (/ask/?thread=<id>) instead of
 * asking, and paying, again.
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowLeft, Play, Sparkles } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { track } from '@/lib/analytics/track';
import { clock, statsLine } from '@/lib/advisor/format';
import { useAdvisor } from '@/lib/advisor/client/useAdvisor';
import type { AdvisorVideoSource } from '@/lib/advisor/types';
import AnswerMarkdown from './AnswerMarkdown';

export default function AnswerPreview({ query }: { query: string }) {
  const { turns, ask, threadId } = useAdvisor();

  // One answer per query (StrictMode runs effects twice in development).
  const asked = useRef<string | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!q || asked.current === q) return;
    asked.current = q;
    void ask(q, { origin: 'search', fresh: true });
  }, [query, ask]);

  const turn = turns[turns.length - 1];
  const done = turn?.status === 'done';
  const continueHref = done ? `/ask/?thread=${threadId}` : `/ask/?q=${encodeURIComponent(query)}`;
  const moments = (turn?.sources ?? []).filter((s): s is AdvisorVideoSource => s.kind === 'video').slice(0, 3);
  const line = turn && !turn.refused ? statsLine(turn.stats) : null;

  return (
    <section aria-labelledby="search-answer" className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="search-answer" className="eyebrow">
          <Sparkles aria-hidden="true" className="size-4" />
          תשובה מהשטח
        </h2>
        <p role="status" className="text-caption text-ink-500">
          {!turn || turn.status === 'searching' ? 'מחפשים בסרטונים ובמאמרים…' : line}
        </p>
      </div>

      <div className="relative mt-3 max-h-[14rem] overflow-hidden" aria-busy={!done}>
        {turn?.answer ? (
          <AnswerMarkdown
            markdown={turn.answer}
            streaming={turn.status === 'answering'}
            sources={turn.sources}
            onCite={() => {
              window.location.href = continueHref;
            }}
          />
        ) : turn?.status === 'error' ? (
          <p className="text-body-sm text-danger-700">{turn.error}</p>
        ) : (
          <SkeletonText lines={3} />
        )}
        {turn?.answer && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />}
      </div>

      {moments.length > 0 && (
        <ul aria-label="הרגעים בסרטונים" className="mt-4 flex flex-wrap gap-2">
          {moments.map((s) => (
            <li key={s.youtube_id}>
              <Link
                href={`/video/${s.youtube_id}/?t=${Math.floor(s.timestamp)}`}
                prefetch={false}
                onClick={() => track('source_clicked', { kind: s.episode ? 'podcast' : 'video', id: s.youtube_id, position: s.n, timestamp: Math.floor(s.timestamp), query })}
                className="inline-flex h-9 max-w-[18rem] items-center gap-2 rounded-full border border-ink-200 bg-white pe-3 ps-1 text-[0.8125rem] font-medium text-ink-700 transition-colors hover:border-primary-600 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
                  <Play className="size-3.5 translate-x-[-1px] fill-current" />
                </span>
                <span className="num shrink-0">{clock(s.timestamp)}</span>
                <span className="truncate">{s.episode ? `פרק ${s.episode}` : s.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
        <ButtonLink href={continueHref} prefetch={false} iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
          המשיכו לשאול
        </ButtonLink>
        <p className="text-caption text-ink-500">לא תחליף לייעוץ מקצועי</p>
      </div>
    </section>
  );
}
