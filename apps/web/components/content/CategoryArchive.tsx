import { notFound } from 'next/navigation';
import type { PostCategoryRow } from '@/lib/db/types';
import { loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { BUILD_STAGES, stageForCategory } from '@/lib/stages';
import { htmlToText } from '@/lib/content/sanitize';
import CommunityCTA from './CommunityCTA';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import PostArchive from './PostArchive';
import StageNav from './StageNav';

/** WordPress post-category archive: /category/<slug>/ and /category/<slug>/page/<n>/. */
export default async function CategoryArchive({ category, page }: { category: PostCategoryRow; page: number }) {
  const result = await loadPostsPage(page, category.id);
  const totalPages = totalPagesOf(result);
  if (page > totalPages) notFound();

  const slug = category.slug.normalize('NFC');
  const stage = stageForCategory(slug);
  const intro = htmlToText(category.description, 600);

  return (
    <PostArchive
      title={category.name}
      eyebrow={
        stage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- owner's stage icon */}
            <img src={stage.icon} alt="" width={28} height={20} className="h-5 w-7 object-contain" />
            שלב {stage.order} מתוך {BUILD_STAGES.length} במסע
          </>
        ) : (
          'מדריך הבנייה'
        )
      }
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
      before={stage && page === 1 ? <StageNav heading={null} activeSlug={slug} /> : null}
      after={
        <div className="grid gap-8">
          <ConsultationCTA variant="banner" source="category-archive" />
          <CommunityCTA compact />
        </div>
      }
    />
  );
}
