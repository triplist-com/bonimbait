import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import OnboardingFlow from '@/components/hub/OnboardingFlow';
import { getProfile, getUser } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { hubUserDb } from '@/lib/hub/db';
import { isMemberRegionSlug, israelToday, normalizeDraft, projectToDraft, stageFromProfile } from '@/lib/hub/onboarding';
import { getPrimaryProject, regionForId } from '@/lib/hub/server';
import { loadPriceBook } from '@/lib/planner/price-book';
import type { HubDraft } from '@/lib/hub/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'המפה האישית שלכם',
  description: 'חמש שאלות קצרות, ותקבלו מפת דרך אישית לבניית הבית: מה עושים השבוע, הערכת תקציב ולוח זמנים.',
  robots: { index: false, follow: false },
};

/**
 * Onboarding (/my-home/start/). Works without an account (answers stay in
 * bb.hub.draft); members start from their project, or from the stage and
 * region on their profile. `?edit=1` is "עדכון פרטים" from the dashboard.
 */
export default async function StartPage({ searchParams }: { searchParams: { edit?: string } }) {
  if (!isEnabled('hub')) notFound();
  const user = await getUser();
  let initialDraft: HubDraft = {};

  if (user) {
    const db = hubUserDb();
    const project = await getPrimaryProject(db, user.id);
    if (project) {
      const region = await regionForId(db, project.region_id);
      initialDraft = projectToDraft(project, region?.slug ?? null);
    } else {
      const profile = await getProfile();
      const region = profile?.region_id ? await regionForId(db, profile.region_id) : null;
      initialDraft = normalizeDraft({
        stage: stageFromProfile(profile?.construction_stage),
        regionSlug: region && isMemberRegionSlug(region.slug) ? region.slug : undefined,
      });
    }
  }

  const { book } = await loadPriceBook();
  return <OnboardingFlow initialDraft={initialDraft} isMember={Boolean(user)} today={israelToday()} editing={searchParams.edit === '1'} book={book} />;
}
