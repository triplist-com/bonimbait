#!/usr/bin/env node
// Advisor evaluation: real questions end to end against a running server (each
// question is one model call, ~$0.017; the whole set ~$0.27). Results in
// docs/platform/ADVISOR_EVAL.md.
//
//   node scripts/advisor/eval.mjs <out.json> [--only=id,id] [--port=3111]
import fs from 'node:fs';

const out = process.argv[2];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const port = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=3111').slice(7);
const only = onlyArg ? onlyArg.slice(7).split(',') : null;

const CASES = [
  { id: 'cost-shell', topic: 'עלויות / שלד', q: 'כמה עולה שלד לבית של 200 מ״ר ב-2026?' },
  { id: 'permit-time', topic: 'היתרים', q: 'כמה זמן לוקח לקבל היתר בנייה לבית פרטי?' },
  { id: 'shell-pour', topic: 'שלד', q: 'מה חייבים לבדוק לפני יציקת בטון?' },
  { id: 'waterproofing', topic: 'איטום', q: 'איך עושים איטום נכון למרתף?' },
  { id: 'electrical', topic: 'חשמל', q: 'איך מתכננים את החשמל בבית חדש?' },
  { id: 'contractor', topic: 'קבלנים', q: 'איך בוחרים קבלן שלד בלי להיכוות?' },
  { id: 'mortgage', topic: 'משכנתא', q: 'איך עובדת משכנתא לבנייה עצמית?' },
  { id: 'tiling-cost', topic: 'גמרים / עלויות', q: 'כמה עולה ריצוף לבית פרטי כולל חומר?' },
  { id: 'inspector', topic: 'ניהול ופיקוח', q: 'האם צריך מפקח בנייה?' },
  { id: 'taba', topic: 'רכישה / תב"ע', q: 'מה זה תב״ע ואיך בודקים אותה לפני שקונים מגרש?' },
  { id: 'elevator', topic: 'מעט תוכן', q: 'כמה עולה להתקין מעלית בבית פרטי?' },
  { id: 'off-topic', topic: 'מחוץ לתחום', q: 'מה המתכון הכי טוב לשקשוקה?' },
  {
    id: 'followup',
    topic: 'שיחה (המשך)',
    q: 'ומה לגבי חיפוי אבן לקירות החוץ?',
    historyFrom: 'tiling-cost',
  },
  { id: 'focus-video', topic: 'שאלו על הסרטון', q: 'מה הנקודות הכי חשובות בסרטון?', focus: { kind: 'video', id: 'vluNH7GTkU4' } },
  { id: 'budget-overrun', topic: 'תקציב', q: 'איפה הכי קל לחרוג מהתקציב בבנייה?' },
];

async function ask(body) {
  const t0 = Date.now();
  const res = await fetch(`http://localhost:${port}/api/answer/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: `http://localhost:${port}/ask/`, 'user-agent': 'Mozilla/5.0 (advisor eval)' },
    body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const r = { status: res.status, answer: '', timings: {} };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop();
    for (const f of frames) {
      const line = f.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const e = JSON.parse(line.slice(6));
      const ms = Date.now() - t0;
      if (e.type === 'sources') {
        r.timings.sources_ms = ms;
        r.sq = e.query;
        r.rewritten = e.rewritten;
        r.stats = e.stats;
        r.confidence = e.confidence;
      } else if (e.type === 'chunk') {
        r.timings.first_chunk_ms ??= ms;
        r.answer += e.content;
      } else if (e.type === 'reset') {
        r.answer = '';
      } else if (e.type === 'done') {
        r.sources = e.sources.map((s) => ({
          n: s.n,
          kind: s.kind,
          id: s.kind === 'video' ? s.youtube_id : s.slug,
          title: s.title,
          at: s.kind === 'video' ? s.moments.map((m) => m.second) : undefined,
          published: s.published_at,
          cited: s.cited,
          cos: s.relevance_score,
        }));
        r.followups = e.followups;
        r.pros = e.pros ? `${e.pros.specialty.name}${e.pros.region ? ` / ${e.pros.region.name}` : ''}` : null;
        r.intent = e.intent;
        r.refused = e.refused;
        r.degraded = e.degraded;
        r.shareable = Boolean(e.share);
        if (e.share) r.answer = e.share.payload.answer;
      } else if (e.type === 'error') {
        r.error = e.message;
      }
    }
  }
  r.timings.total_ms = Date.now() - t0;
  return r;
}

const results = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
for (const c of CASES) {
  if (only && !only.includes(c.id)) continue;
  const body = { query: c.q, origin: 'typed' };
  if (c.focus) body.focus = c.focus;
  if (c.historyFrom) {
    const prev = results[c.historyFrom];
    if (prev?.answer) body.history = [{ q: prev.q, a: prev.answer.slice(0, 900), sq: prev.sq }];
  }
  const r = await ask(body);
  results[c.id] = { ...c, ...r };
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\n=== ${c.id} (${c.topic}) ${JSON.stringify(r.timings)} conf=${r.confidence?.level}/${r.confidence?.score} top=${r.confidence?.topSimilarity}${r.rewritten ? ` sq="${r.sq}"` : ''}${r.refused ? ` REFUSED=${r.refused}` : ''}`);
  console.log(`Q: ${c.q}`);
  for (const s of r.sources ?? []) console.log(`  [${s.n}] ${s.kind} ${s.id} cited=${s.cited} ${s.at ? `@${s.at.join(',')}` : ''} ${(s.published || '').slice(0, 7)} :: ${s.title}`);
  console.log(r.answer);
  console.log(`followups: ${JSON.stringify(r.followups)} | pros: ${r.pros} | cost-intent: ${r.intent?.cost}`);
}
