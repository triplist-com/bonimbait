'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics/track';
import { claimImpression, watchViewability } from '@/lib/analytics/viewability';

type Props = {
  /**
   * Placement id, e.g. 'answer-sidebar' or 'hub-roadmap:windows'. Impressions
   * are deduped per slot and visitor for 30 minutes, so a slot that rotates
   * partners should include the partner in its id.
   */
  slot: string;
  partnerId: string;
  offerId?: string;
  placement?: string;
  /** Also record partner_click for links/buttons inside (default true). */
  trackClicks?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Wrap a sponsored partner slot to measure it:
 *
 *   <ViewableImpression slot="answer-sidebar" partnerId="partner-42" offerId="spring-sale">
 *     <PartnerCard ... />
 *   </ViewableImpression>
 *
 * Emits partner_impression once the slot is viewable (lib/analytics/viewability.ts:
 * >=50% visible for >=1s while the visitor is active) and partner_click on
 * clicks inside it. Renders a plain <div> wrapper.
 */
export default function ViewableImpression({
  slot,
  partnerId,
  offerId,
  placement,
  trackClicks = true,
  className,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return watchViewability(el, {
      onViewable: (visibleMs) => {
        if (!claimImpression(slot)) return;
        track('partner_impression', { slot, partner_id: partnerId, offer_id: offerId, placement, visible_ms: visibleMs });
      },
    });
  }, [slot, partnerId, offerId, placement]);

  const onClickCapture = trackClicks
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement | null)?.closest?.('a, button')) {
          track('partner_click', { slot, partner_id: partnerId, offer_id: offerId, placement });
        }
      }
    : undefined;

  return (
    <div ref={ref} className={className} data-bb-slot={slot} onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
