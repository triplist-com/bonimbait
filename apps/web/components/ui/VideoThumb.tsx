import Link from 'next/link';
import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { durationLabel, formatDuration } from '@/lib/format';

export interface VideoThumbProps {
  src: string | null | undefined;
  /** Usually empty: the card title names the video. */
  alt?: string;
  /** Seconds (or numeric string). Rendered as "9:03" in a corner pill. */
  duration?: number | string | null;
  /** Wrap the thumbnail in a link to this page. */
  href?: string;
  /** Accessible name when the thumb itself is the link. */
  linkLabel?: string;
  /** Corner label: "פודקאסט", "פרק 112", "חדש". */
  badge?: ReactNode;
  aspect?: 'video' | 'square' | 'portrait';
  /** Play button size. */
  size?: 'sm' | 'md' | 'lg';
  /** Above-the-fold: load eagerly with high fetch priority. */
  priority?: boolean;
  className?: string;
  /** Classes for the rounded frame (default rounded-2xl). */
  rounded?: string;
}

const PLAY_SIZES = {
  sm: 'size-10 [&_svg]:size-4',
  md: 'size-14 [&_svg]:size-5',
  lg: 'size-20 [&_svg]:size-7',
} as const;

const ASPECTS = {
  video: 'aspect-video',
  square: 'aspect-square',
  portrait: 'aspect-[9/16]',
} as const;

/**
 * Video/podcast thumbnail with a play affordance and duration. Server-safe.
 * The parent card is the hover `group`, so the play button reacts to the
 * whole card.
 */
export function VideoThumb({
  src,
  alt = '',
  duration,
  href,
  linkLabel,
  badge,
  aspect = 'video',
  size = 'md',
  priority,
  className,
  rounded = 'rounded-2xl',
}: VideoThumbProps) {
  const time = formatDuration(duration);
  const spoken = durationLabel(duration);
  const inner = (
    <>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from YouTube and Storage; native lazy loading keeps the quota free
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...(priority ? { fetchPriority: 'high' as const } : {})}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-ink-800 to-ink-950 bg-blueprint-dark" />
      )}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0" />
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-primary-600 shadow-lift',
          'transition-[transform,background-color,color] duration-300 ease-out group-hover:scale-110 group-hover:bg-primary-600 group-hover:text-white',
          PLAY_SIZES[size],
        )}
      >
        <Play className="translate-x-[-1px] fill-current" />
      </span>
      {badge && <span className="absolute start-3 top-3">{badge}</span>}
      {time && (
        <span className="num absolute bottom-2.5 end-2.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          <span aria-hidden="true">{time}</span>
          {spoken && <span className="sr-only">{`אורך: ${spoken}`}</span>}
        </span>
      )}
    </>
  );

  const frame = cn('group relative block overflow-hidden bg-ink-900 isolate', ASPECTS[aspect], rounded, className);
  if (href) {
    return (
      <Link href={href} aria-label={linkLabel} className={frame}>
        {inner}
      </Link>
    );
  }
  return <div className={frame}>{inner}</div>;
}
