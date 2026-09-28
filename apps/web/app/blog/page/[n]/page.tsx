import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlogArchive from '@/components/content/BlogArchive';
import { blogMetadata } from '@/lib/content/archives';
import { parsePageNumber } from '@/lib/content/db';

export const revalidate = 3600;

interface Props {
  params: { n: string };
}

export function generateMetadata({ params }: Props): Promise<Metadata> | Metadata {
  const page = parsePageNumber(params.n);
  return page ? blogMetadata(page) : {};
}

/** /blog/page/<n>/ (WordPress pagination; /blog/page/1/ is not a valid URL). */
export default function BlogPagedPage({ params }: Props) {
  const page = parsePageNumber(params.n);
  if (!page) notFound();
  return <BlogArchive page={page} />;
}
