import { notFound, permanentRedirect } from 'next/navigation';
import { listRegions, listSpecialties } from '@/lib/db/businesses';
import { decodeSlug } from '@/lib/directory/format';
import { listingHref } from '@/lib/directory/listing';
import { createPublicClient } from '@/lib/directory/server';

/**
 * Legacy filter URLs built by the live site's search box JS:
 *   /recommended/service/<specialty-slug>/[<region-slug>]
 *   /recommended/business/<region-slug>
 * They 301 to the query-string form (/recommended/?specialty=…&region=…).
 *
 * Live region term slugs → region label. Some live slugs don't match their
 * labels (e.g. "חיפה-קריות-והסביבה" is the term labelled "זכרון והעמקים"),
 * so this map is copied from the live <select> as-is.
 */
const LIVE_REGION_SLUGS: Record<string, string> = {
  'שפלה': 'שפלה',
  'רמת-הגולן': 'רמת הגולן',
  'עכו-נהריה-והסביבה': 'עכו - נהריה והסביבה',
  'מרכז': 'מרכז',
  'all-country': 'כל הארץ',
  'יהודה-שומרון-ובקעת-הירדן': 'יהודה, שומרון ובקעת הירדן',
  'קריות-והסביבה': 'חיפה, קריות והסביבה',
  'חדרה-זכרון-והעמקים': 'חדרה והסביבה',
  'חיפה-קריות-והסביבה': 'זכרון והעמקים',
  'גליל-תחתון': 'גליל תחתון',
  'גליל-עליון': 'גליל עליון',
  'אזור-ירושלים': 'אזור ירושלים',
  'אזור-השרון': 'אזור השרון',
  'אזור-דרום': 'אזור דרום',
};

const flat = (s: string) => s.replace(/[-\s]+/g, ' ').trim();

export default async function LegacyRecommendedFilter({ params }: { params: { legacy: string[] } }) {
  const parts = params.legacy.map(decodeSlug).filter(Boolean);
  const [kind, first, second] = parts;
  if (parts.length > 3 || (kind !== 'service' && kind !== 'business') || !first) notFound();

  const specialtySlug = kind === 'service' ? first : null;
  const regionSlug = kind === 'service' ? second ?? null : first;
  if (kind === 'business' && parts.length > 2) notFound();

  const db = createPublicClient();
  const [specialties, regions] = await Promise.all([listSpecialties(db), listRegions(db)]);

  let specialty: string | null = null;
  if (specialtySlug) {
    const match =
      specialties.find((s) => s.slug === specialtySlug) ??
      specialties.find((s) => flat(s.name) === flat(specialtySlug)) ??
      specialties.find((s) => flat(s.name).includes(flat(specialtySlug)));
    if (!match) notFound();
    specialty = match.slug;
  }

  let region: string | null = null;
  if (regionSlug) {
    const label = LIVE_REGION_SLUGS[regionSlug] ?? flat(regionSlug);
    const match =
      regions.find((r) => r.slug === regionSlug) ??
      regions.find((r) => r.name === label || r.aliases.includes(label));
    if (!match) notFound();
    region = match.slug;
  }

  permanentRedirect(listingHref({ specialty, region }));
}
