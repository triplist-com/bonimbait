import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { absoluteUrl } from '@/lib/site';
import { type ListingFilters, listingHref } from '@/lib/directory/listing';
import { listingHeading, loadListing } from './DirectoryListing';

// Yoast values of the live /recommended/ page (data/migration/pages.json).
const LIVE_TITLE = 'מומלצי הקהילה: כל בעלי המקצוע שתוכלו להיעזר בהם בבניה | בונים בית';
const LIVE_DESCRIPTION =
  'מומלצי קהילה: כאן תמצאו את כל בעלי המקצוע המסווגים לפי תחום ההתמחות שלהם עם ההמלצה החמה שלנו. בניית בית החלומות כבר לא כל כך רחוק >>';

/**
 * Listing metadata. Specialty/region views and pages are indexable with a
 * self canonical; sort order is dropped from the canonical; free-text
 * searches are noindex.
 */
export async function listingMetadata(filters: ListingFilters): Promise<Metadata> {
  // A page past the end is a real 404 (like WordPress). Checked here because
  // metadata resolves before the root loading.tsx starts streaming a 200.
  if (filters.page > 1) {
    const { result } = await loadListing(filters);
    if (filters.page > result.pageCount) notFound();
  }
  const canonical = absoluteUrl(
    listingHref({ specialty: filters.specialty, region: filters.region, page: filters.page }),
  );
  const pageSuffix = filters.page > 1 ? ` - עמוד ${filters.page}` : '';
  const robots = filters.q ? { index: false, follow: true } : undefined;

  if (!filters.specialty && !filters.region) {
    const title = filters.page > 1 ? LIVE_TITLE.replace(' | בונים בית', `${pageSuffix} | בונים בית`) : LIVE_TITLE;
    return {
      title: { absolute: title },
      description: LIVE_DESCRIPTION,
      alternates: { canonical },
      robots,
      openGraph: { title, description: LIVE_DESCRIPTION, url: canonical, type: 'website', locale: 'he_IL' },
    };
  }

  let heading = 'נבחרת המומלצים';
  try {
    const { result } = await loadListing(filters);
    heading = listingHeading(result.specialty, result.region);
  } catch {
    // DB unavailable: fall back to a generic title.
  }
  const title = `${heading}: המלצות ודירוג לקוחות${pageSuffix} | בונים בית`;
  const description = `${heading} - בעלי מקצוע מומלצים מקהילת בונים בית, עם חוות דעת ודירוג של בונים ומשפצים.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots,
    openGraph: { title, description, url: canonical, type: 'website', locale: 'he_IL' },
  };
}
