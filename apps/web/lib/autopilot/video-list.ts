import 'server-only';

import type { ConstructionStage } from '@/lib/db/types';
import { serviceDb } from './db';
import type { RuntimeListItem } from './listing';
import { categoryName } from './records';
import { YOUTUBE_ID_RE, youtubeThumbnail } from './rss';
import { DEFAULT_CATEGORY, STAGES } from './summary';

/**
 * Published Content Autopilot videos for the site's video lists (the hub, the
 * homepage rails and /videos). Kept apart from videos.ts, which uses React's
 * request cache, so admin actions can clear the memo (revalidate.ts).
 */

const LIST_TTL_MS = 60_000;
/** Serving: a visitor may wait on it (the memo hides most calls), so keep it short. */
const LIST_TIMEOUT_MS = 1_500;
/**
 * `next build` pre-renders the homepage with this list. Under build load the
 * query can take longer than 1.5 s, and the fail-open empty list then stays
 * baked into the homepage until its hourly revalidation (2026-11-09 deploy).
 * Nobody waits on a build, so give it time.
 */
const BUILD_TIMEOUT_MS = 15_000;
const LIST_LIMIT = 500;

/** The query's timeout: long while `next build` pre-renders, short while serving. */
export function listTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  return env.NEXT_PHASE === 'phase-production-build' ? BUILD_TIMEOUT_MS : LIST_TIMEOUT_MS;
}
let listMemo: { at: number; items: RuntimeListItem[] } | null = null;

/** Tests: forget the memoized list. */
export function clearRuntimeListCache(): void {
  listMemo = null;
}

interface ListRow {
  external_id: string;
  title: string;
  published_at: string | null;
  duration_s: number | null;
  thumbnail_url: string | null;
  category_slug: string | null;
  stage: string | null;
  summary_text: string | null;
  costs: unknown;
  tips: unknown;
}

function toListItem(r: ListRow): RuntimeListItem {
  const category = r.category_slug || DEFAULT_CATEGORY;
  return {
    youtube_id: r.external_id,
    title: r.title,
    published_at: r.published_at,
    duration_s: r.duration_s,
    thumbnail_url: r.thumbnail_url || youtubeThumbnail(r.external_id),
    category_slug: category,
    category_name: categoryName(category),
    stage: (STAGES.find((s) => s.value === r.stage)?.value ?? null) as ConstructionStage | null,
    summary: r.summary_text ?? '',
    costs_count: Array.isArray(r.costs) ? r.costs.length : 0,
    tips_count: Array.isArray(r.tips) ? r.tips.length : 0,
  };
}

/**
 * Published runtime videos for the site's video lists (hub, homepage, /videos),
 * newest first. Only the fields a card needs, not the whole summary. Memoized
 * per instance for a minute; fails open (logs, returns []) so a store outage
 * leaves the static lists as they were.
 */
export async function listPublishedRuntimeVideoItems(now = Date.now()): Promise<RuntimeListItem[]> {
  if (listMemo && now - listMemo.at < LIST_TTL_MS) return listMemo.items;
  const db = serviceDb();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from('knowledge_sources')
      .select(
        'external_id, title, published_at, duration_s, thumbnail_url, ' +
          'category_slug:summary->>category_slug, stage:summary->>stage, summary_text:summary->>summary, ' +
          'costs:summary->costs, tips:summary->tips',
      )
      .eq('kind', 'youtube')
      .eq('status', 'published')
      .not('summary', 'is', null)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(LIST_LIMIT)
      .abortSignal(AbortSignal.timeout(listTimeoutMs()));
    if (error) throw new Error(error.message);
    const items = ((data ?? []) as unknown as ListRow[])
      .filter((r) => YOUTUBE_ID_RE.test(r.external_id))
      .map(toListItem);
    listMemo = { at: now, items };
    return items;
  } catch (err) {
    console.error('[autopilot] video list failed (fail-open):', err instanceof Error ? err.message : err);
    return listMemo?.items ?? [];
  }
}
