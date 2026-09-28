'use client';

import { useRef, type MouseEvent, type ReactNode } from 'react';
import ConsultationCTA from '@/components/leads/ConsultationCTA';

/**
 * Makes migrated in-content popup triggers (`<a data-bb-cta="consultation">`,
 * from Elementor `data-bb-action="lead-popup"`) open the consultation modal of
 * the Leads workstream's <ConsultationCTA>.
 *
 * ConsultationCTA has no imperative "open" API, so a visually hidden instance
 * is mounted here and its button is clicked. Its <dialog> renders in the top
 * layer, so the visually hidden wrapper does not affect the modal. Without JS
 * the links keep their Calendly href.
 */
export default function LeadPopupBridge({ children, source }: { children: ReactNode; source: string }) {
  const ctaRef = useRef<HTMLDivElement>(null);

  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest('a[data-bb-cta="consultation"]');
    if (!link) return;
    const button = ctaRef.current?.querySelector('button');
    if (!button) return;
    e.preventDefault();
    button.click();
  }

  return (
    <div onClickCapture={onClickCapture}>
      {children}
      <div ref={ctaRef} className="sr-only">
        <ConsultationCTA source={source} />
      </div>
    </div>
  );
}
