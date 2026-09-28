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
function filtersFor({ params, searchParams }: Props) {
  if (!/^\d{1,4}$/.test(params.n)) notFound();
  return parseFilters(searchParams, Number(params.n));
}

// Redirects and 404s happen in generateMetadata so they get a real status
// code (the root loading.tsx would stream the page body after a 200).
export async function generateMetadata(props: Props): Promise<Metadata> {
  const filters = filtersFor(props);
  // /recommended/page/1/ is the listing root, as in WordPress.
  if (filters.page <= 1) permanentRedirect(listingHref({ ...filters, page: 1 }));
  return listingMetadata(filters);
}

export default function RecommendedPagedPage(props: Props) {
  return <DirectoryListing filters={filtersFor(props)} />;
}
