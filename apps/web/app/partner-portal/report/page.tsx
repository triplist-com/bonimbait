import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import PartnerReport from '@/components/revenue/report/PartnerReport';
import { getProfile } from '@/lib/auth/session';
import { listOwnedBusinesses } from '@/lib/db/businesses';
import { isEnabled } from '@/lib/flags';
import { createClient } from '@/lib/supabase/server';
import { reportDealAction } from '@/lib/revenue/actions/portal';
import { revenueUserDb } from '@/lib/revenue/db';
import { currentMonth, isMonth, loadPartnerReport, recentMonths } from '@/lib/revenue/report-server';

export const metadata: Metadata = { title: { absolute: 'דוח שותף - בונים בית' }, robots: { index: false, follow: false } };

/** The partner's own monthly report (owners only; the metric RPC enforces it too). */
export default async function PartnerReportPage({ searchParams }: { searchParams: { b?: string; m?: string } }) {
  if (!isEnabled('revenue')) notFound();
  const profile = await getProfile();
  if (!profile) redirect('/login/?next=%2Fpartner-portal%2Freport%2F');
  const owned = await listOwnedBusinesses(createClient(), profile.id);
  const business = owned.find((b) => b.id === searchParams.b) ?? owned[0];
  if (!business) redirect('/partner-portal/');
  const month = isMonth(searchParams.m) ? searchParams.m : currentMonth();
  const page = await loadPartnerReport(revenueUserDb(), business.id, month);
  if (!page) notFound();

  return (
    <div className="container-page py-8 sm:py-12">
      <Link href={`/partner-portal/?b=${business.id}`} className="mb-4 inline-block text-sm font-semibold text-primary-700 hover:underline print:hidden">
        → חזרה לניהול העסק
      </Link>
      <PartnerReport
        data={page.report}
        leads={page.leads}
        dealAction={reportDealAction}
        months={recentMonths(6)}
        monthHref={(m) => `/partner-portal/report/?b=${business.id}&m=${m}`}
      />
    </div>
  );
}
