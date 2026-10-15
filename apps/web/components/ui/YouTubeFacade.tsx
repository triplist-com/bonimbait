'use client';

/**
 * YouTube player behind a facade: the poster renders immediately (and can be
 * the page's LCP image), the ~1 MB YouTube player loads only on click.
 * `start` sets the second to play from (the button then says "צפו מ-2:37");
 * `playing` lets a parent start playback, e.g. when a timestamp is clicked.
 *
 *   <YouTubeFacade youtubeId="9803SaFIvXM" title="…" poster={page.featured_image} priority />
 */
import { useState } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { SmartImage } from './SmartImage';

export interface YouTubeFacadeProps {
  youtubeId: string;
  title: string;
  /** Poster image; defaults to YouTube's hqdefault thumbnail. */
  poster?: string | null;
  /** Start second (from ?t= or a clicked timestamp). */
  start?: number;
  /** Controlled play request (the visitor clicked a timestamp elsewhere). */
  playing?: boolean;
  /** Above the fold: preload the poster with high priority. */
  priority?: boolean;
  className?: string;
}

export function youtubeEmbedUrl(id: string, start?: number): string {
  const params = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', playsinline: '1' });
  if (start && start > 0) params.set('start', String(Math.floor(start)));
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

export function YouTubeFacade({ youtubeId, title, poster, start, playing: playRequested, priority, className }: YouTubeFacadeProps) {
  const [clicked, setClicked] = useState(false);
  const playing = clicked || Boolean(playRequested);

  const from = start && start > 0 ? formatDuration(start) : null;

  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-3xl bg-ink-950 shadow-card', className)}>
      {playing ? (
        <iframe
          key={`${youtubeId}-${start ?? 0}`}
          src={youtubeEmbedUrl(youtubeId, start)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setClicked(true)}
          className="group absolute inset-0 block size-full focus-visible:outline-none"
          aria-label={from ? `הפעלת הסרטון מ-${from}: ${title}` : `הפעלת הסרטון: ${title}`}
        >
          <SmartImage
            src={poster || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
            alt=""
            priority={priority}
            sizes="(min-width: 1280px) 64rem, 100vw"
            className="transition-transform duration-700 ease-out group-hover:scale-[1.02]"
          />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-black/10" />
          <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full bg-white/95 py-2 pe-5 ps-2 shadow-lift transition-transform duration-300 group-hover:scale-105 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-white">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary-600 text-white shadow-brand sm:size-12">
              <Play aria-hidden="true" className="size-5 translate-x-[-1px] fill-current" />
            </span>
            <span className="text-[0.9375rem] font-bold text-ink-900">
              {from ? (
                <>
                  צפו מ-<span className="num">{from}</span>
                </>
              ) : (
                'צפו בסרטון'
              )}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
