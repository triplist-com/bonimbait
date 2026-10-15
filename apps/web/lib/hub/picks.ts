import 'server-only';

import { unstable_cache } from 'next/cache';
import { getVideos, type VideoRecord } from '@/app/api/_lib/data';
import { getPublicDb } from '@/lib/content/db';
import { htmlToText } from '@/lib/content/sanitize';
import { BUILD_STAGES } from '@/lib/stages';
import { STAGE_CONTENT } from './content';
import {
  STAGE_IDS,
  type StageId,
  type StagePickArticle,
  type StagePickVideo,
  type StagePicksMap,
} from './types';

/**
 * Each stage's top videos and articles for the roadmap:
 *   - videos from the static full-channel index (data/videos.json), only the
 *     full-transcript ones (has_transcript: a summary page with moments; the
 *     674 title-only rows have none), ranked by the stage's keywords in the
 *     title, summary and key points, plus the stage's index categories;
 *   - articles from the DB, published posts in the stage's category, ranked
 *     by the same keywords (category assignments are broad: a finishing
 *     guide can sit in the purchase category).
 * Every item goes to the one stage it fits best, so stages don't repeat each
 * other. Public data only, cached for an hour.
 */

export const VIDEOS_PER_STAGE = 4;
export const ARTICLES_PER_STAGE = 4;

const SOFIT: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Lower-case, unify Hebrew quotes (״/" and ׳/'), sofit letters and spaces. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[״”“]/g, '"')
    .replace(/[׳’‘]/g, "'")
    .replace(/[ךםןףץ]/g, (c) => SOFIT[c] ?? c)
    .replace(/\s+/g, ' ');
}

type Topics = ReadonlyArray<readonly string[]>;

/** How many topics appear in the text (a topic counts once, whichever of its words matched). */
export function topicHits(text: string, topics: Topics): number {
  const hay = normalizeForMatch(text);
  return topics.reduce((n, words) => (words.some((w) => hay.includes(normalizeForMatch(w))) ? n + 1 : n), 0);
}

/** The topic mentioned first in the text (its index), or -1. */
export function leadTopic(text: string, topics: Topics): number {
  const hay = normalizeForMatch(text);
  let best = -1;
  let bestPos = Infinity;
  topics.forEach((words, i) => {
    for (const w of words) {
      const pos = hay.indexOf(normalizeForMatch(w));
      if (pos >= 0 && pos < bestPos) {
        bestPos = pos;
        best = i;
      }
    }
  });
  return best;
}

/** At most this many picks per topic in one stage (variety: not four aluminium guides). */
export const PICKS_PER_TOPIC = 2;

/** Title words (2+ letters) for near-duplicate detection. */
export function titleWords(title: string): Set<string> {
  return new Set(
    normalizeForMatch(title)
      .replace(/[^֐-׿a-z0-9\s]/g, ' ')
      .split(' ')
      .filter((w) => w.length >= 2),
  );
}

/** Jaccard similarity of two word sets (0..1). */
export function titleSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((w) => {
    if (b.has(w)) shared += 1;
  });
  return shared / (a.size + b.size - shared);
}

/** Titles this similar are the same piece twice (a re-post, part 1 and 2...). */
export const DUPLICATE_SIMILARITY = 0.5;

type Scored<T> = {
  item: T;
  scores: Record<StageId, number>;
  /** Lead topic per stage (from the title). */
  topic: Partial<Record<StageId, number>>;
  words: Set<string>;
  tiebreak: number;
};

/** Give each item to its best stage, then take the top `perStage` per stage, varied by topic. */
export function assignToStages<T>(scored: Scored<T>[], perStage: number): Record<StageId, T[]> {
  const buckets = Object.fromEntries(STAGE_IDS.map((id) => [id, [] as Scored<T>[]])) as Record<StageId, Scored<T>[]>;
  for (const s of scored) {
    let best: StageId | null = null;
    for (const id of STAGE_IDS) {
      if (s.scores[id] > 0 && (best === null || s.scores[id] > s.scores[best])) best = id;
    }
    if (best) buckets[best].push(s);
  }
  const out = {} as Record<StageId, T[]>;
  for (const id of STAGE_IDS) {
    const ranked = buckets[id].sort((a, b) => b.scores[id] - a.scores[id] || b.tiebreak - a.tiebreak);
    const perTopic = new Map<number, number>();
    const chosen: Scored<T>[] = [];
    const skipped: Scored<T>[] = [];
    for (const s of ranked) {
      if (chosen.length >= perStage) break;
      if (chosen.some((c) => titleSimilarity(c.words, s.words) >= DUPLICATE_SIMILARITY)) continue;
      const topic = s.topic[id] ?? -1;
      const used = perTopic.get(topic) ?? 0;
      if (topic >= 0 && used >= PICKS_PER_TOPIC) {
        skipped.push(s);
        continue;
      }
      perTopic.set(topic, used + 1);
      chosen.push(s);
    }
    // Not enough variety: fill with the best of the rest.
    for (const s of skipped) if (chosen.length < perStage) chosen.push(s);
    out[id] = chosen.map((s) => s.item);
  }
  return out;
}

function topicsOf(id: StageId): Topics {
  return STAGE_CONTENT[id].topics;
}

export function scoreVideo(v: Pick<VideoRecord, 'title' | 'summary' | 'key_points' | 'category_slug'>): Record<StageId, number> {
  const scores = {} as Record<StageId, number>;
  for (const id of STAGE_IDS) {
    const c = STAGE_CONTENT[id];
    const title = topicHits(v.title, c.topics);
    const summary = topicHits(v.summary ?? '', c.topics);
    const points = topicHits((v.key_points ?? []).join(' '), c.topics);
    // A topic match in the title (or two in the summary) is required; the
    // index category only breaks ties between stages.
    scores[id] =
      title > 0 || summary > 1 ? title * 4 + summary * 2 + points + (c.videoCategories.includes(v.category_slug) ? 3 : 0) : 0;
  }
  return scores;
}

function leadTopics(title: string): Partial<Record<StageId, number>> {
  return Object.fromEntries(STAGE_IDS.map((id) => [id, leadTopic(title, topicsOf(id))]));
}

let videoPicks: Record<StageId, StagePickVideo[]> | null = null;

function allStaticVideos(): VideoRecord[] {
  const out: VideoRecord[] = [];
  for (let page = 1; page < 100; page += 1) {
    const res = getVideos({ page, limit: 100 });
    out.push(...res.videos);
    if (page >= res.pages) break;
  }
  return out;
}

/** Videos per stage (memoized: the static index only changes with a deploy). */
export function stageVideoPicks(): Record<StageId, StagePickVideo[]> {
  if (videoPicks) return videoPicks;
  let videos: VideoRecord[] = [];
  try {
    videos = allStaticVideos().filter((v) => v.has_transcript);
  } catch (err) {
    console.error('[hub] static video index unavailable:', err instanceof Error ? err.message : err);
  }
  const scored = videos.map((v) => ({
    item: {
      youtubeId: v.youtube_id,
      title: v.title,
      durationSeconds: v.duration_seconds,
      thumbnailUrl: v.thumbnail_url || `https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`,
      kind: v.kind ?? 'video',
    } satisfies StagePickVideo,
    scores: scoreVideo(v),
    topic: leadTopics(v.title),
    words: titleWords(v.title),
    tiebreak: v.view_count || 0,
  }));
  videoPicks = assignToStages(scored, VIDEOS_PER_STAGE);
  return videoPicks;
}

type PostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  published_at: string | null;
  post_category_assignments: Array<{ category_id: string }>;
};

async function loadArticlePicks(): Promise<Record<StageId, StagePickArticle[]>> {
  const empty = Object.fromEntries(STAGE_IDS.map((id) => [id, []])) as unknown as Record<StageId, StagePickArticle[]>;
  const db = getPublicDb();
  if (!db) return empty;
  try {
    const { data: cats, error: catError } = await db
      .from('post_categories')
      .select('id, slug')
      .in('slug', BUILD_STAGES.map((s) => s.categorySlug));
    if (catError) throw new Error(catError.message);
    const stageByCategory = new Map<string, StageId>();
    for (const c of cats ?? []) {
      const stage = BUILD_STAGES.find((s) => s.categorySlug.normalize('NFC') === c.slug.normalize('NFC'));
      if (stage) stageByCategory.set(c.id, stage.id);
    }
    if (!stageByCategory.size) return empty;

    const { data, error } = await db
      .from('posts')
      .select('slug, title, excerpt, featured_image, published_at, post_category_assignments!inner(category_id)')
      .eq('status', 'published')
      .in('post_category_assignments.category_id', Array.from(stageByCategory.keys()))
      .order('published_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const scored = ((data ?? []) as unknown as PostRow[]).map((p) => {
      const stages = new Set(p.post_category_assignments.map((a) => stageByCategory.get(a.category_id)).filter(Boolean));
      const excerpt = p.excerpt ? htmlToText(p.excerpt, 220) : null;
      const scores = {} as Record<StageId, number>;
      for (const id of STAGE_IDS) {
        const c = STAGE_CONTENT[id];
        const title = topicHits(p.title, c.topics);
        // A title match is required; the stage's own category is a bonus (the
        // owner's stage categories overlap: the בדק בית guide sits in "רכישה").
        scores[id] = title > 0 ? title * 3 + topicHits(excerpt ?? '', c.topics) + (stages.has(id) ? 2 : 0) : 0;
      }
      return {
        item: { slug: p.slug, title: p.title, excerpt, image: p.featured_image } satisfies StagePickArticle,
        scores,
        topic: leadTopics(p.title),
        words: titleWords(p.title),
        tiebreak: p.published_at ? Date.parse(p.published_at) : 0,
      };
    });
    return assignToStages(scored, ARTICLES_PER_STAGE);
  } catch (err) {
    console.error('[hub] stage article picks failed:', err instanceof Error ? err.message : err);
    return empty;
  }
}

const cachedArticlePicks = unstable_cache(loadArticlePicks, ['hub-stage-article-picks-v1'], {
  revalidate: 3600,
  tags: ['hub-stage-picks'],
});

/** Videos and articles for all 7 stages. */
export async function loadStagePicks(): Promise<StagePicksMap> {
  const [articles, videos] = await Promise.all([cachedArticlePicks(), Promise.resolve(stageVideoPicks())]);
  return Object.fromEntries(
    STAGE_IDS.map((id) => [id, { videos: videos[id] ?? [], articles: articles[id] ?? [] }]),
  ) as StagePicksMap;
}
