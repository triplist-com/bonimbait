#!/usr/bin/env node
/**
 * Cold-load cost of the static search index, with the production module.
 *
 * Each run is a fresh Node process (forked below) that imports
 * apps/web/app/api/_lib/semantic.ts and times the first semanticSearch() (file reads,
 * JSON parse, norms, keyword text: the cold path) against a second one (warm). The
 * query embedding comes from the cache, so nothing is paid and the network is not timed.
 *
 *   node scripts/knowledge/quality/load_time.mjs --root <dir with data/> --cache <json> [--runs 5]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const root = path.resolve(args.root);
const QUERY = 'כמה עולה שלד לבית של 200 מ״ר ב-2026?';

if (args.child) {
  const cache = JSON.parse(fs.readFileSync(args.cache, 'utf8'));
  process.env.OPENAI_API_KEY ||= 'cached-only';
  globalThis.fetch = async (_url, init) => {
    const { input } = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: [{ embedding: cache[input] }] }), { status: 200 });
  };
  process.chdir(root);
  const t0 = performance.now();
  const { semanticSearch } = await import(pathToFileURL(path.join(repo, 'apps/web/app/api/_lib/semantic.ts')).href);
  const t1 = performance.now();
  await semanticSearch(QUERY, 80);
  const t2 = performance.now();
  await semanticSearch(QUERY, 80);
  const t3 = performance.now();
  const rss = process.memoryUsage().rss;
  console.log(JSON.stringify({ import: t1 - t0, first: t2 - t1, warm: t3 - t2, rss }));
  process.exit(0);
}

const sizes = Object.fromEntries(
  ['search-index.json', 'search-index.f32', 'posts-index.json', 'posts-index.f32', 'videos.json'].map((f) => {
    const p = path.join(root, 'data', f);
    return [f, fs.existsSync(p) ? fs.statSync(p).size : 0];
  }),
);
const runs = Number(args.runs || 5);
const samples = [];
for (let i = 0; i < runs; i++) {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--child', '1', '--root', root, '--cache', args.cache], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  samples.push(JSON.parse(out.trim().split('\n').pop()));
}
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const mb = (n) => Math.round((n / 1e6) * 10) / 10;
const result = {
  root,
  sizes_mb: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, mb(v)])),
  f32_total_mb: mb(sizes['search-index.f32'] + sizes['posts-index.f32']),
  runs,
  cold_load_ms_median: Math.round(median(samples.map((s) => s.first - s.warm))),
  first_search_ms_median: Math.round(median(samples.map((s) => s.first))),
  warm_search_ms_median: Math.round(median(samples.map((s) => s.warm))),
  rss_mb_median: mb(median(samples.map((s) => s.rss))),
};
console.log(JSON.stringify(result, null, 1));
