import 'server-only';

/**
 * Publish dates and images of article sources. The posts index carries only
 * slug, title and text; the date matters because every cost figure in an
 * answer is dated from its source. Cached per instance; a slow or missing DB
 * just leaves the date out (the answer still streams).
 */
import { getPublicDb } from '@/lib/content/db';
import { withTimeout } from '@/lib/platform/db';

export interface PostMeta {
  published_at: string | null;
  image: string | null;
}

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 2000;
const cache = new Map<string, { at: number; meta: PostMeta | null }>();

/** Test helper. */
export function resetPostsMetaCache(): void {
  cache.clear();
}

export async function postsMeta(slugs: string[], timeoutMs = 400): Promise<Map<string, PostMeta>> {
  const out = new Map<string, PostMeta>();
  const now = Date.now();
  const missing: string[] = [];
  for (const slug of slugs) {
    const hit = cache.get(slug);
    if (hit && now - hit.at < TTL_MS) {
      if (hit.meta) out.set(slug, hit.meta);
    } else {
      missing.push(slug);
    }
  }
  const db = missing.length > 0 ? getPublicDb() : null;
  if (!db) return out;
  try {
    const { data, error } = await withTimeout(
      db.from('posts').select('slug, published_at, featured_image').in('slug', missing).eq('status', 'published'),
      timeoutMs,
      'advisor posts meta',
    );
    if (error) throw new Error(error.message);
    const found = new Map((data ?? []).map((r) => [r.slug, { published_at: r.published_at, image: r.featured_image } as PostMeta]));
    if (cache.size > MAX_ENTRIES) cache.clear();
    for (const slug of missing) {
      const meta = found.get(slug) ?? null;
      cache.set(slug, { at: now, meta });
      if (meta) out.set(slug, meta);
    }
  } catch (err) {
    console.warn(`[advisor] post dates unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}
