import type { Metadata } from 'next';
import BlogArchive from '@/components/content/BlogArchive';
import { blogMetadata } from '@/lib/content/archives';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return blogMetadata(1);
}

export default function BlogPage() {
  return <BlogArchive page={1} />;
}
