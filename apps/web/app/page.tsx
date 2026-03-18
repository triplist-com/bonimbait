import type { Metadata } from 'next';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import CategoryBar from '@/components/CategoryBar';
import VideoGrid from '@/components/VideoGrid';
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
    <div className="container-page">
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
      <section className="pt-16 pb-10 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 leading-tight">
          בונים בית — מאגר הידע לבנייה פרטית בישראל
        </h1>
        <p className="text-gray-500 text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
          חפשו בין מאות סרטונים וקבלו תשובות מבוססות AI
          <br className="hidden sm:block" />
          לכל שאלה בנושא בנייה פרטית
        </p>
        <div className="max-w-2xl mx-auto">
          <SearchBar size="large" />
        </div>
      </section>

      {/* Stats */}
      <section className="py-6" aria-label="סטטיסטיקות האתר">
        <div className="flex items-center justify-center gap-6 sm:gap-10 text-sm text-gray-500 font-medium">
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">{totalVideos || 200}</span>
            <span>סרטונים</span>
          </div>
          <div className="w-px h-8 bg-gray-200" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">{categories.length || 8}</span>
            <span>קטגוריות</span>
          </div>
          <div className="w-px h-8 bg-gray-200" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">{totalVideos || 200}</span>
            <span>סיכומי AI</span>
          </div>
        </div>
      </section>

      {/* Category Chips */}
      <section className="py-6" id="categories" aria-label="קטגוריות">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">קטגוריות</h2>
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
      <section className="py-8" aria-label="סרטונים אחרונים">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">סרטונים אחרונים</h2>
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

      {/* Popular Videos */}
      {popularVideos.length > 0 && (
        <section className="py-8" aria-label="סרטונים פופולריים">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">סרטונים פופולריים</h2>
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

      {/* CTA Section */}
      <section className="py-8 pb-16" aria-label="חיפוש נוסף">
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
  );
}
