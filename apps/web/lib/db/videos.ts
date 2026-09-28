/**
 * Videos.
 *
 *  - `videos` (apps/api, not modified): indexed YouTube videos behind the AI
 *    search. The public site still renders them from apps/web/data (static
 *    index); DB reads here are for admin/parity routes.
 *  - `video_pages`: legacy WordPress /video/<hebrew-slug>/ pages (188), which
 *    render from their own content whether or not a matching indexed video
 *    exists (only 37 match).
 *
 * /video/[id] resolution (PARITY_PLAN URL rule 3): legacy slug first, then
 * YouTube id — see resolveVideoRoute().
 */
import { type DbClient, type Paginated, pageRange, unwrap, unwrapMaybe } from './client';
import type { TablesInsert, TablesUpdate, VideoPageRow, VideoRow } from './types';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export type VideoPageSummary = Pick<
  VideoPageRow,
  'id' | 'legacy_slug' | 'title' | 'excerpt' | 'featured_image' | 'youtube_ids' | 'kind' | 'published_at'
>;

const PAGE_SUMMARY_COLUMNS = 'id, legacy_slug, title, excerpt, featured_image, youtube_ids, kind, published_at';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function getPublishedVideoPageBySlug(db: DbClient, legacySlug: string): Promise<VideoPageRow | null> {
  return unwrapMaybe(
    await db
      .from('video_pages')
      .select('*')
      .eq('legacy_slug', legacySlug)
      .eq('status', 'published')
      .maybeSingle(),
  );
}

export async function getVideoByYoutubeId(db: DbClient, youtubeId: string): Promise<VideoRow | null> {
  return unwrapMaybe(await db.from('videos').select('*').eq('youtube_id', youtubeId).maybeSingle());
}

export type VideoRoute =
  | { type: 'legacy_page'; page: VideoPageRow; video: VideoRow | null }
  | { type: 'youtube'; youtubeId: string; video: VideoRow | null };

/**
 * Resolve a /video/[param]/ value (may be percent-encoded):
 *  1. a legacy page slug  -> render the video page (+ linked indexed video)
 *  2. a YouTube id        -> the existing /video/<youtube-id> page; `video`
 *     is the DB row if present (callers may fall back to the static index)
 * Returns null when neither matches.
 */
export async function resolveVideoRoute(db: DbClient, param: string): Promise<VideoRoute | null> {
  const decoded = safeDecode(param);

  const page = await getPublishedVideoPageBySlug(db, decoded);
  if (page) {
    const video = page.video_id
      ? unwrapMaybe(await db.from('videos').select('*').eq('id', page.video_id).maybeSingle())
      : null;
    return { type: 'legacy_page', page, video };
  }

  if (YOUTUBE_ID.test(decoded)) {
    return { type: 'youtube', youtubeId: decoded, video: await getVideoByYoutubeId(db, decoded) };
  }
  return null;
}

/** Legacy page (if any) for a YouTube id — e.g. to canonicalize or cross-link. */
export async function findVideoPageForYoutubeId(db: DbClient, youtubeId: string): Promise<VideoPageSummary | null> {
  const rows = unwrap(
    await db
      .from('video_pages')
      .select(PAGE_SUMMARY_COLUMNS)
      .contains('youtube_ids', [youtubeId])
      .eq('status', 'published')
      .limit(1),
  );
  return rows[0] ?? null;
}

export async function listPublishedVideoPages(
  db: DbClient,
  opts: { page?: number; pageSize?: number; kind?: VideoPageRow['kind'] } = {},
): Promise<Paginated<VideoPageSummary>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 24;
  const { from, to } = pageRange(page, pageSize);
  let query = db
    .from('video_pages')
    .select(PAGE_SUMMARY_COLUMNS, { count: 'exact' })
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(from, to);
  if (opts.kind) query = query.eq('kind', opts.kind);
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

/** All published legacy slugs (sitemaps, URL parity checker). */
export async function listVideoPageSlugs(
  db: DbClient,
): Promise<Array<Pick<VideoPageRow, 'legacy_slug' | 'updated_at'>>> {
  return unwrap(
    await db.from('video_pages').select('legacy_slug, updated_at').eq('status', 'published').order('legacy_slug'),
  );
}

// Admin -----------------------------------------------------------------------

export async function getVideoPageById(db: DbClient, id: string): Promise<VideoPageRow | null> {
  return unwrapMaybe(await db.from('video_pages').select('*').eq('id', id).maybeSingle());
}

export async function createVideoPage(db: DbClient, input: TablesInsert<'video_pages'>): Promise<VideoPageRow> {
  return unwrap(await db.from('video_pages').insert(input).select('*').single());
}

export async function updateVideoPage(
  db: DbClient,
  id: string,
  patch: TablesUpdate<'video_pages'>,
): Promise<VideoPageRow> {
  return unwrap(await db.from('video_pages').update(patch).eq('id', id).select('*').single());
}
