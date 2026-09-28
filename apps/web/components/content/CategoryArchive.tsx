import { notFound } from 'next/navigation';
import type { PostCategoryRow } from '@/lib/db/types';
import { loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { STAGE_CATEGORY_SLUGS } from '@/lib/content/queries';
import { htmlToText } from '@/lib/content/sanitize';
import CommunityCTA from './CommunityCTA';
import ConsultationCTAPlaceholder from './ConsultationCTAPlaceholder';
import PostArchive from './PostArchive';
import StageNav from './StageNav';

/** WordPress post-category archive: /category/<slug>/ and /category/<slug>/page/<n>/. */
export default async function CategoryArchive({ category, page }: { category: PostCategoryRow; page: number }) {
  const result = await loadPostsPage(page, category.id);
  const totalPages = totalPagesOf(result);
  if (page > totalPages) notFound();

  const slug = category.slug.normalize('NFC');
  const isStage = (STAGE_CATEGORY_SLUGS as readonly string[]).includes(slug);
  const intro = htmlToText(category.description, 600);

  return (
    <PostArchive
      title={category.name}
      intro={intro || `כל המדריכים, הטיפים והסרטונים בנושא ${category.name}.`}
      crumbs={[
        { label: 'ראשי', href: '/' },
        { label: 'מרכז הידע', href: '/blog/' },
        { label: category.name, href: `/category/${category.slug}/` },
      ]}
      basePath={`/category/${category.slug}/`}
      page={page}
      totalPages={totalPages}
      posts={result.items}
      before={isStage && page === 1 ? <StageNav heading={null} activeSlug={slug} /> : null}
      after={
        <div className="grid gap-8">
          <ConsultationCTAPlaceholder variant="banner" source="category" />
          <CommunityCTA compact />
        </div>
      }
    />
  );
}
