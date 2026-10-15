import Link from 'next/link';
import type { VideoPageSummary } from '@/lib/db/videos';
import { formatHebrewDate } from '@/lib/content/seo';
import { VideoThumb } from '@/components/ui/VideoThumb';
import { Badge } from '@/components/ui/Badge';
import { episodeNumber } from '@/lib/format';

function thumbOf(v: VideoPageSummary): string | null {
  if (v.featured_image) return v.featured_image;
  const id = v.youtube_ids?.[0];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Card for a legacy /video/<slug>/ page (videos and podcast episodes). */
export default function VideoPageCard({ video }: { video: VideoPageSummary }) {
  const episode = video.kind === 'podcast' ? episodeNumber(video.title) : null;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
      <VideoThumb
        src={thumbOf(video)}
        rounded="rounded-none"
        size="sm"
        badge={
          video.kind === 'podcast' ? (
            <Badge tone="ink" size="sm">
              {episode ? `פודקאסט · פרק ${episode}` : 'פודקאסט'}
            </Badge>
          ) : undefined
        }
      />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="line-clamp-2 text-title-sm leading-snug text-ink-900 transition-colors group-hover:text-primary-700">
          <Link href={`/video/${video.legacy_slug}/`} className="after:absolute after:inset-0 after:content-['']">
            {video.title}
          </Link>
        </h3>
        {video.published_at && (
          <time dateTime={video.published_at} className="mt-auto pt-3 text-xs text-ink-500">
            {formatHebrewDate(video.published_at)}
          </time>
        )}
      </div>
    </article>
  );
}
