/**
 * The content-gap engine behind "רענון תובנות": builders' questions in, the
 * owner's next videos out.
 *
 *   1. collect   the last INSIGHTS_WINDOW_DAYS of questions (command_question_stats)
 *   2. guard     checkAiBudget() for an upper-bound estimate before any paid call
 *   3. embed     each question and its topic text (text-embedding-3-small)
 *   4. cluster   average linkage on topic cosine + term overlap (cluster.ts)
 *   5. coverage  the top clusters' questions through the site's own search (coverage.ts)
 *   6. label     Hebrew topic, video title and a coverage review (label.ts, Haiku 5.5)
 *   7. store     insight_runs + insight_topics, spend recorded with recordAiUsage()
 *
 * Every dependency is injected (InsightsDeps), so tests run it with fakes and
 * no network. A run takes ~10-30 s and costs well under a cent; a cooldown
 * keeps it from being re-run in a loop.
 */
import { estimateCostUsd, type TokenUsage } from '@/lib/guard/aiPricing';
import type { InsightRunRow, InsightRunStatus, InsightTopicRow, QuestionStatRow } from '../db-types';
import type { NearestContent } from '../types';
import { centroid, clusterQuestions, dot, THRESHOLD, unitVector, COS_WEIGHT, TERM_WEIGHT } from './cluster';
import { clusterCoverage, levelFromReview, levelFromSimilarity, probeDocs, type DocResolver, type ProbeHit } from './coverage';
import { estimateLabelUsd, LABEL_CHUNK, LABEL_MODEL, LabelError, type LabelCluster, type LabelResult } from './label';
import { cleanQuestion, questionKey, topicTerms, topicText } from './text';

export const EMBED_MODEL = 'text-embedding-3-small';
/** Topics that get every probe question searched; the long tail gets one (a search is ~150 ms). */
export const DEEP_PROBE_TOPICS = 20;
const DAY_MS = 86_400_000;

export type InsightsConfig = {
  windowDays: number;
  maxQuestions: number;
  maxTopics: number;
  probes: number;
  threshold: number;
  cooldownMs: number;
  staleRunMs: number;
  /** Total time a run may take (function limit minus a margin). */
  budgetMs: number;
};

export const DEFAULT_INSIGHTS_CONFIG: InsightsConfig = {
  windowDays: 30,
  maxQuestions: 800,
  maxTopics: 50,
  probes: 3,
  threshold: THRESHOLD,
  cooldownMs: 3 * 60_000,
  staleRunMs: 10 * 60_000,
  budgetMs: 50_000,
};

function intEnv(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** INSIGHTS_WINDOW_DAYS (7-90, default 30) and INSIGHTS_MAX_QUESTIONS (50-2000, default 800). */
export function insightsConfig(env: Record<string, string | undefined> = process.env): InsightsConfig {
  return {
    ...DEFAULT_INSIGHTS_CONFIG,
    windowDays: intEnv(env.INSIGHTS_WINDOW_DAYS, 7, 90, DEFAULT_INSIGHTS_CONFIG.windowDays),
    maxQuestions: intEnv(env.INSIGHTS_MAX_QUESTIONS, 50, 2000, DEFAULT_INSIGHTS_CONFIG.maxQuestions),
  };
}

export type TopicInsert = Omit<InsightTopicRow, 'id' | 'run_id' | 'created_at'>;

export type InsightsStore = {
  latestRun(): Promise<Pick<InsightRunRow, 'id' | 'status' | 'started_at'> | null>;
  createRun(row: { window_from: string; window_to: string; params: Record<string, unknown>; triggered_by: string | null }): Promise<string>;
  finishRun(id: string, patch: Partial<InsightRunRow>): Promise<void>;
  saveTopics(runId: string, topics: TopicInsert[]): Promise<void>;
};

export type InsightsDeps = {
  now(): number;
  questions(args: { from: string; to: string; weekStart: string; limit: number }): Promise<QuestionStatRow[]>;
  embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }>;
  search(query: string, vector: Float32Array): Promise<ProbeHit[]>;
  resolve: DocResolver;
  label(clusters: LabelCluster[], timeoutMs: number): Promise<LabelResult>;
  checkBudget(estimateUsd: number): Promise<{ ok: boolean; message?: string }>;
  /** Records spend (ai_usage) and returns the call's cost in USD. */
  recordUsage(route: string, model: string, usage: TokenUsage): Promise<number>;
  store: InsightsStore;
};

export type RefreshResult =
  | { ok: true; runId: string; status: InsightRunStatus; topics: number; questions: number; costUsd: number; message: string }
  | { ok: false; reason: 'cooldown' | 'running' | 'budget' | 'error'; message: string; runId?: string };

type Question = {
  text: string;
  asks: number;
  visitors: number;
  asksThisWeek: number;
  asksPrevWeek: number;
  answers: number;
  avgConfidence: number | null;
  lastSeen: string;
};

/** Merge rows that normalize to the same key (the SQL already groups; this is defence in depth). */
export function mergeQuestions(rows: readonly QuestionStatRow[]): Question[] {
  const byKey = new Map<string, Question & { confSum: number; confN: number; lastMs: number }>();
  for (const r of rows) {
    const text = cleanQuestion(r.question ?? '');
    const key = questionKey(text);
    if (!key) continue;
    const answers = Number(r.answers) || 0;
    const conf = r.avg_confidence == null ? null : Number(r.avg_confidence);
    const lastMs = Date.parse(r.last_seen);
    const q = byKey.get(key);
    if (!q) {
      byKey.set(key, {
        text,
        asks: Number(r.asks) || 0,
        visitors: Number(r.visitors) || 0,
        asksThisWeek: Number(r.asks_this_week) || 0,
        asksPrevWeek: Number(r.asks_prev_week) || 0,
        answers,
        avgConfidence: null,
        lastSeen: r.last_seen,
        confSum: conf != null ? conf * Math.max(1, answers) : 0,
        confN: conf != null ? Math.max(1, answers) : 0,
        lastMs,
      });
      continue;
    }
    q.asks += Number(r.asks) || 0;
    q.visitors += Number(r.visitors) || 0;
    q.asksThisWeek += Number(r.asks_this_week) || 0;
    q.asksPrevWeek += Number(r.asks_prev_week) || 0;
    q.answers += answers;
    if (conf != null) {
      q.confSum += conf * Math.max(1, answers);
      q.confN += Math.max(1, answers);
    }
    if (lastMs > q.lastMs) {
      q.lastMs = lastMs;
      q.lastSeen = r.last_seen;
      q.text = text;
    }
  }
  return Array.from(byKey.values())
    .map(({ confSum, confN, lastMs: _lastMs, ...q }) => ({ ...q, avgConfidence: confN > 0 ? confSum / confN : null }))
    .sort((a, b) => b.asks - a.asks || Date.parse(b.lastSeen) - Date.parse(a.lastSeen) || a.text.localeCompare(b.text, 'he'));
}

export function trendPct(thisWeek: number, prevWeek: number): number | null {
  return prevWeek > 0 ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null;
}

type Cluster = {
  members: number[];
  asks: number;
  visitors: number;
  asksThisWeek: number;
  asksPrevWeek: number;
  avgConfidence: number | null;
  lastSeen: string;
  examples: { q: string; asks: number }[];
  probes: number[];
  topSimilarity: number;
  coverage: number;
  nearest: NearestContent[];
};

/** Volume, trend, examples and probe questions of each cluster, biggest first. */
export function summarizeClusters(
  groups: readonly number[][],
  questions: readonly Question[],
  topicVectors: readonly Float32Array[],
  probesPerCluster: number,
): Cluster[] {
  return groups
    .map((members) => {
      const c = centroid(topicVectors, members);
      const central = new Map(members.map((m) => [m, dot(topicVectors[m], c)]));
      const ordered = [...members].sort((a, b) => questions[b].asks - questions[a].asks || central.get(b)! - central.get(a)! || a - b);
      let confSum = 0;
      let confN = 0;
      for (const m of members) {
        const q = questions[m];
        if (q.avgConfidence != null) {
          const w = Math.max(1, q.answers);
          confSum += q.avgConfidence * w;
          confN += w;
        }
      }
      const sum = (pick: (q: Question) => number) => members.reduce((a, m) => a + pick(questions[m]), 0);
      return {
        members,
        asks: sum((q) => q.asks),
        visitors: sum((q) => q.visitors),
        asksThisWeek: sum((q) => q.asksThisWeek),
        asksPrevWeek: sum((q) => q.asksPrevWeek),
        avgConfidence: confN > 0 ? Math.round((confSum / confN) * 10_000) / 10_000 : null,
        lastSeen: members.map((m) => questions[m].lastSeen).sort().slice(-1)[0],
        examples: ordered.slice(0, 6).map((m) => ({ q: questions[m].text, asks: questions[m].asks })),
        probes: ordered.slice(0, probesPerCluster),
        topSimilarity: 0,
        coverage: 0,
        nearest: [],
      };
    })
    .sort((a, b) => b.asks - a.asks || b.lastSeen.localeCompare(a.lastSeen) || a.members[0] - b.members[0]);
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const sumChars = (texts: readonly string[]) => texts.reduce((a, t) => a + t.length, 0);

export async function refreshInsights(
  deps: InsightsDeps,
  opts: { triggeredBy?: string | null; config?: Partial<InsightsConfig> } = {},
): Promise<RefreshResult> {
  const cfg = { ...DEFAULT_INSIGHTS_CONFIG, ...opts.config };
  const t0 = deps.now();
  const deadline = t0 + cfg.budgetMs;

  const last = await deps.store.latestRun();
  if (last) {
    const age = t0 - Date.parse(last.started_at);
    if (last.status === 'running' && age < cfg.staleRunMs) {
      return { ok: false, reason: 'running', message: 'רענון קודם עדיין רץ. נסו שוב בעוד דקה.' };
    }
    if (age < cfg.cooldownMs) {
      const wait = Math.max(1, Math.ceil((cfg.cooldownMs - age) / 60_000));
      return { ok: false, reason: 'cooldown', message: `התובנות רועננו ממש עכשיו. אפשר לרענן שוב בעוד ${wait} דק׳.` };
    }
  }

  const timings: Record<string, number> = {};
  let mark = deps.now();
  const lap = (step: string) => {
    const t = deps.now();
    timings[step] = t - mark;
    mark = t;
  };
  const windowTo = new Date(t0).toISOString();
  const windowFrom = new Date(t0 - cfg.windowDays * DAY_MS).toISOString();
  const weekStart = new Date(t0 - 7 * DAY_MS).toISOString();
  const params: Record<string, unknown> = {
      window_days: cfg.windowDays,
      max_questions: cfg.maxQuestions,
      max_topics: cfg.maxTopics,
      threshold: cfg.threshold,
      weights: { cos: COS_WEIGHT, terms: TERM_WEIGHT },
      probes: cfg.probes,
      embed_model: EMBED_MODEL,
      label_model: LABEL_MODEL,
  };
  const runId = await deps.store.createRun({ window_from: windowFrom, window_to: windowTo, triggered_by: opts.triggeredBy ?? null, params });

  let costUsd = 0;
  let embedTokens = 0;
  let labelIn = 0;
  let labelOut = 0;
  const finish = async (status: InsightRunStatus, extra: Partial<InsightRunRow>) =>
    deps.store.finishRun(runId, {
      status,
      finished_at: new Date(deps.now()).toISOString(),
      embed_tokens: embedTokens,
      label_input_tokens: labelIn,
      label_output_tokens: labelOut,
      cost_usd: Math.round(costUsd * 1e6) / 1e6,
      params: { ...params, timings_ms: timings } as InsightRunRow['params'],
      ...extra,
    });

  try {
    const rows = await deps.questions({ from: windowFrom, to: windowTo, weekStart, limit: cfg.maxQuestions });
    const questions = mergeQuestions(rows).slice(0, cfg.maxQuestions);
    lap('collect');
    const askCount = questions.reduce((a, q) => a + q.asks, 0);
    if (questions.length === 0) {
      const message = `לא נמצאו שאלות ב-${cfg.windowDays} הימים האחרונים.`;
      await finish('empty', { message, question_count: 0, ask_count: 0, topic_count: 0 });
      return { ok: true, runId, status: 'empty', topics: 0, questions: 0, costUsd: 0, message };
    }

    const fullTexts = questions.map((q) => q.text);
    const topicTexts = questions.map((q) => topicText(q.text));
    const embedEstimate = estimateCostUsd(EMBED_MODEL, { inputTokens: sumChars(fullTexts) + sumChars(topicTexts), outputTokens: 0 });
    const budget = await deps.checkBudget(embedEstimate + 0.01);
    if (!budget.ok) {
      const message = budget.message ?? 'תקציב ה-AI היומי נוצל. נסו שוב מחר.';
      await finish('budget', { message, question_count: questions.length, ask_count: askCount });
      return { ok: false, reason: 'budget', message, runId };
    }

    const embedded = await deps.embed([...fullTexts, ...topicTexts]);
    lap('embed');
    embedTokens = embedded.tokens;
    costUsd += await deps.recordUsage('insights_embed', EMBED_MODEL, { inputTokens: embedded.tokens, outputTokens: 0 });
    if (embedded.vectors.length !== fullTexts.length * 2) throw new Error('embedding count mismatch');
    const fullVectors = embedded.vectors.slice(0, questions.length).map(unitVector);
    const topicVectors = embedded.vectors.slice(questions.length).map(unitVector);

    const groups = clusterQuestions(topicVectors, questions.map((q) => topicTerms(q.text)), cfg.threshold);
    const clusters = summarizeClusters(groups, questions, topicVectors, cfg.probes).slice(0, cfg.maxTopics);
    lap('cluster');

    // Coverage: the cluster's probe questions through the site's own search
    // (every probe of the DEEP_PROBE_TOPICS biggest topics, one for the tail).
    await mapLimit(clusters, 4, async (cluster, i) => {
      const probes = i < DEEP_PROBE_TOPICS ? cluster.probes : cluster.probes.slice(0, 1);
      const docs = await mapLimit(probes, 3, async (m) => probeDocs(await deps.search(questions[m].text, fullVectors[m]), deps.resolve));
      const cov = clusterCoverage(docs);
      cluster.topSimilarity = cov.topSimilarity;
      cluster.coverage = cov.coverage;
      cluster.nearest = cov.nearest;
    });
    lap('coverage');

    // Labels and the coverage review: parallel calls of LABEL_CHUNK clusters, if there's budget and time.
    let status: InsightRunStatus = 'done';
    let message = '';
    let labels: LabelResult['labels'] | null = null;
    const labelInput: LabelCluster[] = clusters.map((c, i) => ({
      id: i + 1,
      questions: c.examples,
      nearest: c.nearest.map((n) => ({ kind: n.kind, title: n.title })),
    }));
    const chunks: LabelCluster[][] = [];
    for (let i = 0; i < labelInput.length; i += LABEL_CHUNK) chunks.push(labelInput.slice(i, i + LABEL_CHUNK));
    const timeLeft = deadline - deps.now();
    if (timeLeft < 12_000) {
      status = 'partial';
      message = 'לא נשאר זמן לניסוח הכותרות: הוצגה השאלה הנפוצה בכל נושא.';
    } else {
      const labelBudget = await deps.checkBudget(chunks.reduce((a, c) => a + estimateLabelUsd(c), 0));
      if (!labelBudget.ok) {
        status = 'partial';
        message = 'תקציב ה-AI היומי נוצל לפני ניסוח הכותרות: הוצגה השאלה הנפוצה בכל נושא.';
      } else {
        const results = await Promise.allSettled(chunks.map((chunk) => deps.label(chunk, Math.min(30_000, timeLeft - 5_000))));
        labels = new Map();
        let failed = 0;
        for (const r of results) {
          const usage = r.status === 'fulfilled' ? r.value.usage : r.reason instanceof LabelError ? r.reason.usage : null;
          if (r.status === 'fulfilled') r.value.labels.forEach((v, k) => labels!.set(k, v));
          else {
            failed += 1;
            console.error(`[insights] labels failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
          }
          if (usage) {
            labelIn += (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0);
            labelOut += usage.outputTokens ?? 0;
            costUsd += await deps.recordUsage('insights_labels', LABEL_MODEL, usage);
          }
        }
        if (failed > 0) {
          status = 'partial';
          message = failed === chunks.length ? 'ניסוח הכותרות נכשל: הוצגה השאלה הנפוצה בכל נושא.' : 'חלק מהכותרות לא נוסחו: בנושאים האלה מוצגת השאלה הנפוצה.';
        }
        if (labels.size === 0) labels = null;
      }
    }
    lap('label');

    const topics: TopicInsert[] = clusters.map((c, i) => {
      const l = labels?.get(i + 1);
      const reviewed = Boolean(l);
      return {
        rank: i + 1,
        label: l?.label ?? c.examples[0]?.q ?? 'שאלה',
        suggested_title: l?.videoTitle || null,
        asks: c.asks,
        visitors: c.visitors,
        question_count: c.members.length,
        asks_this_week: c.asksThisWeek,
        asks_prev_week: c.asksPrevWeek,
        trend_pct: trendPct(c.asksThisWeek, c.asksPrevWeek),
        coverage: c.coverage,
        top_similarity: c.topSimilarity,
        coverage_level: l ? levelFromReview(l.verdict) : levelFromSimilarity(c.topSimilarity),
        level_source: reviewed ? 'review' : 'similarity',
        level_reason: l?.reason || null,
        avg_confidence: c.avgConfidence,
        examples: c.examples,
        nearest: c.nearest.map((n) => ({ kind: n.kind, id: n.id, title: n.title, href: n.href, similarity: n.similarity, start_s: n.startS ?? null })),
      };
    });
    await deps.store.saveTopics(runId, topics);
    const gaps = topics.filter((t) => t.coverage_level === 'gap').length;
    message = message || `${topics.length} נושאים, ${gaps} מהם בלי תוכן מתאים.`;
    await finish(status, {
      message,
      question_count: questions.length,
      ask_count: askCount,
      topic_count: topics.length,
      label_model: labels ? LABEL_MODEL : null,
    });
    return { ok: true, runId, status, topics: topics.length, questions: questions.length, costUsd, message };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[insights] refresh failed: ${detail}`);
    await finish('failed', { message: `הרענון נכשל: ${detail.slice(0, 200)}` }).catch(() => undefined);
    return { ok: false, reason: 'error', message: 'הרענון נכשל. נסו שוב בעוד כמה דקות.', runId };
  }
}
