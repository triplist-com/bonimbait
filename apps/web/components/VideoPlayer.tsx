'use client';

import { YouTubeFacade } from '@/components/ui/YouTubeFacade';

interface VideoPlayerProps {
  youtubeId: string;
  title?: string;
  /** Start second; changing it after load starts playback there. */
  startTime?: number;
  poster?: string | null;
  priority?: boolean;
}

/** Video player for AI-indexed videos: a facade until played (see YouTubeFacade). */
export default function VideoPlayer({ youtubeId, title, startTime, poster, priority = true }: VideoPlayerProps) {
  return <YouTubeFacade youtubeId={youtubeId} title={title || 'סרטון'} start={startTime} poster={poster} priority={priority} />;
}
