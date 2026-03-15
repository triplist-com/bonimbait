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
import type { Video, Category } from '@/lib/types';
import { categories as fallbackCategories, sampleVideos } from '@/lib/mockData';

export default function CategoryPageClient() {
  const params = useParams();
  const slug = params.slug as string;

  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const category = categories.find((c) => c.slug === slug);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cats, vids] = await Promise.allSettled([
        getCategories(),
        getVideos({ category_id: category?.id, page: currentPage, limit: 12 }),
      ]);
      if (cats.status === 'fulfilled') setCategories(cats.value);
      if (vids.status === 'fulfilled') {
        setVideos(vids.value.videos);
        setTotalPages(vids.value.pages);
      }
    } catch {
      // Use fallback
      setVideos(sampleVideos.filter((v) => v.category_slug === slug));
    } finally {
      setIsLoading(false);
    }
  }, [slug, currentPage, category?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categoryName = category?.name_he || slug;
  const categoryDesc = category?.description_he || `כל הסרטונים והמידע בנושא ${categoryName} לבנייה פרטית`;

  return (
    <div className="container-page">
      {/* CollectionPage structured data */}
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
        <span className="text-gray-900">{categoryName}</span>
      </nav>

      {/* Header */}
      <section className="pb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">{categoryName}</h1>
        <p className="text-gray-500 mb-6">{categoryDesc}</p>
        <div className="max-w-xl">
          <SearchBar />
        </div>
      </section>

      {/* Category Chips */}
      <section className="pb-6" aria-label="קטגוריות">
        <CategoryBar categories={categories} activeSlug={slug} />
      </section>

      {/* Videos */}
      <section className="pb-8" aria-label={`סרטונים בנושא ${categoryName}`}>
        <VideoGrid
          videos={videos}
          title={`סרטונים בנושא ${categoryName}`}
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
