import Link from 'next/link';
import Image from 'next/image';
import type { Video } from '@/lib/types';
import { formatDuration, formatTimestamp, thumbnailUrl } from '@/lib/types';

interface VideoCardProps {
  video: Video;
  snippet?: string;
  /** When present, the card links to the video at this timestamp and shows a timestamp badge */
  matchingSegmentTime?: number;
  /** Pre-generated thumbnail URL for the matching segment timestamp (served by the API) */
  segmentThumbnailUrl?: string;
}

export default function VideoCard({ video, snippet, matchingSegmentTime, segmentThumbnailUrl }: VideoCardProps) {
  // Priority: segment thumbnail from API > video thumbnail > YouTube fallback
  const thumb = segmentThumbnailUrl || video.thumbnail_url || thumbnailUrl(video.youtube_id);

  // Link to internal video page; append timestamp anchor when available
  const href =
    matchingSegmentTime != null
      ? `/video/${video.id}?t=${Math.floor(matchingSegmentTime)}`
      : `/video/${video.id}`;

  // Badge shows segment timestamp when available, otherwise video duration
  const badgeText =
    matchingSegmentTime != null
      ? formatTimestamp(matchingSegmentTime)
      : formatDuration(video.duration_seconds);

  return (
    <Link href={href} className="group block">
      <div className="bg-white rounded-xl overflow-hidden shadow-card border border-gray-100 hover:shadow-card-hover transition-all duration-200 hover:-translate-y-1">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-gray-100 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt={`תמונה ממוזערת של הסרטון: ${video.title}`}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
          {/* Timestamp / Duration badge */}
          <div className="absolute bottom-2 left-2 bg-black/80 text-white text-xs font-medium px-2 py-0.5 rounded">
            {badgeText}
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
          {!snippet && video.summary && (
            <p className="text-xs text-gray-400 line-clamp-2 mb-2">{video.summary}</p>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">{video.channel_name}</span>
              {(video.costs_count ?? 0) > 0 && (
                <span className="text-2xs bg-secondary-50 text-secondary-700 font-medium px-1.5 py-0.5 rounded-full">
                  ₪ עלויות
                </span>
              )}
              {(video.tips_count ?? 0) > 0 && (
                <span className="text-2xs bg-green-50 text-green-700 font-medium px-1.5 py-0.5 rounded-full">
                  {video.tips_count} טיפים
                </span>
              )}
            </div>
            <span className="inline-block text-xs bg-primary-50 text-primary-700 font-medium px-2.5 py-1 rounded-full">
              {video.category_name}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
