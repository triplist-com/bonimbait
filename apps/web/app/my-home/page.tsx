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
import { createProjectFromSignupMetadata, loadMemberHub } from '@/lib/hub/server';

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
    return <LocalHub picks={await loadStagePicks()} today={israelToday()} />;
  }

  const profile = await getProfile();
  let hub = await loadMemberHub(user, profile?.full_name ?? null);
  if (!hub && (await createProjectFromSignupMetadata(user))) {
    hub = await loadMemberHub(user, profile?.full_name ?? null);
  }

  if (!hub || !hub.data.project.onboarded) {
    const savedCount = hub ? hub.data.saved.length + hub.data.shortlist.length : 0;
    return (
      <>
        <HubLocalImport />
        <HubIntro signedIn savedCount={savedCount} />
      </>
    );
  }

  return (
    <MemberHubProvider>
      <HubLocalImport />
      <HubDashboard
        data={hub.data}
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
