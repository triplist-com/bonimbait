'use client';

import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ContentSummary from '@/components/ContentSummary';
import VideoPlayer from '@/components/VideoPlayer';
import { formatTimestamp } from '@/lib/types';
import type { CostItem, KeyPoint } from '@/lib/types';

interface Chapter {
  title: string;
  start_s: number;
}

interface Props {
  youtubeId: string;
  title: string;
  chapters: Chapter[];
  summary: string;
  keyPoints: KeyPoint[];
  costs: CostItem[];
  tips: string[];
  warnings: string[];
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Player + chapters + AI summary of a Content Autopilot video. Chapters and
 * timestamped key points seek the player (the existing VideoPlayer restarts at
 * the chosen second); `?t=` from search results sets the start.
 */
export default function RuntimeVideoView({ youtubeId, title, chapters, summary, keyPoints, costs, tips, warnings }: Props) {
  const searchParams = useSearchParams();
  const initial = Math.max(0, parseInt(searchParams.get('t') || '0', 10) || 0);
  const [time, setTime] = useState(initial);
  // Remount the player on every seek, so clicking the same chapter again re-seeks.
  const [seekCount, setSeekCount] = useState(0);
  const playerRef = useRef<HTMLDivElement>(null);

  const seek = useCallback((seconds: number) => {
    setTime(Math.max(0, Math.floor(seconds)));
    setSeekCount((n) => n + 1);
    playerRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }, []);

  // The chapter that contains the current start time.
  let active = -1;
  chapters.forEach((c, i) => {
    if (c.start_s <= time) active = i;
  });

  return (
    <>
      <div className={chapters.length > 0 ? 'grid gap-6 lg:grid-cols-3 lg:items-start' : ''}>
        <div ref={playerRef} className="lg:col-span-2 scroll-mt-24">
          <VideoPlayer key={seekCount} youtubeId={youtubeId} title={title} startTime={time} />
        </div>

        {chapters.length > 0 && (
          <nav aria-labelledby="chapters-heading" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
            <h2 id="chapters-heading" className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900">
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
              </svg>
              פרקים בסרטון
            </h2>
            <ol className="space-y-1">
              {chapters.map((c, i) => (
                <li key={`${c.start_s}-${i}`}>
                  <button
                    type="button"
                    onClick={() => seek(c.start_s)}
                    aria-current={i === active ? 'true' : undefined}
                    aria-label={`צפו מדקה ${formatTimestamp(c.start_s)}: ${c.title}`}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 ${
                      i === active ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span dir="ltr" className="mt-0.5 shrink-0 font-mono text-xs font-semibold text-primary">
                      {formatTimestamp(c.start_s)}
                    </span>
                    <span className="leading-snug">{c.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>

      <div className="mt-8">
        <ContentSummary
          summary={summary}
          keyPoints={keyPoints}
          costs={costs}
          tips={tips}
          warnings={warnings}
          variant="full"
          onTimestampClick={seek}
        />
      </div>
    </>
  );
}
