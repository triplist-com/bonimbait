import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AuthorArchive from '@/components/content/AuthorArchive';
import { authorMetadata, loadAuthor, loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { decodeSlug } from '@/lib/content/db';

export const revalidate = 3600;

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const author = await loadAuthor(decodeSlug(params.slug));
  if (!author) return { title: 'העמוד לא נמצא', robots: { index: false } };
  const result = await loadPostsPage(1, undefined, author.id);
  return authorMetadata(author, 1, totalPagesOf(result));
}

export default async function AuthorPage({ params }: Props) {
  const author = await loadAuthor(decodeSlug(params.slug));
  if (!author) notFound();
  return <AuthorArchive author={author} page={1} />;
}
