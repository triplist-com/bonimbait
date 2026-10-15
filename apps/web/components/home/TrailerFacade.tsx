'use client';

/**
 * The channel trailer as a facade: the owner's poster (LCP image, served by
 * next/image with priority) and a play button. The YouTube player (about
 * 1 MB of script) loads only after a click, from youtube-nocookie.com.
 * Replaces /promo.mp4, whose first frame was a near-black navy gradient, so
 * the hero showed a dark box before playback (and 23 MB of video).
 */
import { useState } from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TrailerFacadeProps {
  youtubeId: string;
  title: string;
  poster: string;
  posterWidth: number;
  posterHeight: number;
  /** Text next to the play button. */
  cta?: string;
  className?: string;
  priority?: boolean;
}

export default function TrailerFacade({
  youtubeId,
  title,
  poster,
  posterWidth,
  posterHeight,
  cta = 'צפו בסרטון',
  className,
  priority = true,
}: TrailerFacadeProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={cn('relative aspect-[16/10] overflow-hidden rounded-[1.75rem] bg-ink-100 shadow-lift ring-1 ring-ink-900/5', className)}>
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 block size-full text-start focus-visible:outline-none"
          aria-label={`${cta}: ${title}`}
        >
          <Image
            src={poster}
            alt=""
            width={posterWidth}
            height={posterHeight}
            priority={priority}
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink-950/55 via-ink-950/0 to-ink-950/0" />
          <span className="absolute bottom-10 end-4 inline-flex items-center gap-3 rounded-full bg-white/95 py-2 pe-5 ps-2 shadow-lift backdrop-blur transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary-600 lg:bottom-5 lg:end-5">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary-600 text-white shadow-brand sm:size-11">
              <Play aria-hidden="true" className="size-4 translate-x-[-1px] fill-current sm:size-5" />
            </span>
            <span className="text-sm font-bold text-ink-900 sm:text-[0.9375rem]">{cta}</span>
          </span>
        </button>
      )}
    </div>
  );
}
