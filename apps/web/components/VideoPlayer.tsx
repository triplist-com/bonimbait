'use client';

import { YouTubeFacade } from '@/components/ui/YouTubeFacade';

interface VideoPlayerProps {
  youtubeId: string;
  title?: string;
  /** Start second (deep link ?t= or a clicked timestamp). */
  startTime?: number;
  /** Start playback now (e.g. a timestamp was clicked). */
  playing?: boolean;
  poster?: string | null;
  priority?: boolean;
}

/** Video player for AI-indexed videos: a facade until played (see YouTubeFacade). */
export default function VideoPlayer({ youtubeId, title, startTime, playing, poster, priority = true }: VideoPlayerProps) {
  return <YouTubeFacade youtubeId={youtubeId} title={title || 'סרטון'} start={startTime} playing={playing} poster={poster} priority={priority} />;
}
