import { NextResponse, type NextRequest } from 'next/server';
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
 * A route handler rather than a page, so the 301/404 status is real (pages
 * stream behind the root loading.tsx and would answer 200 first).
 *
 * Live region term slugs map to region labels. Some live slugs don't match
 * their labels (e.g. "חיפה-קריות-והסביבה" is the term labelled "זכרון
 * והעמקים"), so this map is copied from the live <select> as-is.
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

function notFound(): NextResponse {
  return new NextResponse('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

async function resolve(parts: string[]): Promise<string | null> {
  const [kind, first, second] = parts;
  if ((kind !== 'service' && kind !== 'business') || !first) return null;
  if (parts.length > (kind === 'service' ? 3 : 2)) return null;

  const specialtySlug = kind === 'service' ? first : null;
  const regionSlug = kind === 'service' ? second ?? null : first;

  const db = createPublicClient();
  const [specialties, regions] = await Promise.all([listSpecialties(db), listRegions(db)]);

  let specialty: string | null = null;
  if (specialtySlug) {
    const match =
      specialties.find((s) => s.slug === specialtySlug) ??
      specialties.find((s) => flat(s.name) === flat(specialtySlug)) ??
      specialties.find((s) => flat(s.name).includes(flat(specialtySlug)));
    if (!match) return null;
    specialty = match.slug;
  }

  let region: string | null = null;
  if (regionSlug) {
    const label = LIVE_REGION_SLUGS[regionSlug] ?? flat(regionSlug);
    const match =
      regions.find((r) => r.slug === regionSlug) ?? regions.find((r) => r.name === label || r.aliases.includes(label));
    if (!match) return null;
    region = match.slug;
  }

  return listingHref({ specialty, region });
}

export async function GET(request: NextRequest, { params }: { params: { legacy: string[] } }) {
  const parts = params.legacy.map(decodeSlug).filter(Boolean);
  try {
    const target = await resolve(parts);
    if (!target) return notFound();
    return NextResponse.redirect(new URL(target, request.url), 301);
  } catch (err) {
    console.error('legacy /recommended/ filter redirect failed', err);
    return notFound();
  }
}
