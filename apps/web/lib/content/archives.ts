import 'server-only';

import { cache } from 'react';
import type { Metadata } from 'next';
import type { AuthorRow, PostCategoryRow } from '@/lib/db/types';
import { getAuthorBySlug, getPostCategoryBySlug, listPublishedPosts, type PostSummary } from '@/lib/db/posts';
import { getPublishedPageBySlug } from '@/lib/db/pages';
import type { Paginated } from '@/lib/db/client';
import { getPublicDb } from './db';
import { buildContentMetadata, canonicalPath, pagedPath, pagedTitle } from './seo';
import { htmlToText } from './sanitize';

/** Posts per archive page. */
export const ARCHIVE_PAGE_SIZE = 12;

const EMPTY: Paginated<PostSummary> = { items: [], total: 0, page: 1, pageSize: ARCHIVE_PAGE_SIZE };

export function totalPagesOf(result: Paginated<unknown>): number {
  return Math.max(1, Math.ceil(result.total / result.pageSize));
}

// Primitive arguments so React's per-request cache can dedupe metadata + page calls.
export const loadPostsPage = cache(
  async (page: number, categoryId?: string, authorId?: string): Promise<Paginated<PostSummary>> => {
    const db = getPublicDb();
    if (!db) return { ...EMPTY, page };
    return listPublishedPosts(db, { page, pageSize: ARCHIVE_PAGE_SIZE, categoryId, authorId });
  },
);

export const loadPostCategory = cache(async (slug: string): Promise<PostCategoryRow | null> => {
  const db = getPublicDb();
  return db ? getPostCategoryBySlug(db, slug) : null;
});

export const loadAuthor = cache(async (slug: string): Promise<AuthorRow | null> => {
  const db = getPublicDb();
  return db ? getAuthorBySlug(db, slug) : null;
});

// Live Yoast values for /blog/ (used when the `blog` pages row has none).
const BLOG_SEO_TITLE = 'הבלוג שלנו - כל המידע שצריך לדעת לבניה או לשיפוץ I בונים בית';
const BLOG_SEO_DESCRIPTION =
  'הבלוג שלנו - בבלוג, תוכלו למצוא מדריך וטיפים חשובים לבנייה או לשיפוץ. החל משלב הרכישה ועד לשלב כניסה לבית. קליק למדריך >>>';

export async function blogMetadata(page: number): Promise<Metadata> {
  const db = getPublicDb();
  const row = db ? await getPublishedPageBySlug(db, 'blog').catch(() => null) : null;
  const result = await loadPostsPage(page);
  const total = totalPagesOf(result);
  const seoTitle = row?.seo_title || BLOG_SEO_TITLE;
  return buildContentMetadata({
    path: pagedPath('/blog/', page),
    title: 'מרכז הידע לבניית בית',
    seoTitle: pagedTitle(seoTitle, page, total),
    description: row?.seo_description || BLOG_SEO_DESCRIPTION,
  });
}

export function categoryMetadata(category: PostCategoryRow, page: number, totalPages: number): Metadata {
  const base = `/category/${category.slug}/`;
  const seoTitle = category.seo_title || `${category.name} - בונים בית`;
  return buildContentMetadata({
    path: pagedPath(base, page),
    canonical: page > 1 ? pagedPath(base, page) : canonicalPath(category, base),
    title: category.name,
    seoTitle: pagedTitle(seoTitle, page, totalPages),
    description:
      category.seo_description ||
      htmlToText(category.description, 160) ||
      `מדריכים, טיפים ומידע מקצועי בנושא ${category.name} לבנייה פרטית בישראל.`,
  });
}

export function authorMetadata(author: AuthorRow, page: number, totalPages: number): Metadata {
  const base = `/author/${author.slug}/`;
  return buildContentMetadata({
    path: pagedPath(base, page),
    title: author.name,
    seoTitle: pagedTitle(`${author.name}, מחבר ב-בונים בית`, page, totalPages),
    description: htmlToText(author.bio_html, 160) || `כל המאמרים של ${author.name} בבונים בית.`,
    type: 'profile',
  });
}
