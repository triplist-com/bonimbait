'use server';

import { createPage, deletePage as deletePageRow, getPageById, updatePage } from '@/lib/db/pages';
import { createVideoPage, getVideoPageById, updateVideoPage } from '@/lib/db/videos';
import type { TablesInsert } from '@/lib/db/types';
import { ActionError, adminAction } from '../guard';
import { bool, html, int, list, optStr, requireField, str, uuidOrNull } from '../form';
import { resolvePublishState } from '../publish';
import { applySlugRedirect, removeRedirectsFrom } from '../redirects';
import { revalidatePage, revalidateVideoPage } from '../revalidate';
import { publicPath, resolveSlug, slugChangeNeedsRedirect } from '../slug';
import { youtubeIdFrom } from '../editor/codec';

/** Static pages ("/<slug>/" or "/<parent>/<child>/"). */
export const savePage = adminAction('editor', async ({ db, profile }, fd: FormData) => {
  const id = uuidOrNull(optStr(fd, 'id'));
  const existing = id ? await getPageById(db, id) : null;
  if (id && !existing) throw new ActionError('העמוד לא נמצא');

  const title = requireField(str(fd, 'title', 300), 'כותרת', 'title');
  const slug = resolveSlug(str(fd, 'slug', 400), { existing: existing?.slug, fallback: title, allowSlash: true });
  if (!slug) throw new ActionError('כתובת לא תקינה', { slug: 'כתובת לא תקינה' });
  const { data: clash } = await db.from('pages').select('id').eq('slug', slug).neq('id', id ?? '00000000-0000-0000-0000-000000000000').limit(1);
  if (clash && clash.length) throw new ActionError('כבר קיים עמוד עם הכתובת הזו', { slug: 'כתובת תפוסה' });

  const publish = resolvePublishState(str(fd, 'status'), optStr(fd, 'published_at'), existing);
  const fields = {
    title,
    slug,
    content_html: html(fd, 'content_html'),
    excerpt: optStr(fd, 'excerpt', 2000),
    featured_image: optStr(fd, 'featured_image', 2000),
    featured_image_alt: optStr(fd, 'featured_image_alt', 300),
    template: optStr(fd, 'template', 100),
    sort_order: int(fd, 'sort_order', 0),
    seo_title: optStr(fd, 'seo_title', 300),
    seo_description: optStr(fd, 'seo_description', 1000),
    seo_canonical: optStr(fd, 'seo_canonical', 1000),
    noindex: bool(fd, 'noindex'),
    ...publish,
    updated_by: profile.id,
  };
  const page = existing
    ? await updatePage(db, existing.id, fields)
    : await createPage(db, { ...fields, created_by: profile.id } as TablesInsert<'pages'>);

  let message = 'העמוד נשמר.';
  if (existing && slugChangeNeedsRedirect({ oldSlug: existing.slug, newSlug: slug, wasPublished: existing.status === 'published' }) && bool(fd, 'create_redirect')) {
    await applySlugRedirect(db, publicPath('page', existing.slug), publicPath('page', slug), `admin: page slug renamed (${page.id})`);
    message = 'העמוד נשמר ונוצרה הפניה 301 מהכתובת הקודמת.';
  }
  if (page.status === 'published') await removeRedirectsFrom(db, publicPath('page', slug));
  revalidatePage([slug, existing?.slug]);
  return { ok: true, message, data: existing ? undefined : { redirect: `/admin/pages/${page.id}/` } };
});

export const deletePage = adminAction('editor', async ({ db }, id: string) => {
  const page = await getPageById(db, id);
  if (!page) throw new ActionError('העמוד לא נמצא');
  await deletePageRow(db, id);
  revalidatePage([page.slug]);
  return { ok: true, message: 'העמוד נמחק.' };
});

function youtubeIds(fd: FormData, name: string): string[] {
  const out: string[] = [];
  for (const v of list(fd, name)) {
    const vid = youtubeIdFrom(v);
    if (!vid) throw new ActionError(`מזהה YouTube לא תקין: ${v}`, { [name]: 'מזהה לא תקין' });
    if (!out.includes(vid)) out.push(vid);
  }
  return out;
}

/** Legacy WordPress video pages (/video/<legacy_slug>/). */
export const saveVideoPage = adminAction('editor', async ({ db }, fd: FormData) => {
  const id = uuidOrNull(optStr(fd, 'id'));
  const existing = id ? await getVideoPageById(db, id) : null;
  if (id && !existing) throw new ActionError('עמוד הווידאו לא נמצא');

  const title = requireField(str(fd, 'title', 300), 'כותרת', 'title');
  const slug = resolveSlug(str(fd, 'slug', 400), { existing: existing?.legacy_slug, fallback: title });
  if (!slug) throw new ActionError('כתובת לא תקינה', { slug: 'כתובת לא תקינה' });
  if (/^[A-Za-z0-9_-]{11}$/.test(slug)) {
    throw new ActionError('כתובת בת 11 תווים לטיניים מתנגשת עם כתובות מזהה YouTube', { slug: 'כתובת לא זמינה' });
  }
  const { data: clash } = await db.from('video_pages').select('id').eq('legacy_slug', slug).neq('id', id ?? '00000000-0000-0000-0000-000000000000').limit(1);
  if (clash && clash.length) throw new ActionError('כבר קיים עמוד וידאו עם הכתובת הזו', { slug: 'כתובת תפוסה' });

  const publish = resolvePublishState(str(fd, 'status'), optStr(fd, 'published_at'), existing);
  const kind = str(fd, 'kind') === 'podcast' ? 'podcast' : 'video';
  const fields = {
    title,
    legacy_slug: slug,
    body_html: html(fd, 'body_html'),
    excerpt: optStr(fd, 'excerpt', 2000),
    featured_image: optStr(fd, 'featured_image', 2000),
    youtube_ids: youtubeIds(fd, 'youtube_ids'),
    related_youtube_ids: youtubeIds(fd, 'related_youtube_ids'),
    kind: kind as 'video' | 'podcast',
    author_name: optStr(fd, 'author_name', 200),
    seo_title: optStr(fd, 'seo_title', 300),
    seo_description: optStr(fd, 'seo_description', 1000),
    seo_canonical: optStr(fd, 'seo_canonical', 1000),
    noindex: bool(fd, 'noindex'),
    ...publish,
  };
  const page = existing ? await updateVideoPage(db, existing.id, fields) : await createVideoPage(db, fields as TablesInsert<'video_pages'>);

  let message = 'עמוד הווידאו נשמר.';
  if (existing && slugChangeNeedsRedirect({ oldSlug: existing.legacy_slug, newSlug: slug, wasPublished: existing.status === 'published' }) && bool(fd, 'create_redirect')) {
    await applySlugRedirect(db, publicPath('video', existing.legacy_slug), publicPath('video', slug), `admin: video page slug renamed (${page.id})`);
    message = 'עמוד הווידאו נשמר ונוצרה הפניה 301 מהכתובת הקודמת.';
  }
  if (page.status === 'published') await removeRedirectsFrom(db, publicPath('video', slug));
  revalidateVideoPage([slug, existing?.legacy_slug]);
  return { ok: true, message, data: existing ? undefined : { redirect: `/admin/videos/${page.id}/` } };
});

export const deleteVideoPage = adminAction('editor', async ({ db }, id: string) => {
  const page = await getVideoPageById(db, id);
  if (!page) throw new ActionError('עמוד הווידאו לא נמצא');
  const { error } = await db.from('video_pages').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidateVideoPage([page.legacy_slug]);
  return { ok: true, message: 'עמוד הווידאו נמחק.' };
});
