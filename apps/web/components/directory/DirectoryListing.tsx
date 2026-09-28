import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { listDirectoryEntries, listRegions, listSpecialties } from '@/lib/db/businesses';
import { getReviewStats } from '@/lib/db/reviews';
import { absoluteUrl } from '@/lib/site';
import { jsonLd } from '@/lib/directory/html';
import { businessPath } from '@/lib/directory/format';
import {
  type ListingFilters as Filters,
  applyListing,
  hasActiveFilters,
  listingHref,
  pageWindow,
  PAGE_SIZE,
} from '@/lib/directory/listing';
import { createPublicClient } from '@/lib/directory/server';
import BusinessCard from './BusinessCard';
import ListingFilters, { SortSelect } from './ListingFilters';

/** Directory data, fetched once per request (shared by metadata and page). */
const loadDirectoryData = cache(async () => {
  const db = createPublicClient();
  const [entries, specialties, regions] = await Promise.all([
    listDirectoryEntries(db),
    listSpecialties(db),
    listRegions(db),
  ]);
  const stats = await getReviewStats(db, entries.map((e) => e.id));
  return { entries, specialties, regions, stats };
});

/** Shared data load for the listing and its metadata. */
export async function loadListing(filters: Filters) {
  const data = await loadDirectoryData();
  const result = applyListing(data.entries, filters, data);
  return { ...data, result };
}

export function listingHeading(specialty: { name: string } | null, region: { name: string } | null): string {
  if (specialty && region) return `${specialty.name} ב${region.name}`;
  if (specialty) return `${specialty.name} מומלצים`;
  if (region) return `בעלי מקצוע מומלצים ב${region.name}`;
  return 'נבחרת המומלצים של בונים בית';
}

export default async function DirectoryListing({ filters }: { filters: Filters }) {
  const { specialties, regions, stats, result } = await loadListing(filters);
  // /recommended/page/99/ beyond the last page: 404 like WordPress.
  if (filters.page > result.pageCount) notFound();

  const specialtyById = new Map(specialties.map((s) => [s.id, s]));
  const regionById = new Map(regions.map((r) => [r.id, r]));
  const heading = listingHeading(result.specialty, result.region);
  const sortHrefs = {
    default: listingHref({ ...filters, sort: 'default', page: 1 }),
    rating: listingHref({ ...filters, sort: 'rating', page: 1 }),
    comments: listingHref({ ...filters, sort: 'comments', page: 1 }),
  };

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: heading,
    numberOfItems: result.total,
    itemListElement: result.items.map((b, i) => ({
      '@type': 'ListItem',
      position: (result.page - 1) * PAGE_SIZE + i + 1,
      url: absoluteUrl(businessPath(b.slug)),
      name: b.name,
    })),
  };

  return (
    <div className="container-page py-8 sm:py-12">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{heading}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-gray-600">
          בעלי מקצוע וספקים שקיבלו המלצות מבונים ומשפצים בקהילה, עם דירוג וחוות דעת מאומתות.
        </p>
      </header>

      <ListingFilters
        filters={filters}
        specialties={specialties.map((s) => ({ slug: s.slug, name: s.name }))}
        regions={regions.map((r) => ({ slug: r.slug, name: r.name }))}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-gray-700" aria-live="polite">
          נמצאו <span className="font-bold">{result.total}</span> בעלי מקצוע מומלצים עבורך
          {hasActiveFilters(filters) && (
            <>
              {' · '}
              <Link href={listingHref({ sort: filters.sort })} className="text-primary hover:underline">
                ניקוי סינון
              </Link>
            </>
          )}
        </p>
        <SortSelect current={filters.sort} hrefs={sortHrefs} />
      </div>

      {result.items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-gray-800">לא נמצאו בעלי מקצוע שמתאימים לחיפוש.</p>
          <p className="mt-2 text-gray-600">נסו אזור אחר, התמחות אחרת או חיפוש כללי יותר.</p>
          <Link href="/recommended/" className="mt-4 inline-block font-semibold text-primary hover:underline">
            לכל בעלי המקצוע
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((b) => (
            <li key={b.id}>
              <BusinessCard business={b} specialties={specialtyById} regions={regionById} stats={stats.get(b.id)} />
            </li>
          ))}
        </ul>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="עמודים" className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {result.page > 1 && (
            <Link
              rel="prev"
              href={listingHref({ ...filters, page: result.page - 1 })}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:border-primary"
            >
              הקודם
            </Link>
          )}
          {pageWindow(result.page, result.pageCount).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-gray-400">
                …
              </span>
            ) : p === result.page ? (
              <span
                key={p}
                aria-current="page"
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
              >
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={listingHref({ ...filters, page: p })}
                aria-label={`עמוד ${p}`}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:border-primary"
              >
                {p}
              </Link>
            ),
          )}
          {result.page < result.pageCount && (
            <Link
              rel="next"
              href={listingHref({ ...filters, page: result.page + 1 })}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:border-primary"
            >
              הבא
            </Link>
          )}
        </nav>
      )}

      {/* Crawlable entry points for every specialty and region. */}
      <section className="mt-14 grid gap-6 border-t border-gray-100 pt-8 md:grid-cols-[2fr_1fr]">
        <details className="group" open={false}>
          <summary className="cursor-pointer text-lg font-bold text-gray-900">בעלי מקצוע לפי התמחות</summary>
          <ul className="mt-3 flex flex-wrap gap-2">
            {specialties.map((s) => (
              <li key={s.id}>
                <Link href={listingHref({ specialty: s.slug })} className="text-sm text-gray-700 hover:text-primary">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary className="cursor-pointer text-lg font-bold text-gray-900">בעלי מקצוע לפי אזור</summary>
          <ul className="mt-3 flex flex-wrap gap-2">
            {regions.map((r) => (
              <li key={r.id}>
                <Link href={listingHref({ region: r.slug })} className="text-sm text-gray-700 hover:text-primary">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <aside className="mt-10 rounded-2xl bg-primary-50 p-6 text-center">
        <p className="font-semibold text-gray-900">בעלי מקצוע? הצטרפו לנבחרת המומלצים של בונים בית</p>
        <Link href="/join-us/" className="mt-3 inline-block rounded-xl bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-700">
          הצטרפות כבעל מקצוע
        </Link>
      </aside>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemList) }} />
    </div>
  );
}
