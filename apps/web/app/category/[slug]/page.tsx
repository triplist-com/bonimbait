import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCategories as getVideoCategories } from '@/app/api/_lib/data';
import CategoryArchive from '@/components/content/CategoryArchive';
import { categoryMetadata, loadPostCategory, loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { decodeSlug } from '@/lib/content/db';
import { absoluteUrl } from '@/lib/site';
import CategoryPageClient from './CategoryPageClient';

/**
 * /category/<slug>/ serves two taxonomies (their slugs don't overlap):
 *  1. WordPress post categories (`post_categories`, 14 on the live site,
 *     Hebrew or numeric slugs such as /category/311/): the article archive
 *  2. otherwise the AI-index video categories (English slugs from
 *     data/videos.json): the existing client-side video listing
 */

export const revalidate = 3600;

interface Props {
  params: { slug: string };
}

function findVideoCategory(slug: string) {
  try {
    return getVideoCategories().find((c) => c.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeSlug(params.slug);

  const postCategory = await loadPostCategory(slug);
  if (postCategory) {
    const result = await loadPostsPage(1, postCategory.id);
    return categoryMetadata(postCategory, 1, totalPagesOf(result));
  }

  const category = findVideoCategory(slug);
  if (!category) return { title: 'הקטגוריה לא נמצאה', robots: { index: false } };
  const name = category.name_he;
  const description = category.description_he || `כל הסרטונים והמידע בנושא ${name} לבנייה פרטית בישראל`;
  return {
    title: name,
    description,
    alternates: { canonical: absoluteUrl(`/category/${slug}/`) },
    openGraph: {
      title: `${name} - בונים בית`,
      description,
      type: 'website',
      url: absoluteUrl(`/category/${slug}/`),
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const slug = decodeSlug(params.slug);

  const postCategory = await loadPostCategory(slug);
  if (postCategory) return <CategoryArchive category={postCategory} page={1} />;

  if (!findVideoCategory(slug)) notFound();
  return <CategoryPageClient />;
}
