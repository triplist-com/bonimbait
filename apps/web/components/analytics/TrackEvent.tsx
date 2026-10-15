'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics/track';
import type { EventName, EventProps } from '@/lib/analytics/events';

/**
 * Fire one analytics event when this mounts, from a Server Component page:
 *
 *   <TrackEvent name="pro_profile_view" props={{ business_id: business.id }} />
 *
 * Works on static/ISR pages (it runs in the browser). Fires once per distinct
 * name + props; renders nothing.
 */
export default function TrackEvent<N extends EventName>({ name, props }: { name: N; props?: EventProps<N> }) {
  const sentKey = useRef<string | null>(null);
  const key = `${name}:${JSON.stringify(props ?? {})}`;

  useEffect(() => {
    if (sentKey.current === key) return;
    sentKey.current = key;
    (track as (n: EventName, p?: unknown) => void)(name, props);
  }, [key, name, props]);

  return null;
}
