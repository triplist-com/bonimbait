/**
 * The Calendly inline embed posts its progress to the parent window
 * (`{ event: 'calendly.<name>', payload }`). Map the two funnel steps:
 *   calendly.date_and_time_selected -> consult_booking_started
 *   calendly.event_scheduled        -> consult_booked
 * Used by the consultation modal (components/leads/ConsultationCTA.tsx).
 */
import { useEffect } from 'react';
import { track } from './track';

const CALENDLY_ORIGIN = /^https:\/\/(?:[a-z0-9-]+\.)*calendly\.com$/i;

export type CalendlyFunnelEvent = 'consult_booking_started' | 'consult_booked';

export function isCalendlyOrigin(origin: string): boolean {
  return CALENDLY_ORIGIN.test(origin);
}

export function calendlyFunnelEvent(data: unknown): CalendlyFunnelEvent | null {
  const name = data && typeof data === 'object' ? (data as { event?: unknown }).event : undefined;
  if (name === 'calendly.date_and_time_selected') return 'consult_booking_started';
  if (name === 'calendly.event_scheduled') return 'consult_booked';
  return null;
}

/** While `active`, record the embed's booking steps for `source`. */
export function useCalendlyTracking(source: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onMessage = (e: MessageEvent) => {
      if (!isCalendlyOrigin(e.origin)) return;
      const name = calendlyFunnelEvent(e.data);
      if (name === 'consult_booking_started') track(name, { source, method: 'calendly' });
      else if (name === 'consult_booked') track(name, { source, method: 'calendly' });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [source, active]);
}
