#!/usr/bin/env node
// Record the advisor demo fixture from one real answer (one model call, ~$0.02).
//
//   cd apps/web && npx next dev -p 3111          # with ANTHROPIC_API_KEY / OPENAI_API_KEY
//   node scripts/advisor/record_demo_fixture.mjs [--port 3111] [--question "..."]
//
// Writes apps/web/lib/demo/fixtures/advisor-recording.json: the real sources
// (YouTube ids, exact seconds, quotes), the streamed chunks with their timing,
// the answer, follow-ups and matched pros. /platform/demo/advisor/ replays it at
// $0. The request is sent from a /platform page, so its AI usage is recorded as
// demo usage. Log the spend in docs/platform/API_SPEND.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../apps/web/lib/demo/fixtures/advisor-recording.json');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : fallback;
};
const port = opt('--port', '3111');
const question = opt('--question', 'כמה עולה שלד לבית של 200 מ״ר ב-2026?');

const t0 = Date.now();
const res = await fetch(`http://localhost:${port}/api/answer/stream`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    referer: `http://localhost:${port}/platform/demo/advisor/`,
    'user-agent': 'Mozilla/5.0 (advisor demo recorder)',
  },
  body: JSON.stringify({ query: question, origin: 'demo' }),
});
if (!res.ok || !res.body) throw new Error(`answer stream failed: ${res.status}`);

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let sourcesEvt = null;
let doneEvt = null;
let sourcesMs = 0;
let firstChunkMs = 0;
const chunks = [];
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split('\n\n');
  buffer = frames.pop();
  for (const frame of frames) {
    const line = frame.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    const evt = JSON.parse(line.slice(6));
    const ms = Date.now() - t0;
    if (evt.type === 'sources') {
      sourcesEvt = evt;
      sourcesMs = ms;
    } else if (evt.type === 'chunk') {
      if (!firstChunkMs) firstChunkMs = ms;
      chunks.push({ t: ms - firstChunkMs, text: evt.content });
    } else if (evt.type === 'done') {
      doneEvt = evt;
    } else if (evt.type === 'error' || evt.type === 'reset') {
      throw new Error(`stream ${evt.type}: ${evt.message ?? ''}`);
    }
  }
}
if (!sourcesEvt || !doneEvt || doneEvt.degraded || doneEvt.refused) throw new Error('no complete answer to record');

const answer = doneEvt.share?.payload?.answer ?? chunks.map((c) => c.text).join('');
const recording = {
  question,
  recordedAt: new Date().toISOString(),
  model: 'claude-sonnet-5-5',
  timings: { sourcesMs, firstChunkMs, totalMs: Date.now() - t0 },
  stats: sourcesEvt.stats,
  confidence: doneEvt.confidence_detail ?? sourcesEvt.confidence,
  sources: doneEvt.sources,
  answer,
  chunks,
  followups: doneEvt.followups,
  pros: doneEvt.pros,
  intent: doneEvt.intent,
};
fs.writeFileSync(out, `${JSON.stringify(recording, null, 2)}\n`);
console.log(`recorded ${chunks.length} chunks, ${recording.sources.length} sources -> ${path.relative(process.cwd(), out)}`);
console.log(JSON.stringify(recording.timings));
