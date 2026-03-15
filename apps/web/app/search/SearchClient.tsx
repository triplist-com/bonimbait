'use client';

import { Suspense } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SearchBar from '@/components/SearchBar';
import AiAnswer from '@/components/AiAnswer';
import CategoryBar from '@/components/CategoryBar';
import VideoCard from '@/components/VideoCard';
import Pagination from '@/components/Pagination';
import { VideoGridSkeleton, AnswerSkeleton } from '@/components/Skeleton';
import { useStreamingAnswer } from '@/lib/hooks/useStreamingAnswer';
import { searchVideos } from '@/lib/api';
import type { SearchResult } from '@/lib/types';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';
  const categorySlug = searchParams.get('category') || undefined;
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const {
    answer,
    sources,
    confidence,
    isStreaming,
    error: answerError,
    start: startAnswer,
  } = useStreamingAnswer();

  const fetchResults = useCallback(async () => {
    if (!query) return;
    setIsLoadingResults(true);
    setSearchError(null);
    try {
      const data = await searchVideos(query, categorySlug, pageParam, 20);
      setResults(data.results);
      setTotal(data.total);
      setTotalPages(Math.ceil(data.total / 20));
    } catch {
      setSearchError('שגיאה בחיפוש. אנא נסו שוב.');
    } finally {
      setIsLoadingResults(false);
    }
  }, [query, categorySlug, pageParam]);

  useEffect(() => {
    if (query) {
      fetchResults();
      startAnswer(query);
    }
  }, [query, fetchResults, startAnswer]);

  const handleSearch = (q: string) => {
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const handlePageChange = (page: number) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('page', String(page));
    router.push(`/search?${sp.toString()}`);
  };

  return (
    <div className="container-page">
      <section className="pt-8 pb-4">
        <div className="max-w-2xl mx-auto">
          <SearchBar defaultValue={query} onSearch={handleSearch} />
        </div>
      </section>

      <section className="pb-6">
        <CategoryBar activeSlug={categorySlug} />
      </section>

      {query ? (
        <>
          {/* AI Answer with aria-live for screen reader announcements */}
          <section className="pb-8 animate-slide-up" aria-label="תשובת AI">
            <div aria-live="polite" aria-atomic="false">
              {!answer && !isStreaming && !answerError ? (
                <AnswerSkeleton />
              ) : (
                <AiAnswer
                  answer={answer}
                  sources={sources}
                  confidence={confidence}
                  isStreaming={isStreaming}
                  error={answerError}
                />
              )}
            </div>
          </section>

          {/* Search Results with aria-live */}
          <section className="pb-8" aria-label="תוצאות חיפוש">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              תוצאות חיפוש{total > 0 && ` (${total})`}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {query && `עבור "${query}"`}
            </p>

            {searchError && (
              <div
                className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-6"
                role="alert"
              >
                {searchError}
              </div>
            )}

            <div aria-live="polite" aria-atomic="true">
              {isLoadingResults ? (
                <VideoGridSkeleton />
              ) : results.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
                    {results.map((r) => (
                      <VideoCard key={r.video.id} video={r.video} snippet={r.snippet} />
                    ))}
                  </div>
                  <Pagination
                    currentPage={pageParam}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                  />
                </>
              ) : (
                <div className="text-center py-16">
                  <svg
                    className="w-16 h-16 mx-auto text-gray-300 mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    לא נמצאו תוצאות
                  </h3>
                  <p className="text-gray-500 text-sm max-w-sm mx-auto">
                    נסו לחפש במילים אחרות או לבדוק את הקטגוריות למציאת תוכן רלוונטי
                  </p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="py-16 text-center">
          <div className="text-gray-300 mb-4">
            <svg
              className="w-20 h-20 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            חפשו שאלה בנושא בנייה
          </h2>
          <p className="text-gray-500">
            הקלידו שאלה ונמצא עבורכם את התשובה הטובה ביותר מתוך מאות סרטונים
          </p>
        </section>
      )}
    </div>
  );
}

export default function SearchClient() {
  return (
    <Suspense
      fallback={
        <div className="container-page pt-8">
          <div className="max-w-2xl mx-auto mb-8">
            <div className="skeleton h-12 w-full rounded-xl" />
          </div>
          <AnswerSkeleton />
          <div className="mt-8">
            <VideoGridSkeleton />
          </div>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
