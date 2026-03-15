'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import VideoPlayer from '@/components/VideoPlayer';
import VideoGrid from '@/components/VideoGrid';
import CostTable from '@/components/CostTable';
import StructuredData from '@/components/StructuredData';
import { VideoGridSkeleton } from '@/components/Skeleton';
import { getVideoDetail, getRelatedVideos } from '@/lib/api';
import { formatTimestamp, thumbnailUrl as getThumbUrl } from '@/lib/types';
import type { VideoDetail as VideoDetailType, Video } from '@/lib/types';

function VideoContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const startTime = parseInt(searchParams.get('t') || '0', 10);

  const [video, setVideo] = useState<VideoDetailType | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openTranscript, setOpenTranscript] = useState(false);
  const [playerTime, setPlayerTime] = useState(startTime);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.allSettled([getVideoDetail(id), getRelatedVideos(id)]).then(
      ([videoResult, relatedResult]) => {
        if (cancelled) return;
        if (videoResult.status === 'fulfilled') setVideo(videoResult.value);
        if (relatedResult.status === 'fulfilled') setRelated(relatedResult.value);
        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (isLoading) {
    return (
      <div className="container-page pt-8">
        <div className="skeleton w-full aspect-video rounded-2xl mb-6" />
        <div className="skeleton h-8 w-3/4 mb-4" />
        <div className="skeleton h-4 w-48 mb-8" />
        <VideoGridSkeleton count={3} />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="container-page py-16 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">הסרטון לא נמצא</h2>
        <p className="text-gray-500 mb-6">הסרטון שחיפשתם אינו קיים במערכת</p>
        <Link
          href="/"
          className="inline-block bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          חזרה לדף הבית
        </Link>
      </div>
    );
  }

  const thumb = video.thumbnail_url || getThumbUrl(video.youtube_id);

  return (
    <div className="container-page">
      {/* VideoObject structured data */}
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'VideoObject',
          name: video.title,
          description: video.summary || `סרטון בנושא ${video.category_name}`,
          thumbnailUrl: thumb,
          uploadDate: video.published_at,
          duration: `PT${Math.floor(video.duration_seconds / 60)}M${video.duration_seconds % 60}S`,
          embedUrl: `https://www.youtube.com/embed/${video.youtube_id}`,
          contentUrl: `https://www.youtube.com/watch?v=${video.youtube_id}`,
        }}
      />

      <section className="pt-8 pb-4">
        {/* Breadcrumbs */}
        <nav aria-label="מיקום בניווט" className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-primary transition-colors">
            דף הבית
          </Link>
          <span className="text-gray-300" aria-hidden="true">/</span>
          <Link
            href={`/category/${video.category_slug}`}
            className="hover:text-primary transition-colors"
          >
            {video.category_name}
          </Link>
          <span className="text-gray-300" aria-hidden="true">/</span>
          <span className="text-gray-900 line-clamp-1">{video.title}</span>
        </nav>

        {/* Video Player */}
        <VideoPlayer
          youtubeId={video.youtube_id}
          title={video.title}
          startTime={playerTime}
        />

        {/* Video Info */}
        <div className="mt-6 mb-8">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-2xl font-bold text-gray-900">{video.title}</h1>
            <Link
              href={`/category/${video.category_slug}`}
              className="inline-block text-sm bg-primary-50 text-primary-700 font-medium px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-primary-100 transition-colors flex-shrink-0"
            >
              {video.category_name}
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>{video.channel_name}</span>
            <span className="text-gray-300" aria-hidden="true">|</span>
            <span>{formatTimestamp(video.duration_seconds)}</span>
            {video.published_at && (
              <>
                <span className="text-gray-300" aria-hidden="true">|</span>
                <span>
                  {new Date(video.published_at).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </>
            )}
          </div>
        </div>

        {/* AI Summary */}
        {video.summary && (
          <div className="bg-primary-50/50 border border-primary-100 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              סיכום AI
            </h2>
            <p className="text-gray-700 leading-relaxed text-sm">{video.summary}</p>
          </div>
        )}

        {/* Key Points */}
        {video.key_points && video.key_points.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">נקודות מפתח</h2>
            <ul className="space-y-3">
              {video.key_points.map((kp, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary-50 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <span className="text-sm text-gray-700">{kp.text}</span>
                    {kp.timestamp !== undefined && kp.timestamp > 0 && (
                      <button
                        onClick={() => setPlayerTime(kp.timestamp!)}
                        className="ms-2 text-xs text-primary hover:underline"
                        aria-label={`דלג לדקה ${formatTimestamp(kp.timestamp)}`}
                      >
                        {formatTimestamp(kp.timestamp)}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cost Table */}
        {video.costs_data && video.costs_data.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">נתוני עלויות</h2>
            <CostTable items={video.costs_data} />
          </div>
        )}

        {/* Tips */}
        {video.tips && video.tips.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              טיפים
            </h2>
            <ul className="space-y-2">
              {video.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                  <span className="text-green-500 mt-1 flex-shrink-0" aria-hidden="true">&#x2713;</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {video.warnings && video.warnings.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              אזהרות
            </h2>
            <ul className="space-y-2" role="alert">
              {video.warnings.map((warning, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                  <span className="text-red-500 mt-1 flex-shrink-0" aria-hidden="true">!</span>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Transcript Accordion */}
        {video.segments && video.segments.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
            <button
              onClick={() => setOpenTranscript(!openTranscript)}
              className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              aria-expanded={openTranscript}
              aria-controls="transcript-panel"
            >
              <h2 className="text-lg font-bold text-gray-900">תמליל הסרטון</h2>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${
                  openTranscript ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openTranscript && (
              <div id="transcript-panel" className="px-6 pb-6 space-y-1 max-h-96 overflow-y-auto">
                {video.segments.map((seg) => (
                  <button
                    key={seg.id}
                    onClick={() => setPlayerTime(seg.start_time)}
                    className="w-full flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-primary-50 transition-colors text-right group"
                    aria-label={`דלג לדקה ${formatTimestamp(seg.start_time)}: ${seg.text.substring(0, 50)}`}
                  >
                    <span className="text-xs text-primary font-mono font-medium mt-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100">
                      {formatTimestamp(seg.start_time)}
                    </span>
                    <span className="text-sm text-gray-700 leading-relaxed">
                      {seg.text}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Related Videos */}
      {related.length > 0 && (
        <section className="pb-16" aria-label="סרטונים קשורים">
          <VideoGrid videos={related} title="סרטונים קשורים" />
        </section>
      )}
    </div>
  );
}

export default function VideoPageClient() {
  return (
    <Suspense
      fallback={
        <div className="container-page pt-8">
          <div className="skeleton w-full aspect-video rounded-2xl mb-6" />
          <div className="skeleton h-8 w-3/4 mb-4" />
          <div className="skeleton h-4 w-48 mb-8" />
          <VideoGridSkeleton count={3} />
        </div>
      }
    >
      <VideoContent />
    </Suspense>
  );
}
