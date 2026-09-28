import StructuredData from '@/components/StructuredData';
import type { PageRow } from '@/lib/db/types';
import { htmlToText, prepareContentHtml } from '@/lib/content/sanitize';
import { canonicalPath } from '@/lib/content/seo';
import { absoluteUrl } from '@/lib/site';
import ArticleBody from './ArticleBody';
import Breadcrumbs from './Breadcrumbs';

/** Generic renderer for `pages` rows without a special page (terms, privacy, landing pages…). */
export default function GenericPage({ page }: { page: PageRow }) {
  const { html, jsonLd } = prepareContentHtml(page.content_html);
  const path = `/${page.slug}/`;

  return (
    <div className="pb-16">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: page.title,
          url: absoluteUrl(canonicalPath(page, path)),
          inLanguage: 'he-IL',
        }}
      />
      {jsonLd.map((node, i) => (
        <StructuredData key={i} data={node} />
      ))}
      <header className="bg-gradient-to-b from-primary-50/60 to-transparent pt-6 sm:pt-10 pb-8">
        <div className="container-page max-w-4xl">
          <Breadcrumbs
            crumbs={[
              { label: 'ראשי', href: '/' },
              { label: page.title, href: path },
            ]}
          />
          <h1 className="mt-6 text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">{page.title}</h1>
        </div>
      </header>
      <div className="container-page max-w-4xl">
        {page.featured_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.featured_image}
            alt={page.featured_image_alt || page.title}
            className="w-full max-h-[26rem] object-cover rounded-3xl shadow-card mb-10"
            decoding="async"
          />
        )}
        {html.trim() ? (
          <ArticleBody html={html} className="max-w-3xl" />
        ) : (
          <p className="text-gray-500">{htmlToText(page.excerpt, 500) || page.title}</p>
        )}
      </div>
    </div>
  );
}
