#!/usr/bin/env node
/**
 * Retrieval quality check on a fixed question set (scripts/knowledge/quality/questions.json).
 *
 * Runs the production ranking (apps/web/app/api/_lib/semantic.ts, imported directly:
 * Node 23.6+ strips the types) against one index snapshot and records, per question:
 *   answer — the 5 documents /api/answer/stream feeds to Claude (at most 3 articles)
 *   videos — the top 5 videos of /api/search
 *
 * A snapshot is a directory with data/{search-index,posts-index}.{json,f32} and
 * data/videos.json (e.g. the committed files from `git show <rev>:apps/web/data/...`).
 * Query embeddings are cached in --cache, so re-runs and before/after comparisons
 * embed each question once (~20 tokens, ~$0.0000004 each).
 *
 * Usage:
 *   node scripts/knowledge/quality/retrieval_check.mjs --root <snapshot dir> --cache <json> --out <json>
 */
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./alias-loader.mjs', import.meta.url); // "@/" alias; runtime fusion off (static index only)
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
for (const k of ['root', 'cache', 'out']) {
  if (!args[k]) {
    console.error(`missing --${k}`);
    process.exit(2);
  }
}
const root = path.resolve(args.root);
const questions = JSON.parse(fs.readFileSync(args.questions || path.join(here, 'questions.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'videos.json'), 'utf8'));
const videos = new Map(catalog.videos.map((v) => [v.youtube_id, v]));

// API key for cache misses only (never logged).
if (!process.env.OPENAI_API_KEY) {
  for (const f of [path.join(repo, 'apps/web/.env.local'), path.join(repo, '.env')]) {
    if (!fs.existsSync(f)) continue;
    const line = fs.readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('OPENAI_API_KEY='));
    if (line) {
      process.env.OPENAI_API_KEY = line.slice('OPENAI_API_KEY='.length).trim();
      break;
    }
  }
}

// Query-embedding cache in front of the OpenAI call semantic.ts makes.
const cache = fs.existsSync(args.cache) ? JSON.parse(fs.readFileSync(args.cache, 'utf8')) : {};
let misses = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('/v1/embeddings') && init?.body) {
    const { input } = JSON.parse(init.body);
    if (!cache[input]) {
      misses += 1;
      const res = await realFetch(url, init);
      if (!res.ok) return res;
      cache[input] = (await res.json()).data[0].embedding;
      fs.mkdirSync(path.dirname(args.cache), { recursive: true });
      fs.writeFileSync(args.cache, JSON.stringify(cache));
    }
    return new Response(JSON.stringify({ data: [{ embedding: cache[input] }] }), { status: 200 });
  }
  return realFetch(url, init);
};

// semantic.ts resolves its data files from process.cwd()/data.
process.chdir(root);
const { semanticSearch, semanticSearchSegments, groupByVideo } = await import(
  pathToFileURL(path.join(repo, 'apps/web/app/api/_lib/semantic.ts')).href
);

const MAX_DOCS = 5;
const MAX_POST_DOCS = 3;
const docKey = (h) => (h.kind === 'video' ? `v:${h.youtube_id}` : `p:${h.slug}`);
const brief = (h) => ({
  key: docKey(h),
  kind: h.kind,
  title: h.kind === 'video' ? videos.get(h.youtube_id)?.title ?? h.youtube_id : h.title,
  t: h.kind === 'video' ? Math.floor(h.start_time) : undefined,
  cos: Number(h.cos.toFixed(4)),
  text: h.text.slice(0, 400),
});

/** The documents /api/answer/stream picks (same rules as the route). */
function answerDocs(hits) {
  const byDoc = new Map();
  for (const h of hits) {
    const k = docKey(h);
    if (byDoc.has(k)) byDoc.get(k).push(h);
    else byDoc.set(k, [h]);
  }
  const ranked = [...byDoc.values()]
    .map((segs) => segs.sort((a, b) => b.score - a.score))
    .sort((a, b) => b[0].score - a[0].score)
    .filter((segs) => segs[0].kind === 'post' || (videos.has(segs[0].youtube_id) && !segs[0].title_only));
  const docs = [];
  let posts = 0;
  for (const segs of ranked) {
    if (segs[0].kind === 'post' && posts >= MAX_POST_DOCS) continue;
    if (segs[0].kind === 'post') posts += 1;
    docs.push(segs);
  }
  for (const segs of ranked) if (!docs.includes(segs)) docs.push(segs);
  docs.splice(MAX_DOCS);
  docs.sort((a, b) => b[0].score - a[0].score);
  return docs.map((segs) => brief(segs[0]));
}

/** The top videos /api/search returns (best segment per video). */
function topVideos(hits, n = 5) {
  const out = [];
  groupByVideo(hits).forEach((segs) => {
    segs.sort((a, b) => b.score - a.score);
    if (videos.has(segs[0].youtube_id)) out.push(segs[0]);
  });
  return out.sort((a, b) => b.score - a.score).slice(0, n).map(brief);
}

const results = [];
const t0 = performance.now();
for (const { id, topic, q } of questions) {
  const mixed = await semanticSearch(q, 80);
  const vids = await semanticSearchSegments(q, 60);
  results.push({ id, topic, q, answer: answerDocs(mixed), videos: topVideos(vids) });
}
const index = JSON.parse(fs.readFileSync(path.join(root, 'data', 'search-index.json'), 'utf8'));
const out = {
  root,
  generated_at: new Date().toISOString(),
  index_videos: new Set(index.map((r) => r.youtube_id)).size,
  index_segments: index.length,
  catalog_videos: videos.size,
  embedding_misses: misses,
  ms: Math.round(performance.now() - t0),
  results,
};
fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(`${results.length} questions, ${misses} new query embeddings, ${out.ms} ms -> ${args.out}`);
