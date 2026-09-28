import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import SearchBar from '@/components/SearchBar';
import VideoGrid from '@/components/VideoGrid';
import PopularQuestions from '@/components/PopularQuestions';
import PromoVideo from '@/components/PromoVideo';
import StructuredData from '@/components/StructuredData';
import CommunityCTA from '@/components/content/CommunityCTA';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { PostGrid } from '@/components/content/PostCard';
import StageNav from '@/components/content/StageNav';
import VideoPageCard from '@/components/content/VideoPageCard';
import { getPublicDb, safeQuery } from '@/lib/content/db';
import { COMMUNITY_STATS } from '@/lib/content/navigation';
import { getCategoryMap, listBenefitProducts, listFeaturedBusinesses } from '@/lib/content/queries';
import { listIndexedVideos, loadLatestVideoPages } from '@/lib/content/videos';
import { listPublishedPosts } from '@/lib/db/posts';
import { absoluteUrl } from '@/lib/site';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: 'בונים בית - מרכז הידע לבניית בית פרטי בישראל' },
  description:
    'מרכז הידע לבניית בית: מדריכים, סרטונים ופודקאסטים לכל שלב בבנייה, בעלי מקצוע מומלצים, קהילת WhatsApp ותשובות AI לכל שאלה על עלויות, קבלנים והיתרים.',
  alternates: { canonical: absoluteUrl() },
};

function SectionHeader({ title, subtitle, href, cta }: { title: string; subtitle?: string; href?: string; cta?: string }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-gray-500 mt-1.5">{subtitle}</p>}
      </div>
      {href && cta && (
        <Link href={href} className="flex-shrink-0 text-sm text-primary hover:text-primary-700 font-medium flex items-center gap-1">
          {cta}
          <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
      )}
    </div>
  );
}

function Section({ children, label, tone = 'plain' }: { children: ReactNode; label: string; tone?: 'plain' | 'white' }) {
  return (
    <section aria-label={label} className={tone === 'white' ? 'bg-white border-y border-gray-100' : ''}>
      <div className="container-page py-12 sm:py-16">{children}</div>
    </section>
  );
}

export default async function Home() {
  const db = getPublicDb();
  const [latestPosts, podcasts, videoPages, businesses, products, categoryMap] = await Promise.all([
    db ? safeQuery(async () => (await listPublishedPosts(db, { page: 1, pageSize: 6 })).items, []) : [],
    loadLatestVideoPages('podcast', 4),
    loadLatestVideoPages('video', 4),
    listFeaturedBusinesses(6),
    listBenefitProducts(3),
    getCategoryMap(),
  ]);
  const indexedVideos = videoPages.length === 0 ? listIndexedVideos(6, 'popular') : [];

  return (
    <div>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'בונים בית - מרכז הידע לבניית בית פרטי בישראל',
          url: absoluteUrl(),
          inLanguage: 'he-IL',
        }}
      />

      {/* 1. Hero: the AI search is the primary action */}
      <section className="hero-bg pt-12 sm:pt-20 pb-12 sm:pb-16">
        <div className="container-page">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="order-2 lg:order-1">
              <p className="text-primary font-semibold mb-3">אתכם עד המפתח</p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                כל התשובות לבניית
                <span className="text-primary"> הבית שלכם</span>
              </h1>
              <p className="text-gray-500 text-lg sm:text-xl mb-8 leading-relaxed max-w-lg">
                שאלו כל שאלה על בנייה פרטית וקבלו תשובה מבוססת מאות סרטונים ומדריכים, עם קפיצה ישירה לרגע הרלוונטי.
              </p>
              <div className="max-w-xl">
                <SearchBar size="large" />
                <p className="text-sm text-gray-400 mt-3">נסו: עלויות שלד, איך בוחרים קבלן, היתר בנייה</p>
              </div>
              <div className="mt-6">
                <ConsultationCTA source="home-hero" label="לתיאום ייעוץ בניה מקצועי ללא עלות" />
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <PromoVideo />
            </div>
          </div>

          {/* Stats strip */}
          <ul className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4" aria-label="הקהילה במספרים">
            {COMMUNITY_STATS.map((s) => (
              <li key={s.network} className="rounded-2xl bg-white border border-gray-100 shadow-card px-4 py-5 text-center">
                <span dir="ltr" className="block text-2xl sm:text-3xl font-bold text-gray-900">{s.value}</span>
                <span className="block text-sm text-gray-500 mt-0.5">
                  {s.label} ב-{s.network}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 2. Podcast */}
      {podcasts.length > 0 && (
        <Section label="פודקאסט בונים בית" tone="white">
          <SectionHeader
            title="פודקאסט בונים בית"
            subtitle="שיחות עם מומחים ומשפחות בונות: עלויות, משכנתא, קבלנות ומה שבאמת קורה בשטח"
            href="/category/פודקאסט/"
            cta="לכל הפרקים"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {podcasts.map((v) => (
              <VideoPageCard key={v.id} video={v} />
            ))}
          </div>
        </Section>
      )}

      {/* 3. Video channel */}
      <Section label="ערוץ הבניה המוביל בישראל">
        <SectionHeader
          title="ערוץ הבניה המוביל בישראל"
          subtitle="סיורי שטח, טיפים ובעלי מקצוע מצולמים"
          href={videoPages.length ? '/בונים-בית-tv/' : '/videos/'}
          cta="לכל הסרטונים"
        />
        {videoPages.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {videoPages.map((v) => (
              <VideoPageCard key={v.id} video={v} />
            ))}
          </div>
        ) : (
          <VideoGrid videos={indexedVideos} />
        )}
      </Section>

      {/* 4. Benefits shop teaser */}
      <Section label="הטבות לחברי הקהילה" tone="white">
        <SectionHeader
          title="הטבות בלעדיות לחברי בונים בית"
          subtitle="הנחות והטבות מספקים ובעלי מקצוע שעברו את הסינון שלנו"
          href="/הטבות-לקהילה/"
          cta="לכל ההטבות לקהילה"
        />
        {products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {products.map((p) => (
              <Link
                key={p.slug}
                href={`/product/${p.slug}/`}
                className="group flex flex-col rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-card hover:shadow-card-hover transition-shadow"
              >
                <div className="aspect-[4/3] bg-secondary-50 overflow-hidden">
                  {p.featured_image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.featured_image} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" />
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-gray-900 group-hover:text-primary line-clamp-2">{p.name}</h3>
                  <span className="mt-2 inline-block text-sm font-medium text-primary">לעמוד ההטבה</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Link
            href="/הטבות-לקהילה/"
            className="block rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 p-8 text-center font-semibold text-secondary-800 hover:bg-secondary-100"
          >
            לחנות ההטבות של הקהילה
          </Link>
        )}
      </Section>

      {/* 5. Recommended pros */}
      <Section label="נבחרת המומלצים">
        <SectionHeader
          title="נבחרת המומלצים"
          subtitle="בעלי מקצוע וספקים שנבדקו על ידינו ודורגו על ידי הקהילה"
          href="/recommended/"
          cta="לכל בעלי המקצוע"
        />
        {businesses.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {businesses.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/business/${b.slug}/`}
                  className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-card hover:shadow-card-hover hover:border-primary-100 transition-all"
                >
                  <span className="w-14 h-14 flex-shrink-0 rounded-xl bg-primary-50 overflow-hidden flex items-center justify-center text-primary font-bold text-lg">
                    {b.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.logo_url} alt="" loading="lazy" className="w-full h-full object-contain" />
                    ) : (
                      b.name.charAt(0)
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-gray-900 truncate">{b.name}</span>
                    <span className="block text-sm text-gray-500 truncate">
                      {[b.specialty, b.city].filter(Boolean).join(' · ') || b.tagline}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Link
            href="/recommended/"
            className="block rounded-2xl border border-dashed border-primary-200 bg-primary-50 p-8 text-center font-semibold text-primary-800 hover:bg-primary-100"
          >
            לנבחרת בעלי המקצוע המומלצים
          </Link>
        )}
      </Section>

      {/* 6. The complete building guide: stages + latest articles */}
      <Section label="מדריך הבניה השלם לבית" tone="white">
        <SectionHeader
          title="מדריך הבניה השלם לבית"
          subtitle="כל מה שצריך לדעת בכל שלב, מהמגרש ועד קבלת המפתח"
          href="/blog/"
          cta="למרכז הידע"
        />
        <StageNav heading={null} />
        {latestPosts.length > 0 && (
          <>
            <h3 className="text-xl font-bold text-gray-900 mt-6 mb-5">חדשים במרכז הידע</h3>
            <PostGrid
              posts={latestPosts.map((p) => ({
                ...p,
                categoryName: p.primary_category_id ? categoryMap.get(p.primary_category_id)?.name ?? null : null,
              }))}
            />
          </>
        )}
      </Section>

      {/* AI: popular questions */}
      <Section label="שאלות פופולריות">
        <SectionHeader title="שאלות פופולריות" subtitle="השאלות הנפוצות ביותר של בוני בתים, עם תשובות AI" />
        <PopularQuestions />
      </Section>

      {/* 7. Community + consultation */}
      <div className="container-page pb-16 space-y-8">
        <CommunityCTA />
        <ConsultationCTA variant="banner" source="home-banner" />
      </div>
    </div>
  );
}
