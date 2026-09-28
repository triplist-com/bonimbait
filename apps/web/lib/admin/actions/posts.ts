'use server';

import {
  createPost,
  deletePost as deletePostRow,
  deletePostCategory,
  deletePostTag,
  ensurePostTags,
  getPostById,
  isPostSlugTaken,
  saveAuthor,
  savePostCategory,
  savePostTag,
  setPostCategories,
  setPostTags,
  updatePost,
} from '@/lib/db/posts';
import type { TablesInsert } from '@/lib/db/types';
import { ActionError, adminAction } from '../guard';
import { bool, html, ids, int, list, optStr, requireField, str, uuidOrNull } from '../form';
import { resolvePublishState } from '../publish';
import { applySlugRedirect, removeRedirectsFrom } from '../redirects';
import { revalidatePost, revalidateTaxonomy } from '../revalidate';
import { cleanSlug, publicPath, resolveSlug, slugChangeNeedsRedirect, slugify } from '../slug';

/**
 * Create or update a post (the /admin/posts/ editor form).
 * A slug change on a published post creates a 301 when `create_redirect` is on.
 */
export const savePost = adminAction('editor', async ({ db, profile }, fd: FormData) => {
  const id = uuidOrNull(optStr(fd, 'id'));
  const existing = id ? await getPostById(db, id) : null;
  if (id && !existing) throw new ActionError('המאמר לא נמצא');

  const title = requireField(str(fd, 'title', 300), 'כותרת', 'title');
  const slug = resolveSlug(str(fd, 'slug', 400), { existing: existing?.slug, fallback: title });
  if (!slug) throw new ActionError('כתובת (slug) לא תקינה', { slug: 'כתובת לא תקינה' });
  if (await isPostSlugTaken(db, slug, id ?? undefined)) {
    throw new ActionError('כבר קיים מאמר עם הכתובת הזו', { slug: 'כתובת תפוסה' });
  }

  const publish = resolvePublishState(str(fd, 'status'), optStr(fd, 'published_at'), existing);
  const categoryIds = ids(fd, 'category_ids');
  const primary = uuidOrNull(optStr(fd, 'primary_category_id'));

  const fields = {
    title,
    slug,
    content_html: html(fd, 'content_html'),
    excerpt: optStr(fd, 'excerpt', 2000),
    featured_image: optStr(fd, 'featured_image', 2000),
    featured_image_alt: optStr(fd, 'featured_image_alt', 300),
    author_id: uuidOrNull(optStr(fd, 'author_id')),
    primary_category_id: primary && categoryIds.includes(primary) ? primary : categoryIds[0] ?? null,
    seo_title: optStr(fd, 'seo_title', 300),
    seo_description: optStr(fd, 'seo_description', 1000),
    seo_canonical: optStr(fd, 'seo_canonical', 1000),
    noindex: bool(fd, 'noindex'),
    ...publish,
    updated_by: profile.id,
  };

  const post = existing
    ? await updatePost(db, existing.id, fields)
    : await createPost(db, { ...fields, created_by: profile.id } as TablesInsert<'posts'>);

  await setPostCategories(db, post.id, categoryIds);
  await setPostTags(db, post.id, await ensurePostTags(db, list(fd, 'tags'), (n) => slugify(n)));

  let message = 'המאמר נשמר.';
  const wasPublished = existing?.status === 'published';
  if (existing && slugChangeNeedsRedirect({ oldSlug: existing.slug, newSlug: slug, wasPublished })) {
    if (bool(fd, 'create_redirect')) {
      await applySlugRedirect(db, publicPath('post', existing.slug), publicPath('post', slug), `admin: post slug renamed (${post.id})`);
      message = 'המאמר נשמר ונוצרה הפניה 301 מהכתובת הקודמת.';
    }
  }
  if (post.status === 'published') await removeRedirectsFrom(db, publicPath('post', slug));

  revalidatePost([slug, existing?.slug]);
  return { ok: true, message, data: existing ? undefined : { redirect: `/admin/posts/${post.id}/` } };
});

export const deletePost = adminAction('editor', async ({ db }, id: string) => {
  const post = await getPostById(db, id);
  if (!post) throw new ActionError('המאמר לא נמצא');
  await deletePostRow(db, id);
  revalidatePost([post.slug]);
  return { ok: true, message: 'המאמר נמחק.' };
});

// Categories, tags, authors ------------------------------------------------------------

export const saveCategory = adminAction('editor', async ({ db }, fd: FormData) => {
  const name = requireField(str(fd, 'name', 200), 'שם', 'name');
  const id = uuidOrNull(optStr(fd, 'id'));
  const slug = cleanSlug(str(fd, 'slug', 200) || name);
  await savePostCategory(db, {
    ...(id ? { id } : {}),
    name,
    slug,
    description: optStr(fd, 'description', 5000),
    sort_order: int(fd, 'sort_order', 0),
    seo_title: optStr(fd, 'seo_title', 300),
    seo_description: optStr(fd, 'seo_description', 1000),
  });
  revalidateTaxonomy();
  return { ok: true, message: 'הקטגוריה נשמרה.' };
});

export const removeCategory = adminAction('editor', async ({ db }, id: string) => {
  await deletePostCategory(db, id);
  revalidateTaxonomy();
  return { ok: true, message: 'הקטגוריה נמחקה.' };
});

export const saveTag = adminAction('editor', async ({ db }, fd: FormData) => {
  const name = requireField(str(fd, 'name', 200), 'שם', 'name');
  const id = uuidOrNull(optStr(fd, 'id'));
  await savePostTag(db, { ...(id ? { id } : {}), name, slug: cleanSlug(str(fd, 'slug', 200) || name) });
  return { ok: true, message: 'התגית נשמרה.' };
});

export const removeTag = adminAction('editor', async ({ db }, id: string) => {
  await deletePostTag(db, id);
  return { ok: true, message: 'התגית נמחקה.' };
});

export const saveAuthorAction = adminAction('editor', async ({ db }, fd: FormData) => {
  const name = requireField(str(fd, 'name', 200), 'שם', 'name');
  const id = uuidOrNull(optStr(fd, 'id'));
  await saveAuthor(db, {
    ...(id ? { id } : {}),
    name,
    slug: cleanSlug(str(fd, 'slug', 200) || name),
    bio_html: optStr(fd, 'bio_html', 5000),
    avatar_url: optStr(fd, 'avatar_url', 2000),
  });
  revalidateTaxonomy();
  return { ok: true, message: 'הכותב נשמר.' };
});
