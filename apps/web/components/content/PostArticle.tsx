import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import type { PostRow } from '@/lib/db/types';
import { getAuthorById, getCategoriesForPost, listRelatedPosts } from '@/lib/db/posts';
import { getPublicDb, safeQuery } from '@/lib/content/db';
import { getCategoryMap } from '@/lib/content/queries';
import { htmlToText, prepareContentHtml, readingMinutes } from '@/lib/content/sanitize';
import { canonicalPath, formatHebrewDate } from '@/lib/content/seo';
import { SITE_NAME, absoluteUrl } from '@/lib/site';
import ArticleBody from './ArticleBody';
import Breadcrumbs from './Breadcrumbs';
import CommunityCTA from './CommunityCTA';
import ConsultationCTAPlaceholder from './ConsultationCTAPlaceholder';
import { PostGrid } from './PostCard';
import { TocInline, TocSidebar } from './TableOfContents';

/** Full article page for a migrated WordPress post (/<slug>/). */
export default async function PostArticle({ post }: { post: PostRow }) {
  const db = getPublicDb();
  const [categories, author, categoryMap] = await Promise.all([
    db ? safeQuery(() => getCategoriesForPost(db, post.id), []) : [],
    db && post.author_id ? safeQuery(() => getAuthorById(db, post.author_id as string), null) : null,
    getCategoryMap(),
  ]);

  const primary =
    (post.primary_category_id && categoryMap.get(post.primary_category_id)) || categories[0] || null;
  const related =
    db && primary
      ? await safeQuery(() => listRelatedPosts(db, { categoryId: primary.id, excludeId: post.id, limit: 3 }), [])
      : [];

  const { html, toc, jsonLd } = prepareContentHtml(post.content_html);
  const minutes = readingMinutes(html);
  const path = `/${post.slug}/`;
  const url = absoluteUrl(canonicalPath(post, path));

  const crumbs = [
    { label: 'ראשי', href: '/' },
    { label: 'מרכז הידע', href: '/blog/' },
    ...(primary ? [{ label: primary.name, href: `/category/${primary.slug}/` }] : []),
    { label: post.title, href: path },
  ];

  return (
    <article className="pb-16">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          description: post.seo_description || htmlToText(post.excerpt || post.content_html, 200),
          image: post.featured_image ? [post.featured_image] : undefined,
          datePublished: post.published_at ?? undefined,
          dateModified: post.updated_at,
          inLanguage: 'he-IL',
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          url,
          author: author
            ? { '@type': 'Person', name: author.name, url: absoluteUrl(`/author/${author.slug}/`) }
            : { '@type': 'Organization', name: SITE_NAME },
          publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
          articleSection: categories.map((c) => c.name),
        }}
      />
      {jsonLd.map((node, i) => (
        <StructuredData key={i} data={node} />
      ))}

      <header className="bg-gradient-to-b from-primary-50/60 to-transparent pt-6 sm:pt-10 pb-8">
        <div className="container-page max-w-5xl">
          <Breadcrumbs crumbs={crumbs} />
          {categories.length > 0 && (
            <ul className="flex flex-wrap gap-2 mt-6" aria-label="קטגוריות">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/category/${c.slug}/`}
                    className="inline-block text-xs font-semibold text-primary bg-white border border-primary-100 px-3 py-1 rounded-full hover:bg-primary-50 transition-colors"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-gray-900 leading-tight">
            {post.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
            {author && (
              <Link href={`/author/${author.slug}/`} className="flex items-center gap-2 hover:text-primary transition-colors">
                {author.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={author.avatar_url} alt="" width={28} height={28} className="w-7 h-7 rounded-full" loading="lazy" />
                )}
                <span className="font-medium text-gray-700">{author.name}</span>
              </Link>
            )}
            {post.published_at && (
              <time dateTime={post.published_at}>{formatHebrewDate(post.published_at)}</time>
            )}
            <span>{minutes} דקות קריאה</span>
          </div>
        </div>
      </header>

      <div className="container-page max-w-5xl">
        {post.featured_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featured_image}
            alt={post.featured_image_alt || post.title}
            className="w-full max-h-[30rem] object-cover rounded-3xl shadow-card mb-10"
            loading="eager"
            decoding="async"
          />
        )}

        <div className={toc.length >= 4 ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10' : ''}>
          <div className="min-w-0 max-w-3xl">
            <TocInline items={toc} />
            <ArticleBody html={html} />
            <div className="mt-12">
              <ConsultationCTAPlaceholder source="post" />
            </div>
            {author?.bio_html && (
              <section aria-label="על הכותב" className="mt-10 flex gap-4 rounded-2xl bg-white border border-gray-100 p-6">
                {author.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={author.avatar_url} alt="" width={56} height={56} className="w-14 h-14 rounded-full flex-shrink-0" loading="lazy" />
                )}
                <div>
                  <p className="font-bold text-gray-900 mb-1">
                    <Link href={`/author/${author.slug}/`} className="hover:text-primary">
                      {author.name}
                    </Link>
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed">{htmlToText(author.bio_html, 400)}</p>
                </div>
              </section>
            )}
          </div>
          {toc.length >= 4 && (
            <aside className="hidden lg:block">
              <TocSidebar items={toc} />
            </aside>
          )}
        </div>

        <div className="mt-12">
          <CommunityCTA compact />
        </div>

        {related.length > 0 && primary && (
          <section className="mt-14" aria-labelledby="related-heading">
            <div className="flex items-center justify-between mb-6">
              <h2 id="related-heading" className="text-2xl font-bold text-gray-900">
                עוד ב{primary.name}
              </h2>
              <Link href={`/category/${primary.slug}/`} className="text-sm font-medium text-primary hover:text-primary-700">
                לכל המדריכים
              </Link>
            </div>
            <PostGrid posts={related.map((r) => ({ ...r, categoryName: primary.name }))} />
          </section>
        )}
      </div>
    </article>
  );
}
