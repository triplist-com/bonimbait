/**
 * Static pages + root-slug resolution for the "/<slug>/" catch-all.
 * Resolution order: pages first, then posts (see docs/ARCHITECTURE_PARITY.md).
 */
import { type DbClient, unwrap, unwrapMaybe, check } from './client';
import type { PageRow, PostRow, TablesInsert, TablesUpdate } from './types';
import { getPublishedPostBySlug } from './posts';

export async function getPublishedPageBySlug(db: DbClient, slug: string): Promise<PageRow | null> {
  return unwrapMaybe(
    await db.from('pages').select('*').eq('slug', slug).eq('status', 'published').maybeSingle(),
  );
}

export async function listPublishedPageSlugs(
  db: DbClient,
): Promise<Array<Pick<PageRow, 'slug' | 'updated_at'>>> {
  return unwrap(await db.from('pages').select('slug, updated_at').eq('status', 'published').order('slug'));
}

export type RootContent = { type: 'page'; page: PageRow } | { type: 'post'; post: PostRow };

/**
 * Resolve a root-level path ("/a/" or "/parent/child/") to a page or post.
 * @param slugPath decoded path segments joined with "/" (no leading/trailing slash)
 */
export async function resolveRootSlug(db: DbClient, slugPath: string): Promise<RootContent | null> {
  const page = await getPublishedPageBySlug(db, slugPath);
  if (page) return { type: 'page', page };
  if (slugPath.includes('/')) return null; // posts are single-segment
  const post = await getPublishedPostBySlug(db, slugPath);
  return post ? { type: 'post', post } : null;
}

// Admin -----------------------------------------------------------------------

export async function listPagesForAdmin(
  db: DbClient,
): Promise<Array<Pick<PageRow, 'id' | 'slug' | 'title' | 'status' | 'updated_at'>>> {
  return unwrap(
    await db.from('pages').select('id, slug, title, status, updated_at').order('slug'),
  );
}

export async function getPageById(db: DbClient, id: string): Promise<PageRow | null> {
  return unwrapMaybe(await db.from('pages').select('*').eq('id', id).maybeSingle());
}

export async function createPage(db: DbClient, input: TablesInsert<'pages'>): Promise<PageRow> {
  return unwrap(await db.from('pages').insert(input).select('*').single());
}

export async function updatePage(db: DbClient, id: string, patch: TablesUpdate<'pages'>): Promise<PageRow> {
  return unwrap(await db.from('pages').update(patch).eq('id', id).select('*').single());
}

export async function deletePage(db: DbClient, id: string): Promise<void> {
  check(await db.from('pages').delete().eq('id', id));
}
