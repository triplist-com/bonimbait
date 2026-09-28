import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPostById } from '@/lib/db/posts';
import { getPageById } from '@/lib/db/pages';
import { getVideoPageById } from '@/lib/db/videos';
import PostArticle from '@/components/content/PostArticle';
import GenericPage from '@/components/content/GenericPage';
import LegacyVideoPage from '@/components/content/LegacyVideoPage';

export const metadata = { title: 'תצוגה מקדימה', robots: { index: false, follow: false } };

/**
 * Preview of the SAVED version of a post, page or video page with the public
 * components, including drafts and scheduled items (staff RLS).
 */
export default async function PreviewPage({ params }: { params: { kind: string; id: string } }) {
  const db = createClient();
  let content: React.ReactNode = null;
  if (params.kind === 'post') {
    const post = await getPostById(db, params.id).catch(() => null);
    if (post) content = <PostArticle post={post} />;
  } else if (params.kind === 'page') {
    const page = await getPageById(db, params.id).catch(() => null);
    if (page) content = <GenericPage page={page} />;
  } else if (params.kind === 'video') {
    const page = await getVideoPageById(db, params.id).catch(() => null);
    if (page) content = <LegacyVideoPage page={page} />;
  }
  if (!content) notFound();

  return (
    <div className="-m-5 lg:-m-8">
      <div className="sticky top-0 z-20 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
        תצוגה מקדימה של הגרסה השמורה. ייתכן שהתוכן עדיין לא מפורסם.
      </div>
      <div className="bg-white">{content}</div>
    </div>
  );
}
