import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpecialPage } from '@/lib/special-pages';
import { decodeSlug } from '@/lib/content/db';
import { resolveRootContent } from '@/lib/content/root';
import { htmlToText } from '@/lib/content/sanitize';
import { buildContentMetadata, canonicalPath } from '@/lib/content/seo';
import PostArticle from '@/components/content/PostArticle';
import GenericPage from '@/components/content/GenericPage';

/**
 * Root-level WordPress URLs ("/<slug>/"). Resolution order (routing contract,
 * docs/sprints/WAVE2_BRIEF.md):
 *   1. special page from lib/special-pages (per-workstream registries)
 *   2. post
 *   3. `pages` row
 *   4. 404
 * Fixed routes (app/blog, app/search, …) always win over this segment.
 */

// ISR: pages are rendered on first request and refreshed hourly. Posts are not
// prebuilt (≈800 DB-backed pages would slow every build for little gain).
export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeSlug(params.slug);

  const special = getSpecialPage(slug);
  if (special) return special.metadata ? await special.metadata() : {};

  const found = await resolveRootContent(slug);
  // notFound() here (not only in the page) so the response is a real 404:
  // app/loading.tsx makes the page body stream after a 200 has been sent.
  if (!found) notFound();

  if (found.type === 'post') {
    const { post } = found;
    return buildContentMetadata({
      path: `/${post.slug}/`,
      canonical: canonicalPath(post, `/${post.slug}/`),
      title: post.title,
      seoTitle: post.seo_title,
      description: post.seo_description || htmlToText(post.excerpt || post.content_html, 160),
      image: post.featured_image,
      noindex: post.noindex,
      type: 'article',
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
    });
  }

  const { page } = found;
  return buildContentMetadata({
    path: `/${page.slug}/`,
    canonical: canonicalPath(page, `/${page.slug}/`),
    title: page.title,
    seoTitle: page.seo_title,
    description: page.seo_description || htmlToText(page.excerpt || page.content_html, 160) || undefined,
    image: page.featured_image,
    noindex: page.noindex,
  });
}

export default async function RootSlugPage({ params }: Props) {
  const slug = decodeSlug(params.slug);

  const special = getSpecialPage(slug);
  if (special) {
    const { default: Component } = await special.load();
    return <Component />;
  }

  const found = await resolveRootContent(slug);
  if (!found) notFound();
  if (found.type === 'post') return <PostArticle post={found.post} />;
  return <GenericPage page={found.page} />;
}
