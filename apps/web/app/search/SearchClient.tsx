'use client';

import { Suspense } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SearchBar from '@/components/SearchBar';
import AnswerPreview from '@/components/advisor/AnswerPreview';
import CategoryBar from '@/components/CategoryBar';
import VideoCard from '@/components/VideoCard';
import Pagination from '@/components/Pagination';
import { VideoGridSkeleton, AnswerShimmer } from '@/components/Skeleton';
import { Search, SearchX, Sparkles } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { ChipLink } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { searchVideos } from '@/lib/api';
import { EXAMPLE_QUESTIONS } from '@/lib/home/questions';
import { AI_ENTRY, aiHref } from '@/lib/nav';
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
      setSearchError('החיפוש לא הצליח הפעם. נסו שוב בעוד רגע.');
    } finally {
      setIsLoadingResults(false);
    }
  }, [query, categorySlug, pageParam]);

  useEffect(() => {
    if (query) fetchResults();
  }, [query, fetchResults]);

  const handleSearch = (q: string) => {
    router.push(`/search/?q=${encodeURIComponent(q)}`);
  };

  const handlePageChange = (page: number) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('page', String(page));
    router.push(`/search/?${sp.toString()}`);
  };

  return (
    <div className="container-page">
      <section className="pb-4 pt-8 sm:pt-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-4 text-center text-headline-sm text-ink-900">חיפוש בסרטונים ובמאמרים</h1>
          <SearchBar defaultValue={query} onSearch={handleSearch} />
        </div>
      </section>

      <section className="pb-6">
        <CategoryBar activeSlug={categorySlug} />
      </section>

      {query ? (
        <>
          {/* The advisor's answer, short: the full conversation continues on /ask/ */}
          <div className="pb-8 motion-safe:animate-slide-up">
            <AnswerPreview query={query} />
          </div>

          {/* Search Results with aria-live */}
          <section className="pb-8" aria-labelledby="search-results-title">
            <h2 id="search-results-title" className="mb-1 text-title-lg text-ink-900">
              {total > 0 ? (
                <>
                  <span className="num">{total.toLocaleString('he-IL')}</span> סרטונים ופרקים
                </>
              ) : (
                'סרטונים ופרקים'
              )}
            </h2>
            <p className="mb-6 text-body-sm text-ink-600">עבור ״{query}״</p>

            {searchError && (
              <div
                className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-danger-700 text-sm mb-6"
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
                      <VideoCard
                        key={r.video.id}
                        video={r.video}
                        snippet={r.snippet}
                        matchingSegmentTime={r.matching_segment_time}
                        segmentThumbnailUrl={r.segment_thumbnail_url}
                      />
                    ))}
                  </div>
                  <Pagination
                    currentPage={pageParam}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                  />
                </>
              ) : searchError ? null : (
                <EmptyState
                  icon={<SearchX />}
                  title="לא מצאנו סרטונים עם המילים האלה"
                  description="נסו מילה אחרת או קצרה יותר. אפשר גם לשאול את השאלה במילים שלכם, ונחפש לכם גם בפודקאסט ובמאמרים."
                  actions={
                    <ButtonLink href={aiHref(query)} prefetch={false} iconStart={<Sparkles />}>
                      {AI_ENTRY.label}
                    </ButtonLink>
                  }
                />
              )}
            </div>
          </section>
        </>
      ) : (
        <section aria-labelledby="search-start" className="pb-16 pt-6">
          <EmptyState
            variant="plain"
            icon={<Search />}
            title="מה תרצו למצוא?"
            description="חפשו נושא, או בחרו אחת מהשאלות שבונים שואלים הכי הרבה:"
            className="py-6"
          />
          <h2 id="search-start" className="sr-only">
            שאלות שבונים שואלים
          </h2>
          <ul className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <li key={q.text}>
                <ChipLink href={aiHref(q.text)} prefetch={false}>
                  {q.text}
                </ChipLink>
              </li>
            ))}
          </ul>
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
          <AnswerShimmer />
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
