import type { Metadata } from 'next';
import SearchBar from '@/components/SearchBar';
import CategoryBar from '@/components/CategoryBar';
import VideoGrid from '@/components/VideoGrid';
import StructuredData from '@/components/StructuredData';
import { getVideos, getCategories } from '@/lib/api';
import { categories as fallbackCategories, sampleVideos } from '@/lib/mockData';
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
  let videos: Video[] = sampleVideos;
  let categories: Category[] = fallbackCategories;

  try {
    const [videosData, categoriesData] = await Promise.allSettled([
      getVideos({ limit: 6, sort: 'newest' }),
      getCategories(),
    ]);
    if (videosData.status === 'fulfilled') videos = videosData.value.videos;
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
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">900+</span>
            <span>סרטונים</span>
          </div>
          <div className="w-px h-8 bg-gray-200" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">10</span>
            <span>קטגוריות</span>
          </div>
          <div className="w-px h-8 bg-gray-200" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">100+</span>
            <span>טיפים</span>
          </div>
        </div>
      </section>

      {/* Category Chips */}
      <section className="py-6" id="categories" aria-label="קטגוריות">
        <CategoryBar categories={categories} />
      </section>

      {/* Recent Videos */}
      <section className="py-8" aria-label="סרטונים אחרונים">
        <VideoGrid videos={videos} title="סרטונים אחרונים" />
      </section>

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
