import 'server-only';

import { getVideo } from '@/app/api/_lib/data';
import { semanticSearch, type SearchHit } from '@/app/api/_lib/semantic';
import { embedTexts } from '@/lib/autopilot/embed';
import { isTitleOnly } from '@/lib/knowledge/segment-text';
import { checkAiBudget, recordAiUsage } from '@/lib/guard/aiBudget';
import type { Json } from '@/lib/db/types';
import { commandServiceDb, type CommandDb } from '../db';
import type { InsightRunRow, InsightTopicRow } from '../db-types';
import type { InsightRunSummary, InsightTopic, NearestContent } from '../types';
import type { DocResolver, ProbeHit } from './coverage';
import type { InsightsDeps, InsightsStore } from './engine';
import { labelClusters } from './label';

/** Runs whose topics are shown (an empty or failed refresh keeps the last good one on screen). */
const SHOWABLE: InsightRunRow['status'][] = ['done', 'partial'];

function arr(value: Json): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nearestOf(value: Json): NearestContent[] {
  return arr(value).flatMap((v) => {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    if ((o.kind !== 'video' && o.kind !== 'post') || typeof o.title !== 'string' || typeof o.href !== 'string') return [];
    return [
      {
        kind: o.kind,
        id: String(o.id ?? ''),
        title: o.title,
        href: o.href,
        similarity: Number(o.similarity) || 0,
        startS: typeof o.start_s === 'number' ? o.start_s : null,
      },
    ];
  });
}

export function toInsightTopic(row: InsightTopicRow): InsightTopic {
  return {
    id: row.id,
    rank: row.rank,
    label: row.label,
    suggestedTitle: row.suggested_title,
    asks: row.asks,
    visitors: row.visitors,
    questionCount: row.question_count,
    asksThisWeek: row.asks_this_week,
    asksPrevWeek: row.asks_prev_week,
    trendPct: row.trend_pct == null ? null : Number(row.trend_pct),
    coverage: Number(row.coverage),
    topSimilarity: Number(row.top_similarity),
    level: row.coverage_level,
    levelSource: row.level_source,
    levelReason: row.level_reason,
    avgConfidence: row.avg_confidence == null ? null : Number(row.avg_confidence),
    examples: arr(row.examples).flatMap((e) => {
      const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : {};
      return typeof o.q === 'string' ? [{ q: o.q, asks: Number(o.asks) || 0 }] : [];
    }),
    nearest: nearestOf(row.nearest),
  };
}

export function toRunSummary(row: InsightRunRow): InsightRunSummary {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    questionCount: row.question_count,
    askCount: row.ask_count,
    topicCount: row.topic_count,
    costUsd: Number(row.cost_usd),
    message: row.message,
  };
}

/** The latest run, and the latest run with topics to show (RLS: staff). */
export async function loadInsights(db: CommandDb): Promise<{
  latest: InsightRunSummary | null;
  shown: { run: InsightRunSummary; topics: InsightTopic[] } | null;
}> {
  const [latestRes, shownRes] = await Promise.all([
    db.from('insight_runs').select('*').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('insight_runs').select('*').in('status', SHOWABLE).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (latestRes.error) throw new Error(latestRes.error.message);
  if (shownRes.error) throw new Error(shownRes.error.message);
  const latest = latestRes.data ? toRunSummary(latestRes.data) : null;
  if (!shownRes.data) return { latest, shown: null };
  const topics = await db.from('insight_topics').select('*').eq('run_id', shownRes.data.id).order('rank');
  if (topics.error) throw new Error(topics.error.message);
  return { latest, shown: { run: toRunSummary(shownRes.data), topics: (topics.data ?? []).map(toInsightTopic) } };
}

export function serviceInsightsStore(db: CommandDb = commandServiceDb()): InsightsStore {
  return {
    async latestRun() {
      const { data, error } = await db.from('insight_runs').select('id, status, started_at').order('started_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async createRun(row) {
      const { data, error } = await db
        .from('insight_runs')
        .insert({ ...row, params: row.params as Json, status: 'running' })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    },
    async finishRun(id, patch) {
      const { error } = await db.from('insight_runs').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async saveTopics(runId, topics) {
      if (topics.length === 0) return;
      const { error } = await db.from('insight_topics').insert(
        topics.map((t) => ({ ...t, run_id: runId, examples: t.examples as Json, nearest: t.nearest as Json })),
      );
      if (error) throw new Error(error.message);
    },
  };
}

export function videoHref(youtubeId: string, startS?: number | null): string {
  return `/video/${youtubeId}/${startS && startS > 0 ? `?t=${Math.floor(startS)}` : ''}`;
}

/** Titles and links for search hits (static index, runtime registry, posts). */
export const resolveDoc: DocResolver = (hit) => {
  if (hit.kind === 'post') return { title: hit.title, href: `/${hit.slug}/` };
  const v = getVideo(hit.youtube_id);
  return v ? { title: v.title, href: videoHref(hit.youtube_id, hit.start_time) } : null;
};

/**
 * Hits deep enough that, after title-only rows are dropped, a probe still has
 * its top documents.
 */
export const SEARCH_DEPTH = 60;

/**
 * Search hits -> coverage probes. Title-only rows (videos without captions,
 * indexed by title alone: lib/knowledge/segment-text.ts) are skipped: a title
 * that matches the question says nothing about whether the video answers it,
 * and counting it would hide a real gap.
 */
export function probeHitsFrom(hits: readonly SearchHit[]): ProbeHit[] {
  return hits
    .filter((h) => !isTitleOnly(h))
    .map((h): ProbeHit =>
      h.kind === 'video'
        ? { kind: 'video', youtube_id: h.youtube_id, start_time: h.start_time, cos: h.cos }
        : { kind: 'post', slug: h.slug, title: h.title, cos: h.cos },
    );
}

/** Production dependencies: the real search, OpenAI embeddings, Claude, the AI budget and the DB. */
export function productionInsightsDeps(): InsightsDeps {
  return {
    now: () => Date.now(),
    async questions({ from, to, weekStart, limit }) {
      const { data, error } = await commandServiceDb().rpc('command_question_stats', {
        p_from: from,
        p_to: to,
        p_week_start: weekStart,
        p_limit: limit,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    async embed(texts) {
      const result = await embedTexts(texts, { timeoutMs: 20_000 });
      return { vectors: result.vectors, tokens: result.usage.input_tokens ?? 0 };
    },
    async search(query, vector) {
      const hits = await semanticSearch(query, SEARCH_DEPTH, ['video', 'post'], { queryVector: vector });
      return probeHitsFrom(hits);
    },
    resolve: resolveDoc,
    label: (clusters, timeoutMs) => labelClusters(clusters, { timeoutMs }),
    async checkBudget(estimateUsd) {
      const b = await checkAiBudget({ estimateUsd });
      return { ok: b.ok, message: b.ok ? undefined : 'תקציב ה-AI היומי נוצל או שה-AI כבוי. נסו שוב מחר או העלו את AI_DAILY_BUDGET_USD.' };
    },
    async recordUsage(route, model, usage) {
      const { costUsd } = await recordAiUsage({ route, model, usage });
      return costUsd;
    },
    store: serviceInsightsStore(),
  };
}
