import { describe, expect, it, vi } from 'vitest';
import { averageLinkageMerges, centroid, clusterQuestions, cutClusters, similarityMatrix, unitVector } from '@/lib/command/insights/cluster';
import { cleanQuestion, questionKey, termOverlap, topicTerms, topicText } from '@/lib/command/insights/text';
import {
  clusterCoverage,
  coverageScore,
  levelFromReview,
  levelFromSimilarity,
  probeDocs,
  type ProbeHit,
} from '@/lib/command/insights/coverage';
import { mergeQuestions, refreshInsights, summarizeClusters, trendPct, type InsightsDeps, type TopicInsert } from '@/lib/command/insights/engine';
import {
  buildLabelPrompt,
  estimateLabelUsd,
  LabelError,
  type ClusterLabel,
  type LabelCluster,
  type LabelResult,
} from '@/lib/command/insights/label';
import type { QuestionStatRow } from '@/lib/command/db-types';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
describe('question text', () => {
  it('strips the question template and keeps the topic words', () => {
    expect(topicText('כמה עולה רצפה צפה למטר?')).toBe('רצפה צפה');
    expect(topicText('כמה עולה ממ״ד בבית פרטי?')).toBe('ממ"ד');
    expect(topicText('מרתף בשטח משופע - איך מתכננים?')).toBe('מרתף בשטח משופע מתכננים');
    expect(topicText('כמה זה עולה?')).toBe('כמה זה עולה?'); // nothing left: keep the question
  });

  it('normalizes keys like the SQL grouping', () => {
    expect(questionKey('  כמה  עולה רצפה צפה?? ')).toBe('כמה עולה רצפה צפה');
    expect(questionKey('ממ״ד')).toBe(questionKey('ממ"ד'));
    expect(cleanQuestion('x'.repeat(400))).toHaveLength(300);
  });

  it('overlaps terms across Hebrew prefixes', () => {
    expect(topicTerms('מרתף במגרש משופע')).toEqual(['מרתפ', 'במגרש', 'משופע']);
    expect(termOverlap(['מרתפ', 'שיפוע'], ['במרתפ', 'שיפוע'])).toBe(1);
    expect(termOverlap(['רצפה', 'צפה'], ['גג', 'רעפימ'])).toBe(0);
    expect(termOverlap([], ['x'])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reference: greedy average linkage, O(n^3). */
function naiveClusters(sim: Float32Array, n: number, threshold: number): number[][] {
  let clusters = Array.from({ length: n }, (_, i) => [i]);
  const avg = (A: number[], B: number[]) => {
    let s = 0;
    for (const a of A) for (const b of B) s += sim[a * n + b];
    return s / (A.length * B.length);
  };
  for (;;) {
    let best = -Infinity;
    let bi = -1;
    let bj = -1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const s = avg(clusters[i], clusters[j]);
        if (s > best) {
          best = s;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 || best < threshold) break;
    clusters[bi] = [...clusters[bi], ...clusters[bj]].sort((x, y) => x - y);
    clusters = clusters.filter((_, k) => k !== bj);
  }
  return clusters.sort((x, y) => x[0] - y[0]);
}

describe('average-linkage clustering', () => {
  it('matches the naive algorithm on random similarities', () => {
    const r = rng(7);
    for (let trial = 0; trial < 25; trial++) {
      const n = 3 + Math.floor(r() * 14);
      const sim = new Float32Array(n * n);
      for (let i = 0; i < n; i++) {
        sim[i * n + i] = 1;
        for (let j = i + 1; j < n; j++) {
          const v = Math.round(r() * 1000) / 1000; // distinct-ish values
          sim[i * n + j] = v;
          sim[j * n + i] = v;
        }
      }
      const merges = averageLinkageMerges(sim, n);
      expect(merges).toHaveLength(n - 1);
      for (const tau of [0.3, 0.5, 0.7]) {
        expect(cutClusters(merges, n, tau)).toEqual(naiveClusters(sim, n, tau));
      }
    }
  });

  it('groups paraphrases and separates topics, deterministically', () => {
    const dims = 8;
    const vec = (axis: number, wobble: number) => {
      const v = new Array(dims).fill(0.02);
      v[axis] = 1;
      v[(axis + 1) % dims] = wobble;
      return unitVector(v);
    };
    const vectors = [vec(0, 0.1), vec(0, 0.2), vec(3, 0.1), vec(0, 0.15), vec(3, 0.3), vec(6, 0)];
    const terms = [['רצפה'], ['רצפה'], ['מרתפ'], ['רצפה'], ['מרתפ'], ['בריכה']];
    const clusters = clusterQuestions(vectors, terms);
    expect(clusters).toEqual([[0, 1, 3], [2, 4], [5]]);
    expect(clusterQuestions(vectors, terms)).toEqual(clusters);
    expect(clusterQuestions([], [])).toEqual([]);
    expect(clusterQuestions([vec(1, 0)], [[]])).toEqual([[0]]);
  });

  it('weights cosine and term overlap', () => {
    const a = unitVector([1, 0]);
    const b = unitVector([0, 1]);
    const sim = similarityMatrix([a, b], [['x'], ['x']]);
    expect(sim[1]).toBeCloseTo(0.45); // cos 0, overlap 1
    expect(Array.from(centroid([a, b], [0, 1]))).toEqual([Math.SQRT1_2, Math.SQRT1_2].map((x) => Math.fround(x)));
  });
});

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------
describe('coverage scoring', () => {
  it('maps the best source similarity to 0..1 and to a level', () => {
    expect(coverageScore(0.4)).toBe(0);
    expect(coverageScore(0.525)).toBe(0.5);
    expect(coverageScore(0.8)).toBe(1);
    expect(coverageScore(Number.NaN)).toBe(0);
    expect(levelFromSimilarity(0.44)).toBe('gap');
    expect(levelFromSimilarity(0.5)).toBe('partial');
    expect(levelFromSimilarity(0.6)).toBe('covered');
    expect([levelFromReview('answered'), levelFromReview('partial'), levelFromReview('missing')]).toEqual(['covered', 'partial', 'gap']);
  });

  const resolve = (h: ProbeHit) =>
    h.kind === 'post' ? { title: h.title, href: `/${h.slug}/` } : h.youtube_id === 'gone' ? null : { title: `סרטון ${h.youtube_id}`, href: `/video/${h.youtube_id}/` };

  it('reduces hits to documents in search order, keeping each one’s best moment', () => {
    const docs = probeDocs(
      [
        { kind: 'video', youtube_id: 'v1', start_time: 30.6, cos: 0.48 },
        { kind: 'post', slug: 'p1', title: 'מאמר', cos: 0.52 },
        { kind: 'video', youtube_id: 'v1', start_time: 95, cos: 0.55 },
        { kind: 'video', youtube_id: 'gone', start_time: 0, cos: 0.9 },
        { kind: 'video', youtube_id: 'v2', start_time: 0, cos: 0.3 },
      ],
      resolve,
      2,
    );
    expect(docs.map((d) => [d.id, d.similarity, d.startS])).toEqual([
      ['v1', 0.55, 95],
      ['p1', 0.52, null],
    ]);
  });

  it('averages probes and merges their nearest content', () => {
    const doc = (id: string, similarity: number) => ({ kind: 'post' as const, id, title: id, href: `/${id}/`, similarity, startS: null });
    const cov = clusterCoverage([[doc('a', 0.5), doc('b', 0.4)], [doc('b', 0.6)], []]);
    expect(cov.topSimilarity).toBe(0.55);
    expect(cov.coverage).toBe(0.6);
    expect(cov.nearest.map((d) => [d.id, d.similarity])).toEqual([
      ['b', 0.6],
      ['a', 0.5],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Engine (fakes, no network)
// ---------------------------------------------------------------------------
const NOW = Date.parse('2026-10-14T09:00:00Z');

function row(question: string, asks: number, over: Partial<QuestionStatRow> = {}): QuestionStatRow {
  return {
    question,
    question_key: questionKey(question),
    asks,
    visitors: asks,
    asks_this_week: Math.ceil(asks / 2),
    asks_prev_week: Math.floor(asks / 3),
    answers: asks,
    avg_confidence: 0.5,
    zero_source_answers: 0,
    avg_top_similarity: null,
    first_seen: '2026-09-20T10:00:00Z',
    last_seen: '2026-10-13T10:00:00Z',
    ...over,
  };
}

const QUESTIONS = [
  row('כמה עולה רצפה צפה למטר?', 12),
  row('רצפה צפה - חובה או מותרות?', 8),
  row('מרתף בשטח משופע - איך מתכננים?', 9),
  row('כמה עולה מרתף במגרש בשיפוע?', 5),
  row('גג רעפים או גג שטוח?', 3),
];

/** Fake embeddings: one axis per topic word, so topics separate cleanly. */
function fakeVector(text: string): number[] {
  const v = new Array(6).fill(0.01);
  if (/רצפה/.test(text)) v[0] = 1;
  if (/מרתף|משופע|שיפוע/.test(text)) v[1] = 1;
  if (/גג/.test(text)) v[2] = 1;
  v[5] = (text.length % 7) / 50;
  return v;
}

function deps(over: Partial<InsightsDeps> = {}) {
  const saved: TopicInsert[] = [];
  const runs: Array<Record<string, unknown>> = [];
  const usage: Array<[string, string, number]> = [];
  const base: InsightsDeps = {
    now: () => NOW,
    questions: vi.fn(async () => QUESTIONS),
    embed: vi.fn(async (texts: string[]) => ({ vectors: texts.map(fakeVector), tokens: texts.length * 10 })),
    search: vi.fn(async (query: string): Promise<ProbeHit[]> =>
      /גג/.test(query)
        ? [{ kind: 'post', slug: 'roof', title: 'גג רעפים – המפרט', cos: 0.66 }]
        : /רצפה/.test(query)
          ? [{ kind: 'video', youtube_id: '5RNVyFYpkCw', start_time: 40, cos: 0.5 }]
          : [{ kind: 'post', slug: 'basement', title: 'בניית מרתף', cos: 0.44 }],
    ),
    resolve: (h) => (h.kind === 'post' ? { title: h.title, href: `/${h.slug}/` } : { title: 'רצפה צפה - מה זה בכלל', href: `/video/${h.youtube_id}/` }),
    label: vi.fn(async (clusters: LabelCluster[]): Promise<LabelResult> => ({
      labels: new Map<number, ClusterLabel>(
        clusters.map((c): [number, ClusterLabel] => [
          c.id,
          {
            label: c.questions[0].q.includes('רצפה') ? 'רצפה צפה' : c.questions[0].q.includes('גג') ? 'גג רעפים' : 'מרתף במגרש משופע',
            videoTitle: 'כותרת',
            verdict: c.questions[0].q.includes('גג') ? ('answered' as const) : ('missing' as const),
            reason: 'סיבה',
          },
        ]),
      ),
      usage: { inputTokens: 1200, outputTokens: 300 },
      model: 'claude-haiku-5-5',
    })),
    checkBudget: vi.fn(async () => ({ ok: true })),
    recordUsage: vi.fn(async (route: string, model: string, u) => {
      const cost = model === 'text-embedding-3-small' ? u.inputTokens * 0.02e-6 : u.inputTokens * 0.1e-6 + u.outputTokens * 0.5e-6;
      usage.push([route, model, cost]);
      return cost;
    }),
    store: {
      latestRun: vi.fn(async () => null),
      createRun: vi.fn(async (r) => {
        runs.push({ ...r });
        return 'run-1';
      }),
      finishRun: vi.fn(async (_id, patch) => {
        Object.assign(runs[runs.length - 1], patch);
      }),
      saveTopics: vi.fn(async (_id, topics) => {
        saved.push(...topics);
      }),
    },
    ...over,
  };
  return { deps: base, saved, runs, usage };
}

describe('refreshInsights', () => {
  it('clusters, measures coverage, labels and stores the topics', async () => {
    const { deps: d, saved, runs, usage } = deps();
    const result = await refreshInsights(d, { triggeredBy: 'admin-1' });
    expect(result).toMatchObject({ ok: true, status: 'done', topics: 3, questions: 5 });
    expect(saved.map((t) => [t.rank, t.label, t.asks, t.coverage_level, t.level_source])).toEqual([
      [1, 'רצפה צפה', 20, 'gap', 'review'],
      [2, 'מרתף במגרש משופע', 14, 'gap', 'review'],
      [3, 'גג רעפים', 3, 'covered', 'review'],
    ]);
    expect(saved[0]).toMatchObject({ question_count: 2, asks_this_week: 10, asks_prev_week: 6, trend_pct: 67, top_similarity: 0.5, coverage: 0.4 });
    expect(saved[0].nearest).toEqual([
      { kind: 'video', id: '5RNVyFYpkCw', title: 'רצפה צפה - מה זה בכלל', href: '/video/5RNVyFYpkCw/', similarity: 0.5, start_s: 40 },
    ]);
    // Embedding once (questions + topic texts), then one label call.
    expect((d.embed as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(10);
    expect(usage.map((u) => u[0])).toEqual(['insights_embed', 'insights_labels']);
    expect(runs[0]).toMatchObject({ status: 'done', topic_count: 3, ask_count: 37, triggered_by: 'admin-1', label_model: 'claude-haiku-5-5' });
    expect(Number(runs[0].cost_usd)).toBeCloseTo(100 * 0.02e-6 + 1200 * 0.1e-6 + 300 * 0.5e-6, 6);
  });

  it('falls back to the similarity level and the top question when labelling fails', async () => {
    const { deps: d, saved, runs, usage } = deps({
      label: vi.fn(async () => {
        throw new LabelError('incomplete', { inputTokens: 900, outputTokens: 8000 });
      }),
    });
    const result = await refreshInsights(d);
    expect(result).toMatchObject({ ok: true, status: 'partial' });
    expect(saved[0]).toMatchObject({ label: 'כמה עולה רצפה צפה למטר?', level_source: 'similarity', coverage_level: 'partial', suggested_title: null });
    expect(saved[2].coverage_level).toBe('covered');
    expect(usage.map((u) => u[0])).toEqual(['insights_embed', 'insights_labels']); // the failed call was still billed
    expect(runs[0].label_model).toBeNull();
  });

  it('refuses before any paid call when the budget says no', async () => {
    const { deps: d, runs } = deps({ checkBudget: vi.fn(async () => ({ ok: false, message: 'נגמר' })) });
    const result = await refreshInsights(d);
    expect(result).toEqual({ ok: false, reason: 'budget', message: 'נגמר', runId: 'run-1' });
    expect(d.embed).not.toHaveBeenCalled();
    expect(runs[0].status).toBe('budget');
  });

  it('keeps a cooldown and does not overlap a running refresh', async () => {
    const recent = deps({ store: { ...deps().deps.store, latestRun: vi.fn(async () => ({ id: 'r0', status: 'done' as const, started_at: new Date(NOW - 60_000).toISOString() })) } });
    expect(await refreshInsights(recent.deps)).toMatchObject({ ok: false, reason: 'cooldown' });
    const running = deps({ store: { ...deps().deps.store, latestRun: vi.fn(async () => ({ id: 'r0', status: 'running' as const, started_at: new Date(NOW - 5 * 60_000).toISOString() })) } });
    expect(await refreshInsights(running.deps)).toMatchObject({ ok: false, reason: 'running' });
    const stale = deps({ store: { ...deps().deps.store, latestRun: vi.fn(async () => ({ id: 'r0', status: 'running' as const, started_at: new Date(NOW - 30 * 60_000).toISOString() })) } });
    expect(await refreshInsights(stale.deps)).toMatchObject({ ok: true });
  });

  it('records an empty run and a failed one', async () => {
    const empty = deps({ questions: vi.fn(async () => []) });
    expect(await refreshInsights(empty.deps)).toMatchObject({ ok: true, status: 'empty', topics: 0 });
    expect(empty.deps.embed).not.toHaveBeenCalled();
    const broken = deps({ embed: vi.fn(async () => { throw new Error('openai down'); }) });
    const result = await refreshInsights(broken.deps);
    expect(result).toMatchObject({ ok: false, reason: 'error' });
    expect(broken.runs[0]).toMatchObject({ status: 'failed' });
    expect(String(broken.runs[0].message)).toContain('openai down');
  });

  it('merges duplicate wordings and computes trends', () => {
    const merged = mergeQuestions([row('רצפה צפה?', 3, { last_seen: '2026-10-01T00:00:00Z' }), row('רצפה  צפה', 2, { last_seen: '2026-10-05T00:00:00Z' }), row('', 9)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ text: 'רצפה צפה', asks: 5 });
    expect([trendPct(10, 6), trendPct(3, 0), trendPct(0, 4)]).toEqual([67, null, -100]);
    const vectors = [unitVector([1, 0]), unitVector([0.9, 0.1]), unitVector([0, 1])];
    const qs = mergeQuestions([row('א', 1), row('ב', 5), row('ג', 2)]);
    const [c] = summarizeClusters([[0, 1, 2]], qs, vectors, 2);
    expect(c.probes).toHaveLength(2);
    expect(c.examples[0].asks).toBe(5);
  });
});

describe('label prompt', () => {
  it('lists questions with counts and the nearest titles, and estimates an upper bound', () => {
    const prompt = buildLabelPrompt([
      { id: 1, questions: [{ q: 'כמה עולה רצפה צפה?', asks: 12 }], nearest: [{ kind: 'video', title: 'רצפה צפה - מה זה בכלל' }] },
      { id: 2, questions: [{ q: 'מרתף בשיפוע?', asks: 3 }], nearest: [] },
    ]);
    expect(prompt).toContain('אשכול 1');
    expect(prompt).toContain('- כמה עולה רצפה צפה? (12)');
    expect(prompt).toContain('- סרטון: רצפה צפה - מה זה בכלל');
    expect(prompt).toContain('- אין');
    const usd = estimateLabelUsd([{ id: 1, questions: [{ q: 'x', asks: 1 }], nearest: [] }]);
    expect(usd).toBeGreaterThan(0.004); // the full 8K output budget at Haiku 5.5 rates
    expect(usd).toBeLessThan(0.01);
  });
});
