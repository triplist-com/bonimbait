'use client';

/**
 * YouTubeFacade that honours ?t=<seconds> (key-moment links, shared moments).
 * Read after mount, not via useSearchParams, so static/ISR pages keep their
 * server HTML.
 */
import { useEffect, useState } from 'react';
import { YouTubeFacade, type YouTubeFacadeProps } from '@/components/ui/YouTubeFacade';

export function startFromSearch(search: string): number | undefined {
  const t = Number.parseInt(new URLSearchParams(search).get('t') ?? '', 10);
  return Number.isFinite(t) && t > 0 ? t : undefined;
}

export default function DeepLinkFacade(props: YouTubeFacadeProps) {
  const [start, setStart] = useState<number | undefined>(props.start);
  useEffect(() => {
    const t = startFromSearch(window.location.search);
    if (t) setStart(t);
  }, []);
  return <YouTubeFacade {...props} start={start} />;
}
