import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CategoryArchive from '@/components/content/CategoryArchive';
import { categoryMetadata, loadPostCategory, loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { decodeSlug, parsePageNumber } from '@/lib/content/db';

export const revalidate = 3600;

interface Props {
  params: { slug: string; n: string };
}

/** /category/<slug>/page/<n>/ (post categories only; video categories paginate client-side). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = parsePageNumber(params.n);
  const category = page ? await loadPostCategory(decodeSlug(params.slug)) : null;
  if (!page || !category) return { robots: { index: false } };
  const result = await loadPostsPage(page, category.id);
  return categoryMetadata(category, page, totalPagesOf(result));
}

export default async function CategoryPagedPage({ params }: Props) {
  const page = parsePageNumber(params.n);
  if (!page) notFound();
  const category = await loadPostCategory(decodeSlug(params.slug));
  if (!category) notFound();
  return <CategoryArchive category={category} page={page} />;
}
