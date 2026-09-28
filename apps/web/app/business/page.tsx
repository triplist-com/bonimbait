import type { Metadata } from 'next';
import DirectoryListing from '@/components/directory/DirectoryListing';
import { listingMetadata } from '@/components/directory/listingMetadata';
import { parseFilters } from '@/lib/directory/listing';

// Render per request like /recommended/, so the build never needs the database.
export const dynamic = 'force-dynamic';

/**
 * /business/ is the WordPress post-type archive. It answers 200 on the live
 * site and appears in its sitemap, so it renders the directory with a
 * canonical pointing at /recommended/.
 */
export async function generateMetadata(): Promise<Metadata> {
  return listingMetadata(parseFilters({}));
}

export default function BusinessArchivePage() {
  return <DirectoryListing filters={parseFilters({})} />;
}
