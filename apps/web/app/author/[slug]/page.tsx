import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AuthorArchive from '@/components/content/AuthorArchive';
import { authorMetadata, loadAuthor, loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { decodeSlug } from '@/lib/content/db';

export const revalidate = 3600;

// Rendered on first request, then cached (ISR).
export function generateStaticParams() {
  return [];
}

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const author = await loadAuthor(decodeSlug(params.slug));
  // 404 from metadata: app/loading.tsx streams the page after a 200 is sent.
  if (!author) notFound();
  const result = await loadPostsPage(1, undefined, author.id);
  return authorMetadata(author, 1, totalPagesOf(result));
}

export default async function AuthorPage({ params }: Props) {
  const author = await loadAuthor(decodeSlug(params.slug));
  if (!author) notFound();
  return <AuthorArchive author={author} page={1} />;
}
