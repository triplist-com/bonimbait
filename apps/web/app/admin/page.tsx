import type { Metadata } from 'next';
import PageHeader from '@/components/admin/PageHeader';
import LegacyDashboard from '@/components/admin/LegacyDashboard';
import CommandCenter, { type CommandLinks } from '@/components/command/CommandCenter';
import { DemoNotice, DemoOffer } from '@/components/command/DemoNotice';
import { getProfile } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { isEnabled } from '@/lib/flags';
import { buildCommandCenter } from '@/lib/command/build';
import { demoCommandCenter } from '@/lib/command/demo';
import { loadCommandInputs } from '@/lib/command/load';
import { parsePeriod } from '@/lib/command/period';
import type { PeriodDays } from '@/lib/command/types';

export const metadata: Metadata = { title: 'חדר הבקרה' };

/**
 * /admin/: "חדר הבקרה", the owner's Command Center (P4). Editors and admins
 * (the admin layout guards with requireRole('editor'); RLS limits every read).
 * ?period=7|30|90 picks the period; ?demo=1 renders the demo fixture instead
 * of real data. While FLAG_COMMAND_CENTER is off, the previous dashboard stays.
 */
export default async function AdminHome({ searchParams }: { searchParams: { period?: string; demo?: string } }) {
  if (!isEnabled('commandCenter')) return <LegacyDashboard />;

  const period = parsePeriod(searchParams.period);
  const demo = searchParams.demo === '1';
  const profile = await getProfile();
  const isAdmin = hasRole(profile?.role, 'admin');
  const data = demo ? demoCommandCenter(period) : buildCommandCenter(await loadCommandInputs({ periodDays: period }));
  const demoQ = demo ? 'demo=1&' : '';
  const periodHref = (days: PeriodDays) => `/admin/?${demoQ}period=${days}`;
  const links: CommandLinks = {
    leads: demo ? null : '/admin/leads/',
    insights: `/admin/insights/${demo ? '?demo=1' : ''}`,
    leadsAnalytics: `/admin/insights/leads/?${demoQ}period=${period}`,
    content: demo ? null : `/admin/insights/content/?period=${period}`,
    digest: `/admin/digest/${demo ? '?demo=1' : ''}`,
    pipelineSettings: isAdmin && !demo ? '/admin/insights/pipeline/' : null,
  };

  return (
    <div className="max-w-7xl space-y-5">
      <PageHeader
        title="חדר הבקרה"
        description="כל העסק במסך אחד: הצבר, פגישות הייעוץ, הלידים החמים, השותפים, עלות ה-AI, והשאלות שעוד אין להן תשובה טובה."
      />
      {demo ? <DemoNotice exitHref={`/admin/?period=${period}`} /> : data.sparse ? <DemoOffer href={`/admin/?demo=1&period=${period}`} /> : null}
      <CommandCenter data={data} periodHref={periodHref} links={links} />
    </div>
  );
}
