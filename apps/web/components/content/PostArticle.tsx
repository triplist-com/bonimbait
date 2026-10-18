import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import StructuredData from '@/components/StructuredData';
import { ChipLink } from '@/components/ui/Chip';
import { SmartImage } from '@/components/ui/SmartImage';
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
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import AskAbout from '@/components/advisor/AskAbout';
import PartnerOfferSlot from '@/components/revenue/PartnerOfferSlot';
import { stageForCategory } from '@/lib/stages';
import SaveButton from '@/components/hub/SaveButton';
import { isEnabled } from '@/lib/flags';
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

      <header className="relative isolate overflow-hidden bg-sand-50 pb-10 pt-6 sm:pb-12 sm:pt-8">
        <div aria-hidden="true" className="bg-blueprint mask-fade-b absolute inset-0 -z-10" />
        <div className="container-page max-w-5xl">
          <Breadcrumbs crumbs={crumbs} />
          {categories.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="קטגוריות">
              {categories.map((c) => (
                <li key={c.id}>
                  <ChipLink href={`/category/${c.slug}/`} size="sm" prefetch={false}>
                    {c.name}
                  </ChipLink>
                </li>
              ))}
            </ul>
          )}
          <h1 className="mt-5 text-[2rem] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink-900 sm:text-[2.625rem] sm:leading-[1.15]">
            {post.title}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600">
            {author && (
              <Link href={`/author/${author.slug}/`} className="flex items-center gap-2.5 transition-colors hover:text-primary-700">
                {author.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={author.avatar_url} alt="" width={32} height={32} className="size-8 rounded-full ring-2 ring-white" loading="lazy" />
                )}
                <span className="font-semibold text-ink-900">{author.name}</span>
              </Link>
            )}
            {post.published_at && <time dateTime={post.published_at}>{formatHebrewDate(post.published_at)}</time>}
            <span className="inline-flex items-center gap-1.5">
              <Clock3 aria-hidden="true" className="size-4 text-ink-400" />
              <span className="num">{minutes}</span> דקות קריאה
            </span>
            {isEnabled('hub') && <SaveButton kind="post" refId={post.slug} title={post.title} />}
          </div>
        </div>
      </header>

      <div className="container-page max-w-5xl">
        {post.featured_image && (
          <div className="relative -mt-2 mb-10 aspect-[16/9] overflow-hidden rounded-3xl bg-sand-100 shadow-card sm:mt-6 sm:aspect-[2/1]">
            <SmartImage
              src={post.featured_image}
              alt={post.featured_image_alt || ''}
              priority
              sizes="(min-width: 1024px) 64rem, 100vw"
            />
          </div>
        )}

        <div className={toc.length >= 4 ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10' : ''}>
          <div className="min-w-0 max-w-3xl">
            <TocInline items={toc} />
            <ArticleBody html={html} />
            <AskAbout kind="post" id={post.slug} className="mt-12" />
            {/* Sponsored partner offer for the article's topic and stage (revenue; FLAG_REVENUE). */}
            <PartnerOfferSlot
              slot="article"
              context={{ topic: post.title, stage: primary ? stageForCategory(primary.slug)?.id : null, placement: 'article' }}
              className="mt-12"
            />
            <div className="mt-12">
              <ConsultationCTA variant="card" source="post-footer" />
            </div>
            {author?.bio_html && (
              <section aria-label="על הכותב" className="mt-10 flex gap-4 rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
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
              <h2 id="related-heading" className="text-headline-sm text-ink-900">
                עוד ב{primary.name}
              </h2>
              <Link href={`/category/${primary.slug}/`} className="text-sm font-semibold text-ink-900 hover:text-primary-700">
                לכל המדריכים
              </Link>
            </div>
            <PostGrid posts={related.map((r) => ({ ...r, categoryName: primary.name, categorySlug: primary.slug }))} />
          </section>
        )}
      </div>
    </article>
  );
}
