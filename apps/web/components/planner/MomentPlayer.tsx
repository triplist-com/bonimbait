'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import Link from 'next/link';
import { YouTubeFacade } from '@/components/ui/YouTubeFacade';
import { track } from '@/lib/analytics/track';
import { momentClock, momentHref, type VideoMoment } from '@/lib/planner/warnings';

/**
 * One tap plays the exact podcast moment inline (no navigation, no player
 * until asked): the button reveals the YouTube facade already playing from
 * `moment.start`.
 */
export default function MomentPlayer({ moment, title, source = 'planner_warning' }: { moment: VideoMoment; title: string; source?: string }) {
  const [open, setOpen] = useState(false);
  const clock = momentClock(moment.start);

  if (open) {
    return (
      <div className="mt-4">
        <YouTubeFacade youtubeId={moment.youtubeId} title={title} start={moment.start} playing className="rounded-2xl" />
        <p className="mt-2 text-sm text-ink-600">
          {moment.episode} · מדקה <span className="num">{clock}</span> ·{' '}
          <Link href={momentHref(moment)} className="font-semibold text-primary underline-offset-4 hover:underline">
            לעמוד הפרק
          </Link>
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setOpen(true);
        track('video_play', { youtube_id: moment.youtubeId, start: moment.start, source });
      }}
      className="mt-4 inline-flex min-h-11 w-full items-center gap-3 rounded-2xl border border-ink-200 bg-white px-3 py-2 text-start transition-colors hover:border-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 sm:w-auto"
    >
      <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white shadow-brand">
        <Play className="size-4 translate-x-[-1px] fill-current" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-bold text-ink-900">{moment.label}</span>
        <span className="text-xs text-ink-600">
          {moment.episode} · מדקה <span className="num">{clock}</span>
        </span>
      </span>
    </button>
  );
}
