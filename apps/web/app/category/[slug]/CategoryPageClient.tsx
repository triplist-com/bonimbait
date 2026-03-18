'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import CategoryBar from '@/components/CategoryBar';
import VideoGrid from '@/components/VideoGrid';
import Pagination from '@/components/Pagination';
import StructuredData from '@/components/StructuredData';
import { getCategories, getVideos } from '@/lib/api';
import type { Video, Category, VideoListParams } from '@/lib/types';

const SORT_OPTIONS = [
  { value: 'newest', label: 'חדש ביותר' },
  { value: 'oldest', label: 'ישן ביותר' },
  { value: 'popular', label: 'פופולרי' },
] as const;

export default function CategoryPageClient() {
  const params = useParams();
  const slug = params.slug as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [totalVideos, setTotalVideos] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState<VideoListParams['sort']>('newest');

  const category = categories.find((c) => c.slug === slug);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cats, vids] = await Promise.allSettled([
        getCategories(),
        getVideos({ category_id: slug, page: currentPage, limit: 12, sort }),
      ]);
      if (cats.status === 'fulfilled') setCategories(cats.value);
      if (vids.status === 'fulfilled') {
        setVideos(vids.value.videos);
        setTotalPages(vids.value.pages);
        setTotalVideos(vids.value.total);
      }
    } catch {
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [slug, currentPage, sort]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSortChange = (newSort: VideoListParams['sort']) => {
    setSort(newSort);
    setCurrentPage(1);
  };

  const categoryName = category?.name_he || slug;
  const categoryDesc = category?.description_he || `כל הסרטונים והמידע בנושא ${categoryName} לבנייה פרטית`;

  return (
    <div className="container-page">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${categoryName} - בונים בית`,
          description: categoryDesc,
          url: `https://bonimbait.com/category/${slug}`,
        }}
      />

      {/* Breadcrumbs */}
      <nav aria-label="מיקום בניווט" className="flex items-center gap-2 text-sm text-gray-500 pt-8 mb-6">
        <Link href="/" className="hover:text-primary transition-colors">
          דף הבית
        </Link>
        <span className="text-gray-300" aria-hidden="true">/</span>
        <Link href="/categories" className="hover:text-primary transition-colors">
          קטגוריות
        </Link>
        <span className="text-gray-300" aria-hidden="true">/</span>
        <span className="text-gray-900">{categoryName}</span>
      </nav>

      {/* Header */}
      <section className="pb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{categoryName}</h1>
        <p className="text-gray-500 mb-1">{categoryDesc}</p>
        {totalVideos > 0 && (
          <p className="text-sm text-primary-600 font-medium mb-6">{totalVideos} סרטונים</p>
        )}
        <div className="max-w-xl">
          <SearchBar />
        </div>
      </section>

      {/* Category Chips + Sort */}
      <section className="pb-6" aria-label="סינון">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <CategoryBar categories={categories} activeSlug={slug} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <label htmlFor="category-sort" className="text-sm text-gray-500">
              מיון:
            </label>
            <select
              id="category-sort"
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as VideoListParams['sort'])}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Videos */}
      <section className="pb-8" aria-label={`סרטונים בנושא ${categoryName}`}>
        <VideoGrid
          videos={videos}
          isLoading={isLoading}
        />
        {!isLoading && videos.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500">אין עדיין סרטונים בקטגוריה זו</p>
          </div>
        )}
      </section>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
