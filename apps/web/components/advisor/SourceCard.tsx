'use client';

/**
 * A source under an advisor answer.
 * - Video / podcast moment: thumbnail, title, the words said at that second and
 *   a "▶ צפו מ-28:34" button that plays it inline (MomentPlayer), plus any
 *   other moment of the same video.
 * - Article: image, title, the matching passage and a link.
 * The number is the citation [n] used in the answer; `highlighted` rings the
 * card when a citation chip points at it.
 */
import Link from 'next/link';
import { ArrowLeft, BookOpen, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SmartImage } from '@/components/ui/SmartImage';
import { clock, monthYear } from '@/lib/advisor/format';
import type { AdvisorSource, AdvisorVideoSource } from '@/lib/advisor/types';

export interface SourceCardProps {
  source: AdvisorSource;
  /** DOM id, so citations can scroll to the card. */
  id: string;
  highlighted?: boolean;
  /** The second of this video that is playing now, if any. */
  playingSecond?: number | null;
  onPlay?: (source: AdvisorVideoSource, second: number) => void;
  onOpen?: (source: AdvisorSource) => void;
  className?: string;
}

function NumberBadge({ n }: { n: number }) {
  return (
    <span className="num inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[0.6875rem] font-bold text-white">
      {n}
    </span>
  );
}

const CARD = 'group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-white shadow-card transition-[box-shadow,border-color,transform] duration-300';

export default function SourceCard({ source, id, highlighted, playingSecond, onPlay, onOpen, className }: SourceCardProps) {
  const when = monthYear(source.published_at);

  if (source.kind === 'post') {
    return (
      <article
        id={id}
        className={cn(CARD, 'border-ink-100 hover:-translate-y-0.5 hover:shadow-card-hover', highlighted && 'border-primary-600 ring-2 ring-primary-600/30', className)}
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-sand-100">
          {source.image ? (
            <SmartImage src={source.image} alt="" sizes="(min-width: 1024px) 20rem, 78vw" className="transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <span aria-hidden="true" className="bg-blueprint absolute inset-0 flex items-center justify-center">
              <BookOpen className="size-10 text-sand-500" />
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <p className="flex items-center gap-2 text-caption text-ink-500">
            <NumberBadge n={source.n} />
            <span>מאמר{when ? ` · ${when}` : ''}</span>
          </p>
          <h3 className="line-clamp-2 text-title-sm text-ink-900">
            <Link
              href={source.url}
              prefetch={false}
              onClick={() => onOpen?.(source)}
              className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-3xl focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-primary-600"
            >
              {source.title}
            </Link>
          </h3>
          {source.excerpt && <p className="line-clamp-3 text-body-sm text-ink-600">{source.excerpt}</p>}
          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-primary-700">
            לקריאת המאמר
            <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
          </span>
        </div>
      </article>
    );
  }

  const [first, ...more] = source.moments.length > 0 ? source.moments : [{ second: source.timestamp, quote: '' }];
  const playing = typeof playingSecond === 'number';
  const kind = source.episode ? `פודקאסט · פרק ${source.episode}` : 'סרטון';
  const play = (second: number) => onPlay?.(source, second);

  return (
    <article
      id={id}
      className={cn(
        CARD,
        'border-ink-100',
        playing && 'border-primary-600 shadow-card-hover',
        highlighted && 'border-primary-600 ring-2 ring-primary-600/30',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => play(first.second)}
        aria-label={`הפעלת "${source.title}" מ-${clock(first.second)}`}
        className="relative block aspect-video w-full overflow-hidden bg-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600"
      >
        <SmartImage src={source.thumbnail_url} alt="" sizes="(min-width: 1024px) 20rem, 78vw" className="transition-transform duration-500 group-hover:scale-[1.04]" />
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
        <span
          aria-hidden="true"
          className="absolute bottom-3 start-3 inline-flex items-center gap-2 rounded-full bg-white/95 py-1 pe-3.5 ps-1 shadow-lift transition-transform duration-300 group-hover:scale-105"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary-600 text-white shadow-brand">
            <Play className="size-4 translate-x-[-1px] fill-current" />
          </span>
          <span className="text-sm font-bold text-ink-900">
            {playing ? 'מתנגן עכשיו' : (
              <>
                צפו מ-<span className="num">{clock(first.second)}</span>
              </>
            )}
          </span>
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="flex items-center gap-2 text-caption text-ink-500">
          <NumberBadge n={source.n} />
          <span>
            {kind}
            {when ? ` · ${when}` : ''}
          </span>
        </p>
        <h3 className="line-clamp-2 text-title-sm text-ink-900">
          <Link
            href={`/video/${source.youtube_id}/?t=${Math.floor(first.second)}`}
            prefetch={false}
            onClick={() => onOpen?.(source)}
            className="hover:text-primary-700 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            {source.title}
          </Link>
        </h3>
        {first.quote && (
          <blockquote className="line-clamp-3 border-s-2 border-primary-300 ps-3 text-body-sm text-ink-600">{first.quote}</blockquote>
        )}
        {more.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {more.map((m) => (
              <button
                key={m.second}
                type="button"
                onClick={() => play(m.second)}
                aria-label={`עוד רגע בסרטון: ${clock(m.second)}`}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-ink-200 bg-white px-3 text-[0.8125rem] font-medium text-ink-700 transition-colors hover:border-primary-600 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                <Play aria-hidden="true" className="size-3 fill-current" />
                <span className="num">{clock(m.second)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
