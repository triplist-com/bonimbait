import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import HubLocalImport from '@/components/hub/HubLocalImport';
import { HubDashboard } from '@/components/hub/HubDashboard';
import { HubIntro } from '@/components/hub/HubIntro';
import LocalHub from '@/components/hub/LocalHub';
import MemberHubProvider from '@/components/hub/MemberHubProvider';
import { getProfile, getUser } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { israelToday } from '@/lib/hub/onboarding';
import { loadStagePicks } from '@/lib/hub/picks';
import { loadPriceBook } from '@/lib/planner/price-book';
import { createProjectFromSignupMetadata, loadMemberHub } from '@/lib/hub/server';
import { ManagedHubBand } from '@/components/bonimos/ManagedHubBand';
import { isProjectManager, loadManagedHubSummary } from '@/lib/bonimos/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'הבית שלי',
  description: 'מפת הדרך האישית שלכם לבניית הבית: מה עושים השבוע, תקציב מול הערכה, משימות, מסמכים ותיק פרויקט לפגישת הייעוץ.',
  robots: { index: false, follow: false },
};

/**
 * "הבית שלי": the builder's workspace. Members get it from the server (RLS);
 * anonymous visitors get the same dashboard built in the browser from their
 * onboarding draft, or the welcome screen. Dark-launched behind FLAG_HUB.
 */
export default async function MyHomePage() {
  if (!isEnabled('hub')) redirect('/account/');
  const user = await getUser();

  if (!user) {
    const [picks, priceBook] = await Promise.all([loadStagePicks(), loadPriceBook()]);
    return <LocalHub picks={picks} today={israelToday()} book={priceBook.book} />;
  }

  const profile = await getProfile();
  let hub = await loadMemberHub(user, profile?.full_name ?? null);
  if (!hub && (await createProjectFromSignupMetadata(user))) {
    hub = await loadMemberHub(user, profile?.full_name ?? null);
  }

  if (!hub || !hub.data.project.onboarded) {
    // Bonim.Os (P7): a project manager without a house of their own works from /manage/.
    if (!hub && isEnabled('bonimos') && (await isProjectManager(user.id))) redirect('/manage/');
    const savedCount = hub ? hub.data.saved.length + hub.data.shortlist.length : 0;
    return (
      <>
        <HubLocalImport />
        <HubIntro signedIn savedCount={savedCount} />
      </>
    );
  }

  // Bonim.Os (P7): a managed client sees their manager and the live numbers here.
  const managed =
    isEnabled('bonimos') && hub.project.mode === 'managed' ? await loadManagedHubSummary(user, hub.project.id) : null;

  return (
    <MemberHubProvider>
      <HubLocalImport />
      <HubDashboard
        data={hub.data}
        banner={managed ? <ManagedHubBand summary={managed} today={hub.data.today} /> : undefined}
        editHref="/my-home/start/?edit=1"
        headerActions={
          <ButtonLink href="/account/" variant="ghost" size="sm" iconStart={<UserRound />} prefetch={false}>
            החשבון וההזמנות
          </ButtonLink>
        }
      />
    </MemberHubProvider>
  );
}
