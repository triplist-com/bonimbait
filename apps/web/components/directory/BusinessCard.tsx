import Link from 'next/link';
import type { DirectoryEntry } from '@/lib/db/businesses';
import type { BusinessReviewStatsRow, RegionRow, SpecialtyRow } from '@/lib/db/types';
import { businessHref } from '@/lib/directory/format';
import { excerpt, htmlToText } from '@/lib/directory/html';
import { listingHref } from '@/lib/directory/listing';
import BusinessLogo from './BusinessLogo';
import RatingBadge from './RatingBadge';

const MAX_REGIONS = 4;

export default function BusinessCard({
  business,
  specialties,
  regions,
  stats,
}: {
  business: DirectoryEntry;
  specialties: Map<string, SpecialtyRow>;
  regions: Map<string, RegionRow>;
  stats: BusinessReviewStatsRow | undefined;
}) {
  const href = businessHref(business.slug);
  // Primary specialty first, as on the live cards.
  const specialtyRows = business.specialtyIds
    .map((id) => specialties.get(id))
    .filter((s): s is SpecialtyRow => !!s)
    .sort((a, b) => Number(b.id === business.primary_specialty_id) - Number(a.id === business.primary_specialty_id));
  const regionRows = business.regionIds
    .map((id) => regions.get(id))
    .filter((r): r is RegionRow => !!r)
    .sort((a, b) => a.sort_order - b.sort_order);
  const nationwide = regionRows.some((r) => r.is_nationwide);
  const about = excerpt(business.tagline || htmlToText(business.description_html), 150);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-card transition hover:shadow-card-hover">
      <div className="flex items-start gap-4">
        <BusinessLogo name={business.name} src={business.logo_url || business.cover_image_url} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-gray-900">
            <Link href={href} className="hover:text-primary">
              {business.name}
            </Link>
          </h2>
          <div className="mt-1">
            <RatingBadge percent={stats?.rating_percent} count={stats?.review_count ?? 0} />
          </div>
        </div>
      </div>

      {specialtyRows.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="התמחויות">
          {specialtyRows.slice(0, 4).map((s) => (
            <li key={s.id}>
              <Link
                href={listingHref({ specialty: s.slug })}
                className="inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                {s.name}
              </Link>
            </li>
          ))}
          {specialtyRows.length > 4 && (
            <li className="px-1 text-xs text-gray-500">+{specialtyRows.length - 4}</li>
          )}
        </ul>
      )}

      {about && <p className="mt-3 flex-1 text-sm leading-6 text-gray-600">{about}</p>}

      {regionRows.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>
            {nationwide
              ? 'כל הארץ'
              : regionRows.length > MAX_REGIONS
                ? `${regionRows.slice(0, MAX_REGIONS).map((r) => r.name).join(' · ')} ועוד ${regionRows.length - MAX_REGIONS}`
                : regionRows.map((r) => r.name).join(' · ')}
          </span>
        </p>
      )}

      <Link
        href={href}
        className="mt-4 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
      >
        לעמוד העסקי
      </Link>
    </article>
  );
}
