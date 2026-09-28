/**
 * Posts (articles at /<slug>/) and post categories (/category/<slug>/).
 *
 * All functions take the client explicitly:
 *   - public pages: createClient() from '@/lib/supabase/server' (RLS: published only)
 *   - admin: same client as a staff user (RLS: full access)
 * Slugs are stored decoded; pass decoded slugs (decodeURIComponent(params.slug)).
 */
import { type DbClient, type Paginated, pageRange, unwrap, unwrapMaybe, check } from './client';
import type { AuthorRow, PostCategoryRow, PostRow, PostTagRow, TablesInsert, TablesUpdate, ContentStatus } from './types';

export type PostSummary = Pick<
  PostRow,
  | 'id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'featured_image'
  | 'featured_image_alt'
  | 'published_at'
  | 'primary_category_id'
  | 'author_id'
>;

const SUMMARY_COLUMNS =
  'id, slug, title, excerpt, featured_image, featured_image_alt, published_at, primary_category_id, author_id';

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export async function getPublishedPostBySlug(db: DbClient, slug: string): Promise<PostRow | null> {
  return unwrapMaybe(
    await db.from('posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle(),
  );
}

export async function listPublishedPosts(
  db: DbClient,
  opts: { page?: number; pageSize?: number; categoryId?: string; authorId?: string } = {},
): Promise<Paginated<PostSummary>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const { from, to } = pageRange(page, pageSize);

  if (opts.categoryId) {
    const result = await db
      .from('posts')
      .select(`${SUMMARY_COLUMNS}, post_category_assignments!inner(category_id)`, { count: 'exact' })
      .eq('status', 'published')
      .eq('post_category_assignments.category_id', opts.categoryId)
      .order('published_at', { ascending: false })
      .range(from, to);
    const rows = unwrap(result);
    return {
      items: rows.map(({ post_category_assignments: _ignored, ...post }) => post),
      total: result.count ?? 0,
      page,
      pageSize,
    };
  }

  let query = db
    .from('posts')
    .select(SUMMARY_COLUMNS, { count: 'exact' })
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, to);
  if (opts.authorId) query = query.eq('author_id', opts.authorId);
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

/** Author archive (/author/<slug>/). */
export async function getAuthorBySlug(db: DbClient, slug: string): Promise<AuthorRow | null> {
  return unwrapMaybe(await db.from('authors').select('*').eq('slug', slug).maybeSingle());
}

export async function getAuthorById(db: DbClient, id: string): Promise<AuthorRow | null> {
  return unwrapMaybe(await db.from('authors').select('*').eq('id', id).maybeSingle());
}

/** All published slugs (for sitemaps / generateStaticParams). */
export async function listPublishedPostSlugs(
  db: DbClient,
): Promise<Array<Pick<PostRow, 'slug' | 'updated_at' | 'published_at'>>> {
  const out: Array<Pick<PostRow, 'slug' | 'updated_at' | 'published_at'>> = [];
  const batch = 1000;
  for (let from = 0; ; from += batch) {
    const rows = unwrap(
      await db
        .from('posts')
        .select('slug, updated_at, published_at')
        .eq('status', 'published')
        .order('slug')
        .range(from, from + batch - 1),
    );
    out.push(...rows);
    if (rows.length < batch) break;
  }
  return out;
}

export async function listPostCategories(db: DbClient): Promise<PostCategoryRow[]> {
  return unwrap(await db.from('post_categories').select('*').order('sort_order').order('name'));
}

export async function getPostCategoryBySlug(db: DbClient, slug: string): Promise<PostCategoryRow | null> {
  return unwrapMaybe(await db.from('post_categories').select('*').eq('slug', slug).maybeSingle());
}

export async function getCategoriesForPost(db: DbClient, postId: string): Promise<PostCategoryRow[]> {
  const rows = unwrap(
    await db
      .from('post_category_assignments')
      .select('post_categories(*)')
      .eq('post_id', postId),
  );
  return rows.flatMap((r) => (r.post_categories ? [r.post_categories] : []));
}

// ---------------------------------------------------------------------------
// Admin (staff) — RLS "staff full access"
// ---------------------------------------------------------------------------

export type AdminPostRow = Pick<
  PostRow,
  'id' | 'slug' | 'title' | 'status' | 'published_at' | 'updated_at' | 'primary_category_id' | 'author_id'
>;

/** Strip PostgREST filter syntax from a free-text search term. */
function searchTerm(value: string): string {
  return value.replace(/[%,()*\\]/g, ' ').trim();
}

export async function listPostsForAdmin(
  db: DbClient,
  opts: {
    page?: number;
    pageSize?: number;
    /** 'scheduled' = published with a future published_at. */
    status?: ContentStatus | 'scheduled';
    search?: string;
    categoryId?: string;
    authorId?: string;
  } = {},
): Promise<Paginated<AdminPostRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const { from, to } = pageRange(page, pageSize);
  const columns = 'id, slug, title, status, published_at, updated_at, primary_category_id, author_id';
  let query = opts.categoryId
    ? db
        .from('posts')
        .select(`${columns}, post_category_assignments!inner(category_id)`, { count: 'exact' })
        .eq('post_category_assignments.category_id', opts.categoryId)
    : db.from('posts').select(columns, { count: 'exact' });
  query = query.order('updated_at', { ascending: false }).range(from, to);
  if (opts.status === 'scheduled') query = query.eq('status', 'published').gt('published_at', new Date().toISOString());
  else if (opts.status) query = query.eq('status', opts.status);
  if (opts.authorId) query = query.eq('author_id', opts.authorId);
  const term = opts.search ? searchTerm(opts.search) : '';
  if (term) query = query.or(`title.ilike.*${term}*,slug.ilike.*${term}*`);
  const result = await query;
  const rows = unwrap(result) as Array<AdminPostRow & { post_category_assignments?: unknown }>;
  return {
    items: rows.map(({ post_category_assignments: _ignored, ...post }) => post),
    total: result.count ?? 0,
    page,
    pageSize,
  };
}

export async function getPostById(db: DbClient, id: string): Promise<PostRow | null> {
  return unwrapMaybe(await db.from('posts').select('*').eq('id', id).maybeSingle());
}

export async function createPost(db: DbClient, input: TablesInsert<'posts'>): Promise<PostRow> {
  return unwrap(await db.from('posts').insert(input).select('*').single());
}

export async function updatePost(db: DbClient, id: string, patch: TablesUpdate<'posts'>): Promise<PostRow> {
  return unwrap(await db.from('posts').update(patch).eq('id', id).select('*').single());
}

export async function deletePost(db: DbClient, id: string): Promise<void> {
  check(await db.from('posts').delete().eq('id', id));
}

/** Replace a post's category set. */
export async function setPostCategories(db: DbClient, postId: string, categoryIds: string[]): Promise<void> {
  check(await db.from('post_category_assignments').delete().eq('post_id', postId));
  if (categoryIds.length === 0) return;
  check(
    await db
      .from('post_category_assignments')
      .insert(categoryIds.map((category_id) => ({ post_id: postId, category_id }))),
  );
}

export async function savePostCategory(
  db: DbClient,
  input: TablesInsert<'post_categories'> & { id?: string },
): Promise<PostCategoryRow> {
  return unwrap(await db.from('post_categories').upsert(input).select('*').single());
}

// ---------------------------------------------------------------------------
// Public reads used by the content pages (Wave 2)
// ---------------------------------------------------------------------------

/** Latest published posts in a category, excluding one post (related posts). */
export async function listRelatedPosts(
  db: DbClient,
  opts: { categoryId: string; excludeId: string; limit?: number },
): Promise<PostSummary[]> {
  const rows = unwrap(
    await db
      .from('posts')
      .select(`${SUMMARY_COLUMNS}, post_category_assignments!inner(category_id)`)
      .eq('status', 'published')
      .eq('post_category_assignments.category_id', opts.categoryId)
      .neq('id', opts.excludeId)
      .order('published_at', { ascending: false })
      .limit(opts.limit ?? 3),
  );
  return rows.map(({ post_category_assignments: _ignored, ...post }) => post);
}

/** All authors (3 on the live site): bylines, archives and the sitemap. */
export async function listAuthors(db: DbClient): Promise<AuthorRow[]> {
  return unwrap(await db.from('authors').select('*').order('name'));
}

// Tags, authors, categories (admin) ----------------------------------------------------

export async function listPostTags(db: DbClient): Promise<PostTagRow[]> {
  const out: PostTagRow[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = unwrap(await db.from('post_tags').select('*').order('name').range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function getTagsForPost(db: DbClient, postId: string): Promise<PostTagRow[]> {
  const rows = unwrap(await db.from('post_tag_assignments').select('post_tags(*)').eq('post_id', postId));
  return rows.flatMap((r) => (r.post_tags ? [r.post_tags] : []));
}

/** Replace a post's tag set. */
export async function setPostTags(db: DbClient, postId: string, tagIds: string[]): Promise<void> {
  check(await db.from('post_tag_assignments').delete().eq('post_id', postId));
  if (tagIds.length === 0) return;
  check(await db.from('post_tag_assignments').insert(tagIds.map((tag_id) => ({ post_id: postId, tag_id }))));
}

/** Tag ids for names, creating missing tags (slug from the name, like WordPress). */
export async function ensurePostTags(db: DbClient, names: string[], toSlug: (name: string) => string): Promise<string[]> {
  const wanted = new Map<string, string>();
  for (const name of names) {
    const slug = toSlug(name);
    if (slug) wanted.set(slug, name.trim());
  }
  if (wanted.size === 0) return [];
  const existing = unwrap(await db.from('post_tags').select('id, slug').in('slug', Array.from(wanted.keys())));
  const bySlug = new Map(existing.map((t) => [t.slug, t.id]));
  const missing = Array.from(wanted.entries()).filter(([slug]) => !bySlug.has(slug));
  if (missing.length) {
    const created = unwrap(
      await db
        .from('post_tags')
        .insert(missing.map(([slug, name]) => ({ slug, name })))
        .select('id, slug'),
    );
    created.forEach((t) => bySlug.set(t.slug, t.id));
  }
  return Array.from(wanted.keys()).flatMap((slug) => {
    const id = bySlug.get(slug);
    return id ? [id] : [];
  });
}

export async function isPostSlugTaken(db: DbClient, slug: string, exceptId?: string): Promise<boolean> {
  let query = db.from('posts').select('id').eq('slug', slug).limit(1);
  if (exceptId) query = query.neq('id', exceptId);
  return unwrap(await query).length > 0;
}

export async function saveAuthor(db: DbClient, input: TablesInsert<'authors'> & { id?: string }): Promise<AuthorRow> {
  return unwrap(await db.from('authors').upsert(input).select('*').single());
}

export async function deletePostCategory(db: DbClient, id: string): Promise<void> {
  check(await db.from('post_categories').delete().eq('id', id));
}

export async function savePostTag(db: DbClient, input: TablesInsert<'post_tags'> & { id?: string }): Promise<PostTagRow> {
  return unwrap(await db.from('post_tags').upsert(input).select('*').single());
}

export async function deletePostTag(db: DbClient, id: string): Promise<void> {
  check(await db.from('post_tags').delete().eq('id', id));
}
