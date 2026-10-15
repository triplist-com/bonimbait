import type { Metadata } from 'next';
import PartnerReport from '@/components/revenue/report/PartnerReport';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { revenueDemo } from '@/lib/demo/fixtures/revenue';

export const metadata: Metadata = { title: 'דוח שותף' };
export const revalidate = 3600;

/**
 * "דוח שותף" for the fictional "חלונות הגליל": the automated case study, for
 * every partner, every month. The real report component on fixtures.
 */
export default function PartnerReportDemoPage() {
  const data = loadDemoFixture(revenueDemo);
  return (
    <div className="container-page py-8 sm:py-12">
      <PartnerReport data={data.partner.report} leads={data.partner.leads} demo />
    </div>
  );
}
