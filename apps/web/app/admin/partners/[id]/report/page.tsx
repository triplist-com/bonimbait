import { notFound } from 'next/navigation';
import PartnerReport from '@/components/revenue/report/PartnerReport';
import { isEnabled } from '@/lib/flags';
import { revenueUserDb } from '@/lib/revenue/db';
import { currentMonth, isMonth, loadPartnerReport, recentMonths } from '@/lib/revenue/report-server';

export const metadata = { title: 'דוח שותף' };

/** Any partner's monthly report, for staff (to review it or send it to the partner). */
export default async function AdminPartnerReportPage({ params, searchParams }: { params: { id: string }; searchParams: { m?: string } }) {
  if (!isEnabled('revenue') || !/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const month = isMonth(searchParams.m) ? searchParams.m : currentMonth();
  const page = await loadPartnerReport(revenueUserDb(), params.id, month);
  if (!page) notFound();
  return (
    <div className="max-w-6xl">
      <PartnerReport
        data={page.report}
        leads={page.leads}
        months={recentMonths(6)}
        monthHref={(m) => `/admin/partners/${params.id}/report/?m=${m}`}
        readOnly
      />
    </div>
  );
}
