import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';
import { DemoNotice } from '@/components/command/DemoNotice';
import LeadsAnalyticsView from '@/components/command/LeadsAnalyticsView';
import PeriodSelector from '@/components/command/PeriodSelector';
import { isEnabled } from '@/lib/flags';
import { buildLeadsAnalytics } from '@/lib/command/analytics';
import { demoLeadsAnalytics } from '@/lib/command/demo';
import { loadCommandInputs } from '@/lib/command/load';
import { parsePeriod } from '@/lib/command/period';
import type { PeriodDays } from '@/lib/command/types';

export const metadata: Metadata = { title: 'ניתוח לידים' };

/** Leads by source, campaign, type, stage, region and score band, and speed-to-lead. Editors and admins. */
export default async function LeadsAnalyticsPage({ searchParams }: { searchParams: { period?: string; demo?: string } }) {
  if (!isEnabled('commandCenter')) notFound();
  const period = parsePeriod(searchParams.period);
  const demo = searchParams.demo === '1';
  let data;
  if (demo) {
    data = demoLeadsAnalytics(period);
  } else {
    const inputs = await loadCommandInputs({ periodDays: period });
    data = buildLeadsAnalytics({
      now: inputs.now,
      periodDays: period,
      leads: inputs.leads,
      expectedValues: inputs.expectedValues,
      regionNames: inputs.regionNames,
      partnerNames: Object.fromEntries(inputs.partners.map((p) => [p.id, p.name])),
    });
  }
  const href = (days: PeriodDays) => `/admin/insights/leads/?${demo ? 'demo=1&' : ''}period=${days}`;

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        title="ניתוח לידים"
        description="מאיפה הלידים מגיעים, באיזה שלב ואזור הם נמצאים, איך הם מדורגים, וכמה מהר הצוות חוזר אליהם."
        back={{ href: `/admin/${demo ? '?demo=1' : ''}`, label: 'חדר הבקרה' }}
      />
      {demo && <DemoNotice exitHref={`/admin/insights/leads/?period=${period}`} />}
      <PeriodSelector current={period} href={href} />
      <LeadsAnalyticsView data={data} />
    </div>
  );
}
