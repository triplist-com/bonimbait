import type { Metadata } from 'next';
import DirectoryListing from '@/components/directory/DirectoryListing';
import { listingMetadata } from '@/components/directory/listingMetadata';
import { parseFilters } from '@/lib/directory/listing';

type Props = { searchParams: Record<string, string | string[] | undefined> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return listingMetadata(parseFilters(searchParams));
}

export default function RecommendedPage({ searchParams }: Props) {
  return <DirectoryListing filters={parseFilters(searchParams)} />;
}
