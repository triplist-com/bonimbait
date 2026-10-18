'use client';

import { ArrowRight, Printer } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { track } from '@/lib/analytics/track';

/** Screen-only actions above the printable report. */
export default function ReportToolbar({ backHref, whatsappHref, estimateId }: { backHref: string; whatsappHref: string; estimateId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button
        onClick={() => {
          track('lead_cta_clicked', { cta: 'budget_report_print', placement: 'planner_report' });
          window.print();
        }}
        iconStart={<Printer />}
      >
        הדפיסו או שמרו כ-PDF
      </Button>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('planner_shared', { channel: 'whatsapp', placement: 'planner_report', estimate_id: estimateId })}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 text-[0.9375rem] font-semibold text-ink-950 transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
      >
        שתפו בוואטסאפ
      </a>
      <ButtonLink href={backHref} variant="ghost" iconStart={<ArrowRight className="ltr:rotate-180" />}>
        חזרה לתוצאה
      </ButtonLink>
    </div>
  );
}
