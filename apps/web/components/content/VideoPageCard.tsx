import Link from 'next/link';
import type { VideoPageSummary } from '@/lib/db/videos';
import { formatHebrewDate } from '@/lib/content/seo';

function thumbOf(v: VideoPageSummary): string | null {
  if (v.featured_image) return v.featured_image;
  const id = v.youtube_ids?.[0];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Card for a legacy /video/<slug>/ page (videos and podcast episodes). */
export default function VideoPageCard({ video }: { video: VideoPageSummary }) {
  const thumb = thumbOf(video);
  return (
    <article className="group relative flex flex-col bg-white rounded-2xl border border-gray-100 shadow-card hover:shadow-card-hover transition-shadow overflow-hidden">
      <div className="relative aspect-video bg-gray-900 overflow-hidden">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.03]"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="w-12 h-12 rounded-full bg-white/90 text-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.14v13.72L19 12 8 5.14z" />
            </svg>
          </span>
        </span>
        {video.kind === 'podcast' && (
          <span className="absolute top-3 start-3 text-xs font-semibold bg-secondary text-white px-2.5 py-1 rounded-full">
            פודקאסט
          </span>
        )}
      </div>
      <div className="flex flex-col flex-1 p-4">
        <h3 className="font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          <Link href={`/video/${video.legacy_slug}/`} className="after:absolute after:inset-0">
            {video.title}
          </Link>
        </h3>
        {video.published_at && (
          <time dateTime={video.published_at} className="mt-auto pt-2 text-xs text-gray-400">
            {formatHebrewDate(video.published_at)}
          </time>
        )}
      </div>
    </article>
  );
}
