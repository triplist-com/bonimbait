import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AuthorArchive from '@/components/content/AuthorArchive';
import { authorMetadata, loadAuthor, loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { decodeSlug, parsePageNumber } from '@/lib/content/db';

export const revalidate = 3600;

interface Props {
  params: { slug: string; n: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = parsePageNumber(params.n);
  const author = page ? await loadAuthor(decodeSlug(params.slug)) : null;
  if (!page || !author) return { robots: { index: false } };
  const result = await loadPostsPage(page, undefined, author.id);
  return authorMetadata(author, page, totalPagesOf(result));
}

export default async function AuthorPagedPage({ params }: Props) {
  const page = parsePageNumber(params.n);
  if (!page) notFound();
  const author = await loadAuthor(decodeSlug(params.slug));
  if (!author) notFound();
  return <AuthorArchive author={author} page={page} />;
}
