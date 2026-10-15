import Link from 'next/link';
import { agoHe } from '@/lib/demo/format';
import { formatNis } from '@/lib/command/format';
import type { HotLead } from '@/lib/command/types';
import { ScoreChip } from './marks';

/**
 * Hot leads: score, ref, what we know about the project, source, age and the
 * expected value. No names, phones or emails here: the ref opens the lead.
 */
export default function HotLeadsList({ leads, emptyText }: { leads: readonly HotLead[]; emptyText: string }) {
  if (leads.length === 0) return <p className="text-sm text-ink-500">{emptyText}</p>;
  return (
    <ol className="divide-y divide-ink-100">
      {leads.map((lead) => {
        const details = [
          lead.stageLabel,
          lead.regionName,
          lead.sizeM2 ? `${lead.sizeM2} מ״ר` : null,
          lead.budgetLabel,
        ].filter((d): d is string => Boolean(d));
        const ref = (
          <bdi dir="ltr" className="font-mono text-sm font-semibold tracking-tight">
            {lead.ref}
          </bdi>
        );
        return (
          <li key={lead.id} className="relative flex gap-3 py-3 first:pt-0 last:pb-0">
            <ScoreChip score={lead.score} band={lead.band} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="min-w-0 text-ink-900">
                  {lead.href ? (
                    <Link
                      href={lead.href}
                      className="rounded hover:text-primary-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
                    >
                      {ref}
                    </Link>
                  ) : (
                    ref
                  )}
                  <span className="text-sm text-ink-600"> · {lead.typeLabel}</span>
                </p>
                <p className="text-xs text-ink-500">{agoHe(lead.minutesAgo)}</p>
              </div>
              <p className="mt-0.5 truncate text-sm text-ink-600" title={details.join(' · ')}>
                {details.length ? details.join(' · ') : 'עוד אין פרטי פרויקט'}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                <span>מקור: {lead.sourceLabel}</span>
                {lead.expectedValueAgorot > 0 && (
                  <span>
                    ערך צפוי <bdi dir="ltr" className="font-semibold text-ink-700">{formatNis(lead.expectedValueAgorot)}</bdi>
                  </span>
                )}
                {lead.scoreReasons.length > 0 && <span className="truncate">{lead.scoreReasons.join(' · ')}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
