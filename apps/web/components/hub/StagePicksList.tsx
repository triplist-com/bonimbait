import Link from 'next/link';
import { FileText } from 'lucide-react';
import { VideoThumb } from '@/components/ui/VideoThumb';
import type { StagePicks } from '@/lib/hub/types';
import { cn } from '@/lib/cn';

/** A stage's top videos and articles. Server-safe. */
export function StagePicksList({
  picks,
  videos = 2,
  articles = 2,
  className,
}: {
  picks: StagePicks | undefined;
  videos?: number;
  articles?: number;
  className?: string;
}) {
  const v = picks?.videos.slice(0, videos) ?? [];
  const a = picks?.articles.slice(0, articles) ?? [];
  if (!v.length && !a.length) return null;
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {v.map((video) => (
        <Link
          key={video.youtubeId}
          href={`/video/${video.youtubeId}/`}
          prefetch={false}
          className="group flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-2 pe-3 transition-shadow hover:shadow-card-hover"
        >
          <VideoThumb
            src={video.thumbnailUrl}
            duration={video.durationSeconds}
            size="sm"
            className="w-28 shrink-0"
            rounded="rounded-xl"
            sizes="112px"
          />
          <span className="min-w-0">
            <span className="block text-caption font-semibold text-primary-700">{video.kind === 'podcast' ? 'פודקאסט' : 'סרטון'}</span>
            <span className="line-clamp-2 text-body-sm font-semibold leading-snug text-ink-900 group-hover:text-primary-700">{video.title}</span>
          </span>
        </Link>
      ))}
      {a.map((article) => (
        <Link
          key={article.slug}
          href={`/${article.slug}/`}
          prefetch={false}
          className="group flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-3 transition-shadow hover:shadow-card-hover"
        >
          <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-sand-800">
            <FileText className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-caption font-semibold text-primary-700">מדריך</span>
            <span className="line-clamp-2 text-body-sm font-semibold leading-snug text-ink-900 group-hover:text-primary-700">{article.title}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
