import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlogArchive from '@/components/content/BlogArchive';
import { blogMetadata, loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { parsePageNumber } from '@/lib/content/db';

export const revalidate = 3600;

// Rendered on first request, then cached (ISR).
export function generateStaticParams() {
  return [];
}

interface Props {
  params: { n: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // 404s are raised here too: app/loading.tsx streams the page after a 200 is sent.
  const page = parsePageNumber(params.n);
  if (!page || page > totalPagesOf(await loadPostsPage(page))) notFound();
  return blogMetadata(page);
}

/** /blog/page/<n>/ (WordPress pagination; /blog/page/1/ is not a valid URL). */
export default function BlogPagedPage({ params }: Props) {
  const page = parsePageNumber(params.n);
  if (!page) notFound();
  return <BlogArchive page={page} />;
}
