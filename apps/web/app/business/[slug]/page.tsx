import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getPublishedBusinessBySlug, parseGallery } from '@/lib/db/businesses';
import { getReviewStats, listApprovedReviews } from '@/lib/db/reviews';
import { absoluteUrl } from '@/lib/site';
import { businessHref, businessPath, decodeSlug, reviewCountLabel } from '@/lib/directory/format';
import { excerpt, htmlToText, jsonLd, sanitizeHtml } from '@/lib/directory/html';
import { listingHref } from '@/lib/directory/listing';
import { createPublicClient } from '@/lib/directory/server';
import BusinessLogo from '@/components/directory/BusinessLogo';
import RatingBadge from '@/components/directory/RatingBadge';
import Gallery from '@/components/directory/Gallery';
import { ContactBusinessForm, ShowPhoneButton } from '@/components/directory/ContactLead';
import { ReviewList, ScoreSummary } from '@/components/directory/Reviews';

// Public data only (no cookies), so profiles are cached and refreshed every 5 minutes.
export const revalidate = 300;

type Props = { params: { slug: string } };

const load = cache(async (rawSlug: string) => {
  const slug = decodeSlug(rawSlug);
  const db = createPublicClient();
  const business = await getPublishedBusinessBySlug(db, slug);
  if (!business) return null;
  const [reviews, statsMap] = await Promise.all([
    listApprovedReviews(db, business.id),
    getReviewStats(db, [business.id]),
  ]);
  return { business, reviews, stats: statsMap.get(business.id) ?? null };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params.slug);
  if (!data) return { title: 'בעל המקצוע לא נמצא', robots: { index: false } };
  const { business } = data;
  const canonical = absoluteUrl(businessPath(business.slug));
  // Yoast pattern of the live site when the import has no stored title.
  const title = business.seo_title || `${business.name}: המלצות וביקורות מאומתות על ${business.name} | בונים בית`;
  const description =
    business.seo_description ||
    excerpt(business.tagline || htmlToText(business.description_html), 155) ||
    `מחפשים ${business.name}? כל הפתרונות לבניית הבית במקום אחד! חוות דעת על כל בעלי המקצוע שלנו>>`;
  const image = business.cover_image_url || business.logo_url || undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'profile',
      locale: 'he_IL',
      images: image ? [{ url: image }] : undefined,
    },
  };
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 text-2xl font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

export default async function BusinessPage({ params }: Props) {
  const data = await load(params.slug);
  if (!data) notFound();
  const { business, reviews, stats } = data;

  const gallery = parseGallery(business.gallery);
  const specialties = [...business.specialties].sort(
    (a, b) => Number(b.id === business.primary_specialty_id) - Number(a.id === business.primary_specialty_id),
  );
  const nationwide = business.regions.find((r) => r.is_nationwide);
  const aboutHtml = sanitizeHtml(business.description_html);
  const url = absoluteUrl(businessPath(business.slug));
  const reviewCount = stats?.review_count ?? 0;

  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${url}#business`,
        name: business.name,
        url,
        description: excerpt(business.tagline || htmlToText(business.description_html), 300) || undefined,
        image: business.logo_url || business.cover_image_url || undefined,
        logo: business.logo_url || undefined,
        address: business.city ? { '@type': 'PostalAddress', addressLocality: business.city, addressCountry: 'IL' } : undefined,
        areaServed: nationwide
          ? { '@type': 'Country', name: 'ישראל' }
          : business.regions.map((r) => ({ '@type': 'Place', name: r.name })),
        knowsAbout: specialties.map((s) => s.name),
        aggregateRating:
          stats && reviewCount > 0
            ? {
                '@type': 'AggregateRating',
                ratingValue: Number(stats.rating_avg).toFixed(1),
                bestRating: 10,
                worstRating: 0,
                ratingCount: reviewCount,
                reviewCount,
              }
            : undefined,
        review: reviews.slice(0, 5).map((r) => ({
          '@type': 'Review',
          author: { '@type': 'Person', name: r.author_name?.trim() || 'לקוח/ה' },
          datePublished: (r.published_at ?? r.created_at).slice(0, 10),
          reviewBody: r.body ? excerpt(r.body, 500) : undefined,
          reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 10, worstRating: 0 },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'בונים בית', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'נבחרת המומלצים', item: absoluteUrl('/recommended/') },
          { '@type': 'ListItem', position: 3, name: business.name, item: url },
        ],
      },
    ],
  };

  const reviewHref = `${businessHref(business.slug)}review/`;
  const tabs = [
    { id: 'about', label: 'אודות', show: !!aboutHtml },
    { id: 'reviews', label: 'חוות דעת', show: true },
    { id: 'specialties', label: 'התמחויות', show: specialties.length > 0 },
    { id: 'regions', label: 'אזורי שירות', show: business.regions.length > 0 },
    { id: 'gallery', label: 'גלריה', show: gallery.length > 0 },
  ].filter((t) => t.show);

  return (
    <div className="pb-16">
      <div className="border-b border-gray-100 bg-white">
        <div className="container-page py-6 sm:py-10">
          <nav aria-label="פירורי לחם" className="mb-4 text-sm text-gray-500">
            <Link href="/" className="hover:text-primary">
              בונים בית
            </Link>
            <span className="mx-2">/</span>
            <Link href="/recommended/" className="hover:text-primary">
              נבחרת המומלצים
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-700">{business.name}</span>
          </nav>
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <BusinessLogo name={business.name} src={business.logo_url} className="h-24 w-24 sm:h-28 sm:w-28" />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{business.name}</h1>
              {specialties.length > 0 && (
                <p className="mt-1 text-lg text-gray-600">{specialties.map((s) => s.name).join(' · ')}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <RatingBadge percent={stats?.rating_percent} count={reviewCount} size="lg" />
                <Link href={reviewHref} rel="nofollow" className="text-sm font-semibold text-primary hover:underline">
                  השאר/י חוות דעת
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
              <ShowPhoneButton businessId={business.id} businessName={business.name} />
              <a
                href="#reviews"
                className="rounded-xl border border-gray-200 px-5 py-3 text-center font-semibold text-gray-700 hover:border-primary"
              >
                לכל החוות דעת
              </a>
            </div>
          </div>
          {tabs.length > 1 && (
            <nav aria-label="ניווט בעמוד" className="-mb-px mt-6 flex gap-5 overflow-x-auto text-sm font-semibold">
              {tabs.map((t) => (
                <a key={t.id} href={`#${t.id}`} className="whitespace-nowrap border-b-2 border-transparent pb-2 text-gray-600 hover:border-primary hover:text-primary">
                  {t.label}
                </a>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="container-page mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-12">
          {aboutHtml && (
            <Section id="about" title={`קצת על ${business.name}`}>
              <div
                className="prose-directory space-y-3 leading-7 text-gray-700 [&_a]:text-primary [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6"
                dangerouslySetInnerHTML={{ __html: aboutHtml }}
              />
            </Section>
          )}

          <Section id="reviews" title="חוות דעת">
            <p className="mb-4 text-sm text-gray-600">
              האמון שלך הוא הדאגה העיקרית שלנו. אנו שואפים לשמור על הביקורות אמינות, כנות והוגנות. הציון המשוקלל
              מחושב מארבע קטגוריות הדירוג של בונים בית.
            </p>
            <ScoreSummary stats={stats} />
            <div className="mt-6">
              <ReviewList reviews={reviews} />
            </div>
            <Link
              href={reviewHref}
              rel="nofollow"
              className="mt-6 inline-block rounded-xl border border-primary px-5 py-2.5 font-semibold text-primary hover:bg-primary-50"
            >
              השארת חוות דעת
            </Link>
          </Section>

          {specialties.length > 0 && (
            <Section id="specialties" title="התמחויות">
              <ul className="flex flex-wrap gap-2">
                {specialties.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={listingHref({ specialty: s.slug })}
                      className="inline-block rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700 hover:bg-primary-100"
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {business.regions.length > 0 && (
            <Section id="regions" title="אזורי שירות">
              <ul className="flex flex-wrap gap-2">
                {business.regions.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={listingHref({ region: r.slug })}
                      className="inline-block rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-primary"
                    >
                      {r.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {gallery.length > 0 && (
            <Section id="gallery" title="גלריה">
              <p className="mb-3 text-sm text-gray-500">{gallery.length} תמונות</p>
              <Gallery images={gallery} businessName={business.name} />
            </Section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
            <h2 className="text-lg font-bold text-gray-900">יצירת קשר עם {business.name}</h2>
            <p className="mb-4 mt-1 text-sm text-gray-500">
              {reviewCount > 0 ? `${stats?.rating_percent}% · ${reviewCountLabel(reviewCount)}` : 'השאירו פרטים ונחזור אליכם'}
            </p>
            <ContactBusinessForm businessId={business.id} businessName={business.name} />
          </div>
          {!business.owner_member_id && (
            <div className="rounded-2xl bg-gray-50 p-5 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">זה העסק שלך?</p>
              <p className="mt-1">בקשו גישה לניהול הפרופיל: עדכון פרטים, גלריה וצפייה בפניות וחוות דעת.</p>
              <Link href={`${businessHref(business.slug)}claim/`} rel="nofollow" className="mt-2 inline-block font-semibold text-primary hover:underline">
                בקשת ניהול העסק
              </Link>
            </div>
          )}
        </aside>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
    </div>
  );
}
