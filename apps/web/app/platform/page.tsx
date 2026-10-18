import type { Metadata } from 'next';
import BusinessScreen from '@/components/pitch/BusinessScreen';
import PillarGrid from '@/components/pitch/PillarGrid';
import PitchHero from '@/components/pitch/PitchHero';
import RoiCalculator from '@/components/pitch/RoiCalculator';
import SwitchPlan from '@/components/pitch/SwitchPlan';
import SwitchSection from '@/components/pitch/SwitchSection';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { adminNavFor } from '@/lib/admin/nav';
import { DEMO_VIEWS } from '@/lib/demo/views';
import { isEnabled } from '@/lib/flags';
import { pitchContact } from '@/lib/pitch/contact';
import { getPitchData } from '@/lib/pitch/data';
import { advisorNameIsDefault, resolvePillars } from '@/lib/pitch/pillars';
import { buildFaq } from '@/lib/pitch/plan';
import type { PlanKey } from '@/lib/pitch/roi';
import { absoluteUrl } from '@/lib/site';

// Counts, plans and registry links refresh hourly (ISR).
export const revalidate = 3600;

const TITLE = 'בונים בית OS: כל שאלה של בונה — לקוח שלכם';
const DESCRIPTION = 'היועץ, הבית שלי, חדר הבקרה ודוח השותף: הפלטפורמה שהופכת את הספרייה של בונים בית ללקוחות. מהשאלה הראשונה ועד המפתח.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/platform/'),
    siteName: 'בונים בית',
    locale: 'he_IL',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const PLAN_NAME_FALLBACK: Record<PlanKey, string> = { budget: 'בונים תקציב', plus: 'בונים בית פלוס', turnkey: 'עד מפתח' };
const PLAN_SLUG: Record<PlanKey, string> = { budget: 'bonim-budget', plus: 'bonim-bait-plus', turnkey: 'bonim-bait-turnkey' };

/** The owner-facing pitch site: six sections, every number computed, measured or his own public fact. */
export default async function PlatformPitchPage() {
  const data = await getPitchData();
  const flagOn = (flag: Parameters<typeof isEnabled>[0]) => isEnabled(flag);
  const pillars = resolvePillars(DEMO_VIEWS, flagOn);
  const adminGroups = adminNavFor('admin', flagOn);
  const adminScreens = adminGroups.reduce((sum, g) => sum + g.items.length, 0);
  const adminAreas = adminGroups.flatMap((g) => (g.title ? [g.title] : []));
  const planNames = Object.fromEntries(
    (Object.keys(PLAN_SLUG) as PlanKey[]).map((key) => {
      const name = data.plans.find((p) => p.slug === PLAN_SLUG[key])?.name;
      return [key, key === 'turnkey' ? PLAN_NAME_FALLBACK.turnkey : name ?? PLAN_NAME_FALLBACK[key]];
    }),
  ) as Record<PlanKey, string>;
  const { parity, channel, migration } = data.facts;

  return (
    <>
      <PitchHero channelTotal={channel.total} library={data.library} parity={parity} speed={data.speed} />
      <BusinessScreen
        channel={channel}
        library={data.library}
        articles={data.articles}
        pros={data.pros}
        reviews={data.reviews}
        plans={data.plans}
      />
      <PillarGrid pillars={pillars} advisorIsDefault={advisorNameIsDefault()} />
      <SwitchSection parity={parity} speed={data.speed} migration={migration} adminScreens={adminScreens} adminAreas={adminAreas} />
      <Section tone="paper" id="roi" labelledBy="roi-title" className="scroll-mt-8 md:scroll-mt-0">
        <SectionHeader
          id="roi-title"
          eyebrow="המספרים שלכם"
          title="כמה שווה לכם הקהל שלכם?"
          highlight="הקהל שלכם"
          description="באותו פורמט כמו המחשבון שבניתם לשותפים: הזינו את המספרים שלכם וקבלו הערכה ראשונית. ברירת המחדל היא מקרה בסיס לדוגמה, לא תחזית."
        />
        <RoiCalculator prices={data.prices} planNames={planNames} />
      </Section>
      <SwitchPlan faq={buildFaq({ parityPassed: parity.passed, parityTotal: parity.total })} contact={pitchContact()} />
    </>
  );
}
