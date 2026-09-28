import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AuthorArchive from '@/components/content/AuthorArchive';
import { authorMetadata, loadAuthor, loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { decodeSlug, parsePageNumber } from '@/lib/content/db';

export const revalidate = 3600;

// Rendered on first request, then cached (ISR).
export function generateStaticParams() {
  return [];
}

interface Props {
  params: { slug: string; n: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = parsePageNumber(params.n);
  const author = page ? await loadAuthor(decodeSlug(params.slug)) : null;
  // 404s are raised here too: app/loading.tsx streams the page after a 200 is sent.
  if (!page || !author) notFound();
  const result = await loadPostsPage(page, undefined, author.id);
  if (page > totalPagesOf(result)) notFound();
  return authorMetadata(author, page, totalPagesOf(result));
}

export default async function AuthorPagedPage({ params }: Props) {
  const page = parsePageNumber(params.n);
  if (!page) notFound();
  const author = await loadAuthor(decodeSlug(params.slug));
  if (!author) notFound();
  return <AuthorArchive author={author} page={page} />;
}
