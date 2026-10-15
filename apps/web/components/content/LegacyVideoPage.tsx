import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import StructuredData from '@/components/StructuredData';
import { YouTubeFacade } from '@/components/ui/YouTubeFacade';
import { Badge } from '@/components/ui/Badge';
import type { VideoPageRow } from '@/lib/db/types';
import { getCategoryMap } from '@/lib/content/queries';
import { htmlToText, prepareContentHtml } from '@/lib/content/sanitize';
import { canonicalPath, formatHebrewDate } from '@/lib/content/seo';
import { findAiPageYoutubeId, legacyCategories, loadVideoPagesForYoutubeIds, videoThumb } from '@/lib/content/videos';
import { absoluteUrl } from '@/lib/site';
import ArticleBody from './ArticleBody';
import Breadcrumbs from './Breadcrumbs';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import PartnerOfferSlot from '@/components/revenue/PartnerOfferSlot';
import VideoPageCard from './VideoPageCard';

/** Legacy WordPress /video/<hebrew-slug>/ page (videos and podcast episodes). */
export default async function LegacyVideoPage({ page }: { page: VideoPageRow }) {
  const path = `/video/${page.legacy_slug}/`;
  const { html, jsonLd } = prepareContentHtml(page.body_html);
  const indexedId = await findAiPageYoutubeId(page.youtube_ids ?? []);
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
            <Badge tone="ink">{kindLabel}</Badge>
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
          <h1 className="text-headline text-ink-900">{page.title}</h1>
          <p className="mt-3 text-sm text-ink-500 flex flex-wrap gap-x-4">
            {page.author_name && <span>{page.author_name}</span>}
            {page.published_at && <time dateTime={page.published_at}>{formatHebrewDate(page.published_at)}</time>}
          </p>
        </header>

        <div className="space-y-6">
          {(page.youtube_ids ?? []).length > 0 ? (
            page.youtube_ids.map((id, i) => (
              <YouTubeFacade
                key={id}
                youtubeId={id}
                title={i === 0 ? page.title : `${page.title} (${i + 1})`}
                poster={i === 0 ? page.featured_image : null}
                priority={i === 0}
              />
            ))
          ) : thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={page.title} className="w-full rounded-2xl shadow-card" />
          ) : null}
        </div>

        {indexedId && (
          <Link
            href={`/video/${indexedId}/`}
            className="group mt-6 flex items-center gap-4 rounded-2xl gradient-border p-5 transition-shadow hover:shadow-card-hover"
          >
            <span className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center" aria-hidden="true">
              <Sparkles className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block font-bold text-ink-900">סיכום הסרטון, עם חותמות זמן</span>
              <span className="block text-sm text-ink-600">נקודות מפתח, עלויות וקפיצה ישירה לרגע הרלוונטי בסרטון</span>
            </span>
            <ArrowLeft aria-hidden="true" className="size-5 shrink-0 text-ink-400 transition-transform group-hover:-translate-x-1 ltr:rotate-180" />
          </Link>
        )}

        {html.trim() && <ArticleBody html={html} className="mt-10 max-w-3xl" />}

        {/* Sponsored partner offer for this video's topic (revenue; FLAG_REVENUE). */}
        <PartnerOfferSlot slot="video-page" context={{ topic: page.title, placement: 'video' }} className="mt-12 max-w-3xl" />

        <div className="mt-12">
          <ConsultationCTA variant="card" source="video-page" />
        </div>

        {more.length > 0 && (
          <section className="mt-14" aria-labelledby="more-videos">
            <h2 id="more-videos" className="text-headline-sm text-ink-900 mb-6">
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
