'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import SearchBar from '@/components/SearchBar';
import CategoryBar from '@/components/CategoryBar';
import VideoGrid from '@/components/VideoGrid';
import Pagination from '@/components/Pagination';
import { VideoGridSkeleton } from '@/components/Skeleton';
import { getVideos } from '@/lib/api';
import type { Video, VideoListParams } from '@/lib/types';

const SORT_OPTIONS = [
  { value: 'newest', label: 'חדש ביותר' },
  { value: 'oldest', label: 'ישן ביותר' },
  { value: 'popular', label: 'פופולרי' },
] as const;

function VideosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const categorySlug = searchParams.get('category') || undefined;
  const sortParam = (searchParams.get('sort') as VideoListParams['sort']) || 'newest';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getVideos({
        category_id: categorySlug,
        sort: sortParam,
        page: pageParam,
        limit: 18,
      });
      setVideos(data.videos);
      setTotal(data.total);
      setTotalPages(data.pages);
    } catch {
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [categorySlug, sortParam, pageParam]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const updateParams = (updates: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        sp.set(key, value);
      } else {
        sp.delete(key);
      }
    }
    // Reset page when changing filters
    if ('category' in updates || 'sort' in updates) {
      sp.delete('page');
    }
    const qs = sp.toString();
    router.push(`/videos${qs ? `?${qs}` : ''}`);
  };

  return (
    <div className="container-page">
      {/* Header */}
      <section className="pt-8 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">כל הסרטונים</h1>
        <p className="text-gray-500 mb-6">
          {total > 0 ? `${total} סרטונים` : 'טוען...'} בנושא בנייה פרטית בישראל
        </p>
        <div className="max-w-xl">
          <SearchBar />
        </div>
      </section>

      {/* Filters */}
      <section className="pb-6" aria-label="סינון">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <CategoryBar activeSlug={categorySlug} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <label htmlFor="sort-select" className="text-sm text-gray-500">
              מיון:
            </label>
            <select
              id="sort-select"
              value={sortParam}
              onChange={(e) => updateParams({ sort: e.target.value })}
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

      {/* Video Grid */}
      <section className="pb-8" aria-label="רשימת סרטונים">
        {isLoading ? (
          <VideoGridSkeleton />
        ) : videos.length > 0 ? (
          <VideoGrid videos={videos} />
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500">לא נמצאו סרטונים</p>
          </div>
        )}
      </section>

      <Pagination
        currentPage={pageParam}
        totalPages={totalPages}
        onPageChange={(page) => updateParams({ page: String(page) })}
      />
    </div>
  );
}

export default function VideosPageClient() {
  return (
    <Suspense
      fallback={
        <div className="container-page pt-8">
          <div className="skeleton h-10 w-48 rounded-lg mb-6" />
          <VideoGridSkeleton />
        </div>
      }
    >
      <VideosContent />
    </Suspense>
  );
}
