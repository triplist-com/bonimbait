import type { Metadata } from 'next';
import StructuredData from '@/components/StructuredData';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import Hero from '@/components/home/Hero';
import ProofBar from '@/components/home/ProofBar';
import ValueStrip from '@/components/home/ValueStrip';
import HowItWorks from '@/components/home/HowItWorks';
import JourneyNavigator from '@/components/home/JourneyNavigator';
import HubTeaserSlot from '@/components/home/HubTeaserSlot';
import MediaRails from '@/components/home/MediaRails';
import ProsShowcase from '@/components/home/ProsShowcase';
import BudgetCalculatorSlot from '@/components/home/BudgetCalculatorSlot';
import BenefitsTeaser from '@/components/home/BenefitsTeaser';
import SocialProof from '@/components/home/SocialProof';
import PlansTeaser from '@/components/home/PlansTeaser';
import FinalCTA from '@/components/home/FinalCTA';
import { getVideo as getIndexedVideo } from '@/app/api/_lib/data';
import {
  countPublishedPros,
  getHomeBenefits,
  getHomeMedia,
  getHomePlans,
  getHomePros,
  getKnowledgeStats,
  getStageArticleCounts,
} from '@/lib/home/data';
import { HERO_MOMENT } from '@/lib/home/content';
import { BUILD_STAGES } from '@/lib/stages';
import { absoluteUrl } from '@/lib/site';

// Static, regenerated hourly (ISR): counts and teasers stay fresh, TTFB stays CDN-fast.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: 'בונים בית - אתכם עד המפתח | מרכז הידע לבניית בית פרטי' },
  description:
    'שאלו כל שאלה על בניית בית וקבלו תשובה מהשטח, עם הרגע המדויק בסרטון. מדריכים לכל שלב, בעלי מקצוע מומלצים, מחשבון תקציב, קהילת WhatsApp ופגישת ייעוץ ללא עלות.',
  alternates: { canonical: absoluteUrl() },
};

function momentPercent(): number | undefined {
  try {
    const duration = Number(getIndexedVideo(HERO_MOMENT.youtubeId)?.duration_seconds);
    if (!duration) return undefined;
    return Math.min(96, Math.max(4, Math.round((HERO_MOMENT.startSeconds / duration) * 100)));
  } catch {
    return undefined;
  }
}

export default async function Home() {
  const [stats, stageCounts, media, pros, prosTotal, benefits, plans] = await Promise.all([
    getKnowledgeStats(),
    getStageArticleCounts(),
    getHomeMedia(4),
    getHomePros(8),
    countPublishedPros(),
    getHomeBenefits(3),
    getHomePlans(),
  ]);

  return (
    <>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'בונים בית - אתכם עד המפתח',
          url: absoluteUrl(),
          inLanguage: 'he-IL',
        }}
      />

      <Hero stats={stats} />
      <ProofBar />
      <ValueStrip />
      <HowItWorks pro={pros[0]} momentPercent={momentPercent()} />

      <Section tone="sand" id="journey" labelledBy="journey-title">
        <SectionHeader
          id="journey-title"
          eyebrow="7 שלבים, מהמגרש ועד המפתח"
          title="המסע לבית, שלב אחרי שלב"
          highlight="שלב אחרי שלב"
          description="בחרו את השלב שלכם וקבלו את המדריכים, הסרטונים והטיפים שרלוונטיים עכשיו."
          action={{ href: '/blog/', label: 'לכל מדריך הבנייה' }}
        />
        <JourneyNavigator stages={BUILD_STAGES} counts={stageCounts} />
        <div className="mt-12 sm:mt-16">
          <HubTeaserSlot />
        </div>
      </Section>

      <MediaRails podcasts={media.podcasts} videos={media.videos} />
      <ProsShowcase pros={pros} total={prosTotal} />
      <BudgetCalculatorSlot />
      <BenefitsTeaser items={benefits} />
      <SocialProof />
      <PlansTeaser plans={plans} />
      <FinalCTA />
    </>
  );
}
