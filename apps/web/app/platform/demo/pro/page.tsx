import type { Metadata } from 'next';
import PortalDashboard from '@/components/revenue/portal/PortalDashboard';
import PartnerTierBadge from '@/components/revenue/PartnerTierBadge';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { revenueDemo } from '@/lib/demo/fixtures/revenue';

export const metadata: Metadata = { title: 'פורטל בעל מקצוע' };
export const revalidate = 3600;

/** The pro portal of a fictional shell contractor: the real dashboard on fixtures. */
export default function ProPortalDemoPage() {
  const { pro } = loadDemoFixture(revenueDemo);
  return (
    <div className="container-page space-y-6 py-8 sm:py-12">
      <header>
        <p className="eyebrow">ניהול העסק</p>
        <h1 className="mt-1 text-headline text-ink-900">{pro.business.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-600">
          {pro.business.specialty} · סטטוס: <span className="font-semibold">מפורסם</span>
          <PartnerTierBadge badge={pro.business.badge} />
        </p>
      </header>
      <PortalDashboard view={pro} reportHref="/platform/demo/partner/" demo />
    </div>
  );
}
