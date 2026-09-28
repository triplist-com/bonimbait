import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import type { VideoPageRow } from '@/lib/db/types';
import { getCategoryMap } from '@/lib/content/queries';
import { htmlToText, prepareContentHtml } from '@/lib/content/sanitize';
import { canonicalPath, formatHebrewDate } from '@/lib/content/seo';
import { findIndexedYoutubeId, legacyCategories, loadVideoPagesForYoutubeIds, videoThumb } from '@/lib/content/videos';
import { absoluteUrl } from '@/lib/site';
import ArticleBody from './ArticleBody';
import Breadcrumbs from './Breadcrumbs';
import ConsultationCTAPlaceholder from './ConsultationCTAPlaceholder';
import VideoPageCard from './VideoPageCard';

function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gray-900 shadow-card">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 w-full h-full border-0"
      />
    </div>
  );
}

/** Legacy WordPress /video/<hebrew-slug>/ page (videos and podcast episodes). */
export default async function LegacyVideoPage({ page }: { page: VideoPageRow }) {
  const path = `/video/${page.legacy_slug}/`;
  const { html, jsonLd } = prepareContentHtml(page.body_html);
  const indexedId = findIndexedYoutubeId(page.youtube_ids ?? []);
  const [more, categoryMap] = await Promise.all([
    loadVideoPagesForYoutubeIds(page.related_youtube_ids ?? [], page.id, 6),
    getCategoryMap(),
  ]);
  const postCategorySlugs = new Set(Array.from(categoryMap.values()).map((c) => c.slug.normalize('NFC')));
  const cats = legacyCategories(page.legacy_categories);
  const thumb = videoThumb(page);
  const description = page.seo_description || htmlToText(page.excerpt || page.body_html, 200) || page.title;
  const kindLabel = page.kind === 'podcast' ? 'פודקאסט' : 'וידאו';

  return (
    <div className="pb-16">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'VideoObject',
          name: page.title,
          description,
          thumbnailUrl: thumb ? [thumb] : undefined,
          uploadDate: page.published_at ?? page.created_at,
          embedUrl: page.youtube_ids?.[0] ? `https://www.youtube.com/embed/${page.youtube_ids[0]}` : undefined,
          url: absoluteUrl(canonicalPath(page, path)),
          inLanguage: 'he-IL',
        }}
      />
      {jsonLd.map((node, i) => (
        <StructuredData key={i} data={node} />
      ))}

      <div className="container-page max-w-5xl pt-6 sm:pt-10">
        <Breadcrumbs
          crumbs={[
            { label: 'ראשי', href: '/' },
            { label: 'בונים בית TV', href: '/בונים-בית-tv/' },
            { label: page.title, href: path },
          ]}
        />

        <header className="mt-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-white bg-secondary px-2.5 py-1 rounded-full">{kindLabel}</span>
            {cats.map((c) =>
              postCategorySlugs.has(c.slug.normalize('NFC')) ? (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}/`}
                  className="text-xs font-semibold text-primary bg-primary-50 px-2.5 py-1 rounded-full hover:bg-primary-100"
                >
                  {c.name}
                </Link>
              ) : (
                <span key={c.slug || c.name} className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                  {c.name}
                </span>
              ),
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">{page.title}</h1>
          <p className="mt-3 text-sm text-gray-500 flex flex-wrap gap-x-4">
            {page.author_name && <span>{page.author_name}</span>}
            {page.published_at && <time dateTime={page.published_at}>{formatHebrewDate(page.published_at)}</time>}
          </p>
        </header>

        <div className="space-y-6">
          {(page.youtube_ids ?? []).length > 0 ? (
            page.youtube_ids.map((id, i) => (
              <YouTubeEmbed key={id} id={id} title={i === 0 ? page.title : `${page.title} (${i + 1})`} />
            ))
          ) : thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={page.title} className="w-full rounded-2xl shadow-card" />
          ) : null}
        </div>

        {indexedId && (
          <Link
            href={`/video/${indexedId}/`}
            className="mt-6 flex items-center gap-4 rounded-2xl gradient-border p-5 hover:shadow-glow transition-shadow"
          >
            <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-primary-50 text-primary flex items-center justify-center" aria-hidden="true">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </span>
            <span>
              <span className="block font-bold text-gray-900">סיכום AI עם חותמות זמן</span>
              <span className="block text-sm text-gray-500">נקודות מפתח, עלויות וקפיצה ישירה לרגע הרלוונטי בסרטון</span>
            </span>
          </Link>
        )}

        {html.trim() && <ArticleBody html={html} className="mt-10 max-w-3xl" />}

        <div className="mt-12">
          <ConsultationCTAPlaceholder source="video" />
        </div>

        {more.length > 0 && (
          <section className="mt-14" aria-labelledby="more-videos">
            <h2 id="more-videos" className="text-2xl font-bold text-gray-900 mb-6">
              סרטונים נוספים
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {more.map((v) => (
                <VideoPageCard key={v.id} video={v} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
