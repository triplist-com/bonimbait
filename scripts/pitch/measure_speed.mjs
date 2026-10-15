#!/usr/bin/env node
/**
 * Old vs new speed for the pitch site: mobile Lighthouse on the live
 * bonimbayit.co.il home page and on our home page, several runs each, both
 * throttling methods, medians -> apps/web/data/pitch/speed.json.
 *
 *   simulate  Lighthouse's simulated throttling (what PageSpeed Insights reports)
 *   devtools  throttling applied in the browser while the page loads
 *
 * Measure our side on a production build (`npm run build && npx next start -p <port>`),
 * never on `next dev`.
 *
 * Usage:
 *   CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   LIGHTHOUSE_BIN=/path/to/node_modules/.bin/lighthouse \
 *   node scripts/pitch/measure_speed.mjs --new=http://localhost:3116/ [--old=https://bonimbayit.co.il/] [--runs=3]
 *
 * Without LIGHTHOUSE_BIN it runs `npx --yes lighthouse@13.5.0`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const NEW_URL = arg('new');
const OLD_URL = arg('old', 'https://bonimbayit.co.il/');
const RUNS = Number(arg('runs', '3'));
const OUT = path.resolve(arg('out', path.join(repoRoot, 'apps', 'web', 'data', 'pitch', 'speed.json')));
const METHODS = ['simulate', 'devtools'];

if (!NEW_URL) {
  console.error('usage: node scripts/pitch/measure_speed.mjs --new=http://localhost:<port>/ [--old=…] [--runs=3]');
  process.exit(2);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-speed-'));
const bin = process.env.LIGHTHOUSE_BIN;

function lighthouse(url, method, outPath) {
  const flags = [
    url,
    '--quiet',
    '--form-factor=mobile',
    '--only-categories=performance',
    '--chrome-flags=--headless=new --no-sandbox',
    `--throttling-method=${method}`,
    '--output=json',
    `--output-path=${outPath}`,
  ];
  const [cmd, args] = bin ? [bin, flags] : ['npx', ['--yes', 'lighthouse@13.5.0', ...flags]];
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 300_000, env: process.env });
  if (r.status !== 0 || !fs.existsSync(outPath)) throw new Error(`lighthouse failed for ${url} (${method}): ${String(r.stderr).slice(0, 300)}`);
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

function measure(label, url) {
  const lcp = {};
  const perf = {};
  let bytes = [];
  let requests = [];
  let version = '';
  for (const method of METHODS) {
    const lcps = [];
    const perfs = [];
    for (let i = 1; i <= RUNS; i++) {
      const report = lighthouse(url, method, path.join(workDir, `${label}-${method}-${i}.json`));
      version = report.lighthouseVersion;
      const a = report.audits;
      lcps.push(Math.round(a['largest-contentful-paint'].numericValue));
      perfs.push(Math.round(report.categories.performance.score * 100));
      bytes.push(Math.round(a['total-byte-weight']?.numericValue ?? 0));
      requests.push(a['network-requests']?.details?.items?.length ?? 0);
      console.log(`${label} ${method} #${i}: LCP ${lcps.at(-1)} ms, performance ${perfs.at(-1)}`);
    }
    lcp[method] = median(lcps);
    perf[method] = median(perfs);
  }
  return { version, site: { url, lcpMs: lcp, performance: perf, bytes: median(bytes), requests: median(requests) } };
}

const oldSide = measure('old', OLD_URL);
const newSide = measure('new', NEW_URL);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

const result = {
  measuredAt: today,
  tool: `Lighthouse ${newSide.version || oldSide.version}`,
  formFactor: 'mobile',
  runs: RUNS,
  statistic: 'median',
  old: { label: new URL(OLD_URL).host, ...oldSide.site },
  new: { label: 'האתר החדש, בניית production מקומית (next start)', ...newSide.site, url: new URL(NEW_URL).pathname },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(`wrote ${OUT}`);
