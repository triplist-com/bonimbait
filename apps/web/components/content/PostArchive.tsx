import type { ReactNode } from 'react';
import type { PostSummary } from '@/lib/db/posts';
import type { Crumb } from '@/lib/content/seo';
import { getCategoryMap } from '@/lib/content/queries';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import ArchivePagination from './ArchivePagination';
import Breadcrumbs from './Breadcrumbs';
import { PostGrid } from './PostCard';

interface PostArchiveProps {
  title: string;
  intro?: ReactNode;
  /** Small line above the title (e.g. "מדריך הבנייה", "שלב 4 מתוך 7"). */
  eyebrow?: ReactNode;
  crumbs: Crumb[];
  basePath: string;
  page: number;
  totalPages: number;
  posts: PostSummary[];
  /** Rendered between the header and the grid (e.g. stage navigation). */
  before?: ReactNode;
  /** Rendered after the pagination. */
  after?: ReactNode;
}

/** Shared layout for /blog/, /category/<slug>/ and /author/<slug>/ archives. */
export default async function PostArchive({
  title,
  intro,
  eyebrow,
  crumbs,
  basePath,
  page,
  totalPages,
  posts,
  before,
  after,
}: PostArchiveProps) {
  const categories = await getCategoryMap();
  const cards = posts.map((p) => ({
    ...p,
    categoryName: p.primary_category_id ? categories.get(p.primary_category_id)?.name ?? null : null,
    categorySlug: p.primary_category_id ? categories.get(p.primary_category_id)?.slug ?? null : null,
  }));

  return (
    <div className="pb-16">
      <PageHeader
        crumbs={<Breadcrumbs crumbs={crumbs} />}
        eyebrow={eyebrow}
        title={
          <>
            {title}
            {page > 1 && (
              <span className="text-[0.55em] font-medium text-ink-400">
                {' '}· עמוד <span className="num">{page}</span>
              </span>
            )}
          </>
        }
        description={intro && page === 1 ? intro : undefined}
      />
      <div className="container-page pt-2">
        {before}
        {cards.length > 0 ? (
          <div className="pt-6">
            <PostGrid posts={cards} priorityCount={3} />
          </div>
        ) : (
          <EmptyState className="my-12" title="עדיין אין כאן מאמרים" description="בקרוב יעלו לכאן מדריכים חדשים. בינתיים אפשר לשאול כל שאלה בתיבת השאלות." />
        )}
        <ArchivePagination basePath={basePath} currentPage={page} totalPages={totalPages} />
        {after}
      </div>
    </div>
  );
}
