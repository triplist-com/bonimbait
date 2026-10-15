import { notFound } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';
import { isEnabled } from '@/lib/flags';
import { param } from '@/components/admin/AdminPagination';
import ConsultQueue from '@/components/revenue/ConsultQueue';
import { runConsultAction } from '@/lib/revenue/actions/consult';
import { loadConsultQueue } from '@/lib/revenue/consult-queue';
import { isConsultStage, type ConsultStage } from '@/lib/revenue/consult-workflow';
import { revenueUserDb } from '@/lib/revenue/db';

export const metadata = { title: 'תור הייעוצים' };

const BASE = '/admin/consult-queue/';

function href(q: { tab?: ConsultStage; lead?: string | null }): string {
  const params = new URLSearchParams();
  if (q.tab && q.tab !== 'queue') params.set('tab', q.tab);
  if (q.lead) params.set('lead', q.lead);
  const qs = params.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

/**
 * תור הייעוצים: consultation leads sorted by score, each with its project
 * file. "צורי יודע מי מתקשר, מה הוא שאל ובאיזה שלב הוא, לפני שהרים טלפון".
 */
export default async function ConsultQueuePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!isEnabled('revenue')) notFound();
  const rawTab = param(searchParams.tab);
  const tab: ConsultStage = isConsultStage(rawTab) && rawTab !== 'spam' ? rawTab : 'queue';
  const leadParam = param(searchParams.lead) ?? null;
  const data = await loadConsultQueue(revenueUserDb(), { tab, selectedId: leadParam });

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="תור הייעוצים"
        description="פניות לפגישת ייעוץ לפי ציון: מי פונה, מה שאל, באיזה שלב ובאיזה תקציב, לפני שמרימים טלפון."
      />
      <ConsultQueue
        tab={data.tab}
        counts={data.counts}
        items={data.items}
        selected={data.selected}
        now={new Date().toISOString()}
        hrefFor={href}
        focus={Boolean(leadParam)}
        action={runConsultAction}
        fullRecordHref={(id) => `/admin/leads/${id}/`}
      />
    </div>
  );
}
