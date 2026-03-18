import type { Metadata } from 'next';
import Link from 'next/link';
import { getCategories } from '@/lib/api';

export const metadata: Metadata = {
  title: 'קטגוריות',
  description:
    'עיינו בכל הקטגוריות של סרטונים בנושא בנייה פרטית בישראל - תכנון, עלויות, שלד, חשמל, גמרים ועוד.',
  alternates: {
    canonical: 'https://bonimbait.com/categories',
  },
};

const CATEGORY_ICONS: Record<string, string> = {
  'planning-permits': '📐',
  'structure-construction': '🏗️',
  'finishes-design': '🎨',
  'electrical-plumbing': '⚡',
  'contractors-labor': '👷',
  'costs-pricing': '💰',
  'general-tips': '💡',
  'landscaping-yard': '🌳',
};

export default async function CategoriesPage() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];

  try {
    categories = await getCategories();
  } catch {
    // fallback handled below
  }

  return (
    <div className="container-page">
      <section className="pt-8 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">קטגוריות</h1>
        <p className="text-gray-500">
          בחרו קטגוריה כדי לצפות בסרטונים רלוונטיים בנושא בנייה פרטית
        </p>
      </section>

      {categories.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500">לא ניתן לטעון קטגוריות כרגע. נסו שוב מאוחר יותר.</p>
        </div>
      ) : (
        <section className="pb-16" aria-label="רשימת קטגוריות">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="group block bg-white rounded-xl border border-gray-100 p-6 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200"
              >
                <div className="text-3xl mb-3">{CATEGORY_ICONS[cat.slug] || '📁'}</div>
                <h2 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors mb-2">
                  {cat.name_he}
                </h2>
                {cat.description_he && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                    {cat.description_he}
                  </p>
                )}
                <div className="flex items-center gap-1 text-sm text-primary-600 font-medium">
                  <span>{cat.video_count} סרטונים</span>
                  <svg
                    className="w-4 h-4 rtl:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
