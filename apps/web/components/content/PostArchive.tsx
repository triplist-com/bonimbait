import type { ReactNode } from 'react';
import type { PostSummary } from '@/lib/db/posts';
import type { Crumb } from '@/lib/content/seo';
import { getCategoryMap } from '@/lib/content/queries';
import ArchivePagination from './ArchivePagination';
import Breadcrumbs from './Breadcrumbs';
import { PostGrid } from './PostCard';

interface PostArchiveProps {
  title: string;
  intro?: ReactNode;
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
  }));

  return (
    <div className="pb-16">
      <header className="hero-bg pt-6 sm:pt-10 pb-10">
        <div className="container-page">
          <Breadcrumbs crumbs={crumbs} />
          <h1 className="mt-6 text-3xl sm:text-4xl font-bold text-gray-900">
            {title}
            {page > 1 && <span className="text-gray-400 font-normal text-xl sm:text-2xl"> · עמוד {page}</span>}
          </h1>
          {intro && page === 1 && <div className="mt-4 text-lg text-gray-500 max-w-3xl leading-relaxed">{intro}</div>}
        </div>
      </header>
      <div className="container-page">
        {before}
        {cards.length > 0 ? (
          <PostGrid posts={cards} priorityCount={3} />
        ) : (
          <p className="py-16 text-center text-gray-500">עדיין אין כאן מאמרים.</p>
        )}
        <ArchivePagination basePath={basePath} currentPage={page} totalPages={totalPages} />
        {after}
      </div>
    </div>
  );
}
