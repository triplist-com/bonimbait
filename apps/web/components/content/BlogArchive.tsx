import { notFound } from 'next/navigation';
import { loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import CommunityCTA from './CommunityCTA';
import PostArchive from './PostArchive';
import StageNav from './StageNav';

/** /blog/ and /blog/page/<n>/ ("מרכז הידע לבניית בית"). */
export default async function BlogArchive({ page }: { page: number }) {
  const result = await loadPostsPage(page);
  const totalPages = totalPagesOf(result);
  if (page > totalPages) notFound();

  return (
    <PostArchive
      title="מרכז הידע לבניית בית"
      eyebrow="מדריך הבנייה"
      intro="מדריכים, טיפים ועלויות לכל שלב בבניית הבית הפרטי: מרכישת המגרש ועד קבלת המפתח."
      crumbs={[
        { label: 'ראשי', href: '/' },
        { label: 'מרכז הידע', href: '/blog/' },
      ]}
      basePath="/blog/"
      page={page}
      totalPages={totalPages}
      posts={result.items}
      before={
        page === 1 ? (
          <>
            <StageNav />
            <h2 className="mb-1 mt-2 text-headline-sm text-ink-900">חדשים במרכז הידע</h2>
          </>
        ) : null
      }
      after={<CommunityCTA />}
    />
  );
}
