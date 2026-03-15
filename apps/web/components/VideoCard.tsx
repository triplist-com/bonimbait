import Link from 'next/link';
import Image from 'next/image';
import type { Video } from '@/lib/types';
import { formatDuration, thumbnailUrl } from '@/lib/types';

interface VideoCardProps {
  video: Video;
  snippet?: string;
}

export default function VideoCard({ video, snippet }: VideoCardProps) {
  const thumb = video.thumbnail_url || thumbnailUrl(video.youtube_id);

  return (
    <Link href={`/video/${video.id}`} className="group block">
      <div className="bg-white rounded-xl overflow-hidden shadow-card border border-gray-100 hover:shadow-card-hover transition-all duration-200 hover:-translate-y-1">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-gray-100 overflow-hidden">
          <Image
            src={thumb}
            alt={`תמונה ממוזערת של הסרטון: ${video.title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/10">
            <div className="w-14 h-14 bg-primary/90 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm">
              <svg
                className="w-6 h-6 text-white ms-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          {/* Duration badge */}
          <div className="absolute bottom-2 left-2 bg-black/80 text-white text-xs font-medium px-2 py-0.5 rounded">
            {formatDuration(video.duration_seconds)}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 text-sm leading-relaxed line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {video.title}
          </h3>
          {snippet && (
            <p className="text-xs text-gray-500 line-clamp-2 mb-2">{snippet}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{video.channel_name}</span>
            <span className="inline-block text-xs bg-primary-50 text-primary-700 font-medium px-2.5 py-1 rounded-full">
              {video.category_name}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
