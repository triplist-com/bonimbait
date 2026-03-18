import type { Metadata } from 'next';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import CategoryBar from '@/components/CategoryBar';
import VideoGrid from '@/components/VideoGrid';
import PopularQuestions from '@/components/PopularQuestions';
import StructuredData from '@/components/StructuredData';
import { getVideos, getCategories } from '@/lib/api';
import type { Video, Category } from '@/lib/types';

export const metadata: Metadata = {
  title: 'בונים בית - מאגר הידע לבנייה פרטית בישראל',
  description:
    'חפשו בין מאות סרטונים בנושא בנייה פרטית בישראל וקבלו תשובות מבוססות AI. מידע על עלויות, קבלנים, היתרים, שלד, גמרים ועוד.',
  alternates: {
    canonical: 'https://bonimbait.com',
  },
};

export default async function Home() {
  let recentVideos: Video[] = [];
  let popularVideos: Video[] = [];
  let categories: Category[] = [];
  let totalVideos = 0;

  try {
    const [recentData, popularData, categoriesData] = await Promise.allSettled([
      getVideos({ limit: 6, sort: 'newest' }),
      getVideos({ limit: 6, sort: 'popular' }),
      getCategories(),
    ]);
    if (recentData.status === 'fulfilled') {
      recentVideos = recentData.value.videos;
      totalVideos = recentData.value.total;
    }
    if (popularData.status === 'fulfilled') {
      popularVideos = popularData.value.videos;
    }
    if (categoriesData.status === 'fulfilled') categories = categoriesData.value;
  } catch {
    // Use fallback data
  }

  return (
    <div>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'בונים בית - מאגר הידע לבנייה פרטית בישראל',
          description:
            'מאגר ידע מקיף לבנייה פרטית בישראל עם תשובות AI',
          url: 'https://bonimbait.com',
        }}
      />

      {/* Hero Section */}
      <section className="hero-bg pt-20 sm:pt-28 pb-14 text-center">
        <div className="container-page">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            כל התשובות לבניית הבית שלכם
          </h1>
          <p className="text-gray-500 text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
            מאגר ידע מבוסס AI עם מאות סרטונים מומחים בנושא בנייה פרטית בישראל
          </p>
          <div className="max-w-2xl mx-auto">
            <SearchBar size="large" />
            <p className="text-sm text-gray-400 mt-3">
              נסו: עלויות שלד, איך בוחרים קבלן, היתר בנייה
            </p>
          </div>
        </div>
      </section>

      <div className="container-page">
        {/* Trust Bar */}
        <section className="py-12 sm:py-16" aria-label="נתוני האתר">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              <div className="flex flex-col items-center gap-1.5">
                <svg className="w-6 h-6 text-primary mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="text-2xl sm:text-3xl font-bold text-gray-900">{totalVideos || 200}+</span>
                <span className="text-sm text-gray-500">סרטונים מסוכמים</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <svg className="w-6 h-6 text-primary mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-2xl sm:text-3xl font-bold text-gray-900">500+</span>
                <span className="text-sm text-gray-500">שעות תוכן</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <svg className="w-6 h-6 text-primary mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <span className="text-2xl sm:text-3xl font-bold text-gray-900">{categories.length || 8}</span>
                <span className="text-sm text-gray-500">תחומי ידע</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <svg className="w-6 h-6 text-primary mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                <span className="text-2xl sm:text-3xl font-bold text-gray-900">AI</span>
                <span className="text-sm text-gray-500">מבוסס בינה מלאכותית</span>
              </div>
            </div>
          </div>
        </section>

        {/* Popular Questions */}
        <section className="py-12 sm:py-16" aria-label="שאלות פופולריות">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">שאלות פופולריות</h2>
              <p className="text-sm text-gray-500 mt-1">השאלות הנפוצות ביותר של בוני בתים</p>
            </div>
          </div>
          <PopularQuestions />
        </section>

        <div className="section-divider" />

        {/* Popular Videos */}
        {popularVideos.length > 0 && (
          <section className="py-12 sm:py-16" aria-label="סרטונים פופולריים">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">סרטונים פופולריים</h2>
                <p className="text-sm text-gray-500 mt-1">הסרטונים הנצפים ביותר</p>
              </div>
              <Link
                href="/videos?sort=popular"
                className="text-sm text-primary hover:text-primary-700 font-medium transition-colors flex items-center gap-1"
              >
                הכל
                <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            </div>
            <VideoGrid videos={popularVideos} />
          </section>
        )}

        {/* Categories */}
        <section className="py-12 sm:py-16" id="categories" aria-label="קטגוריות">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">קטגוריות</h2>
              <p className="text-sm text-gray-500 mt-1">גלו תוכן לפי תחום</p>
            </div>
            <Link
              href="/categories"
              className="text-sm text-primary hover:text-primary-700 font-medium transition-colors flex items-center gap-1"
            >
              כל הקטגוריות
              <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          </div>
          <CategoryBar categories={categories} />
        </section>

        {/* Recent Videos */}
        <section className="py-12 sm:py-16" aria-label="סרטונים אחרונים">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">סרטונים אחרונים</h2>
              <p className="text-sm text-gray-500 mt-1">התוספות החדשות ביותר למאגר</p>
            </div>
            <Link
              href="/videos?sort=newest"
              className="text-sm text-primary hover:text-primary-700 font-medium transition-colors flex items-center gap-1"
            >
              כל הסרטונים
              <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          </div>
          <VideoGrid videos={recentVideos} />
        </section>

        {/* CTA Section */}
        <section className="py-12 sm:py-16 pb-16" aria-label="חיפוש נוסף">
          <div className="bg-gradient-to-br from-primary-50 to-white rounded-2xl p-8 sm:p-12 text-center border border-primary-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              לא מצאתם את מה שחיפשתם?
            </h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              נסו לחפש שאלה ספציפית ומערכת ה-AI שלנו תמצא את התשובה המדויקת
              מתוך הסרטונים
            </p>
            <div className="max-w-lg mx-auto">
              <SearchBar />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
