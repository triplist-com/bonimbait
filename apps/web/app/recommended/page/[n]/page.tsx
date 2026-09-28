import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import DirectoryListing from '@/components/directory/DirectoryListing';
import { listingMetadata } from '@/components/directory/listingMetadata';
import { listingHref, parseFilters } from '@/lib/directory/listing';

type Props = {
  params: { n: string };
  searchParams: Record<string, string | string[] | undefined>;
};

/** Live WordPress pagination: /recommended/page/<n>/ */
function pageNumber(raw: string): number {
  if (!/^\d{1,4}$/.test(raw)) notFound();
  return Number(raw);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return listingMetadata(parseFilters(searchParams, pageNumber(params.n)));
}

export default function RecommendedPagedPage({ params, searchParams }: Props) {
  const filters = parseFilters(searchParams, pageNumber(params.n));
  // /recommended/page/1/ is the listing root, as in WordPress.
  if (filters.page <= 1) permanentRedirect(listingHref({ ...filters, page: 1 }));
  return <DirectoryListing filters={filters} />;
}
