import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCategoriesForPost, getPostById, getTagsForPost, listAuthors, listPostCategories, listPostTags } from '@/lib/db/posts';
import type { PostRow } from '@/lib/db/types';
import { deletePost, savePost } from '@/lib/admin/actions/posts';
import { CONTENT_STATUS, contentStatusKey, formatDateTime } from '@/lib/admin/labels';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import ContentForm from '@/components/admin/content/ContentForm';
import PostSideFields from '@/components/admin/content/PostSideFields';

export const metadata = { title: 'עריכת מאמר' };

const EMPTY: PostRow = {
  id: '',
  slug: '',
  title: '',
  content_html: '',
  excerpt: null,
  featured_image: null,
  featured_image_alt: null,
  seo_title: null,
  seo_description: null,
  seo_canonical: null,
  noindex: false,
  status: 'draft',
  published_at: null,
  primary_category_id: null,
  author_id: null,
  legacy_wp_id: null,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
};

export default async function EditPostPage({ params }: { params: { id: string } }) {
  const db = createClient();
  const isNew = params.id === 'new';
  const post = isNew ? EMPTY : await getPostById(db, params.id).catch(() => null);
  if (!post) notFound();

  const [categories, authors, allTags, postCategories, postTags] = await Promise.all([
    listPostCategories(db),
    listAuthors(db),
    listPostTags(db),
    isNew ? Promise.resolve([]) : getCategoriesForPost(db, post.id),
    isNew ? Promise.resolve([]) : getTagsForPost(db, post.id),
  ]);

  return (
    <div className="max-w-7xl">
      <PageHeader
        back={{ href: '/admin/posts/', label: 'כל המאמרים' }}
        title={isNew ? 'מאמר חדש' : post.title}
        description={
          isNew ? undefined : (
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge info={CONTENT_STATUS[contentStatusKey(post.status, post.published_at)]} />
              <span>עודכן {formatDateTime(post.updated_at)}</span>
              {post.legacy_wp_id && <span className="text-gray-400">WP #{post.legacy_wp_id}</span>}
            </span>
          )
        }
        actions={
          !isNew && (
            <ConfirmDialog
              trigger="מחיקה"
              title="למחוק את המאמר?"
              body="המאמר יימחק לצמיתות. אם הוא מפורסם, כדאי להוסיף הפניה לכתובת אחרת במקום."
              confirmLabel="מחיקה"
              onConfirm={deletePost.bind(null, post.id)}
              redirectTo="/admin/posts/"
            />
          )
        }
      />
      <ContentForm
        action={savePost}
        pathPrefix="/"
        wasPublished={post.status === 'published'}
        previewHref={isNew ? undefined : `/admin/preview/post/${post.id}/`}
        publicHref={isNew ? undefined : `/${encodeURIComponent(post.slug)}/`}
        initial={{
          id: isNew ? undefined : post.id,
          title: post.title,
          slug: post.slug,
          body: post.content_html,
          excerpt: post.excerpt,
          featured_image: post.featured_image,
          featured_image_alt: post.featured_image_alt,
          status: post.status,
          published_at: post.published_at,
          seo_title: post.seo_title,
          seo_description: post.seo_description,
          seo_canonical: post.seo_canonical,
          noindex: post.noindex,
        }}
        side={
          <PostSideFields
            categories={categories}
            selected={postCategories.map((c) => c.id)}
            primaryId={post.primary_category_id}
            tags={postTags.map((t) => t.name)}
            tagSuggestions={allTags.map((t) => t.name)}
            authors={authors}
            authorId={post.author_id}
          />
        }
      />
    </div>
  );
}
