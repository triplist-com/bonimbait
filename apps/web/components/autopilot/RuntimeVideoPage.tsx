import { Suspense } from 'react';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import VideoGrid from '@/components/VideoGrid';
import Breadcrumbs from '@/components/content/Breadcrumbs';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import SaveButton from '@/components/hub/SaveButton';
import { stageLabel } from '@/lib/autopilot/summary';
import { isEnabled } from '@/lib/flags';
import type { RuntimeVideo } from '@/lib/autopilot/videos';
import { formatHebrewDate } from '@/lib/content/seo';
import { absoluteUrl } from '@/lib/site';
import { formatTimestamp } from '@/lib/types';
import type { Video } from '@/lib/types';
import AskAboutVideo from './AskAboutVideo';
import RuntimeVideoView from './RuntimeVideoView';

function isoDuration(seconds: number | null): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s}S`;
}

/**
 * /video/<youtube-id>/ for a video published by Content Autopilot: the same
 * building blocks as the static AI video page (VideoPlayer, ContentSummary),
 * plus chapters with click-to-seek and "ask about this video". Server-rendered,
 * with VideoObject + Clip ("key moments") structured data.
 */
export default function RuntimeVideoPage({ video, related }: { video: RuntimeVideo; related: Video[] }) {
  const path = `/video/${video.youtube_id}/`;
  const s = video.summary;
  const stage = stageLabel(s.stage);
  const description = s.summary || `צפו בסרטון "${video.title}" - בונים בית`;
  const chapters = s.chapters;
  const duration = video.duration_s;

  return (
    <div className="pb-16">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'VideoObject',
          name: video.title,
          description,
          thumbnailUrl: [video.thumbnail_url],
          uploadDate: video.published_at ?? undefined,
          duration: isoDuration(duration),
          embedUrl: `https://www.youtube.com/embed/${video.youtube_id}`,
          contentUrl: `https://www.youtube.com/watch?v=${video.youtube_id}`,
          url: absoluteUrl(path),
          inLanguage: 'he-IL',
          hasPart: chapters.map((c, i) => ({
            '@type': 'Clip',
            name: c.title,
            startOffset: c.start_s,
            endOffset: chapters[i + 1]?.start_s ?? duration ?? undefined,
            url: `https://www.youtube.com/watch?v=${video.youtube_id}&t=${c.start_s}`,
          })),
        }}
      />

      <div className="container-page max-w-5xl pt-6 sm:pt-10">
        <Breadcrumbs
          crumbs={[
            { label: 'ראשי', href: '/' },
            { label: 'סרטונים', href: '/videos/' },
            { label: video.title, href: path },
          ]}
        />

        <header className="mt-6 mb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/category/${video.category_slug}/`}
              className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary-100"
            >
              {video.category_name}
            </Link>
            {stage && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{stage}</span>}
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-xs font-semibold text-secondary-800">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              סיכום AI עם חותמות זמן
            </span>
          </div>
          <h1 className="text-2xl font-bold leading-tight text-gray-900 sm:text-3xl lg:text-4xl">{video.title}</h1>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
            <span>בונים בית</span>
            {video.published_at && (
              <>
                <span aria-hidden="true" className="text-gray-300">
                  |
                </span>
                <time dateTime={video.published_at}>{formatHebrewDate(video.published_at)}</time>
              </>
            )}
            {duration ? (
              <>
                <span aria-hidden="true" className="text-gray-300">
                  |
                </span>
                <span>
                  <span className="sr-only">אורך: </span>
                  <span dir="ltr">{formatTimestamp(duration)}</span>
                </span>
              </>
            ) : null}
          </p>
          {isEnabled('hub') && <SaveButton kind="video" refId={video.youtube_id} title={video.title} className="mt-4" />}
        </header>

        <Suspense fallback={<div className="skeleton aspect-video w-full rounded-2xl" />}>
          <RuntimeVideoView
            youtubeId={video.youtube_id}
            title={video.title}
            chapters={chapters}
            summary={s.summary}
            keyPoints={s.key_points.map((k) => ({ text: k.text, timestamp: k.start_s ?? undefined }))}
            costs={s.costs}
            tips={s.tips}
            warnings={s.warnings}
          />
        </Suspense>

        <AskAboutVideo questions={s.suggested_questions} />

        <div className="mt-12">
          <ConsultationCTA variant="card" source="video-page" />
        </div>

        {related.length > 0 && (
          <div className="mt-14">
            <VideoGrid videos={related} title={`עוד בנושא ${video.category_name}`} />
          </div>
        )}
      </div>
    </div>
  );
}
