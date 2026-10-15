/**
 * The AI guards as wired into POST /api/answer/stream (lib/advisor/pipeline.ts):
 * rate-limited and over-budget requests degrade to a friendly Hebrew answer in
 * the normal SSE shape, real answers record their token usage (also when the
 * stream breaks), and nothing reaches the model when the library has nothing
 * close. No network: retrieval, the pros CTA and the model stream are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  tracked: [] as Array<{ name: string; props: Record<string, unknown> }>,
  rpc: vi.fn(),
  cos: 0.55,
}));

vi.mock('@/app/api/_lib/semantic', () => ({
  semanticSearch: vi.fn(async () => [
    { kind: 'post', slug: 'עלות-שלד', title: 'כמה עולה שלד', chunk_index: 0, text: 'כמה עולה שלד: בין 2,500 ל-3,500 ש"ח למ"ר', score: 1, cos: h.cos },
  ]),
}));
vi.mock('@/app/api/_lib/data', () => ({ getVideo: vi.fn(() => null) }));
vi.mock('@/app/api/_lib/pros', () => ({ matchPros: vi.fn(async () => null) }));
vi.mock('@/lib/advisor/posts-meta', () => ({ postsMeta: vi.fn(async () => new Map()) }));
vi.mock('@/lib/advisor/model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/advisor/model')>();
  return {
    ...real,
    streamAnswer: vi.fn(async (_input: unknown, onText: (d: string) => void) => {
      onText('שלד עולה ');
      onText('כ-3,000 ש"ח למ"ר [1].');
      onText('\n\n@@FOLLOWUPS@@\nאיך בוחרים קבלן שלד?');
      return { parts: [{ model: 'claude-sonnet-5-5', usage: { inputTokens: 4200, outputTokens: 350 } }], stopReason: 'end_turn', model: 'claude-sonnet-5-5' };
    }),
  };
});
vi.mock('@/lib/analytics/server', () => ({
  trackServer: vi.fn(async (name: string, props: Record<string, unknown>) => {
    h.tracked.push({ name, props });
  }),
}));
vi.mock('@/lib/platform/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/platform/db')>();
  return { ...real, isPlatformDbConfigured: () => true, platformAdminDb: () => ({ rpc: h.rpc }) };
});

import { POST } from '@/app/api/answer/stream/route';
import { matchPros } from '@/app/api/_lib/pros';
import { AnswerStreamError, streamAnswer } from '@/lib/advisor/model';
import { NO_ANSWER_MESSAGE } from '@/lib/advisor/pipeline';
import { AI_RATE_LIMITED_MESSAGE, AI_UNAVAILABLE_MESSAGE, resetAiBudgetCache } from '@/lib/guard/aiBudget';
import { resetRateLimitMemory } from '@/lib/guard/rateLimit';

let spend = 0;
const recorded: Array<Record<string, unknown>> = [];

function req(query = 'כמה עולה שלד?', ip = '203.0.113.50', referer = 'http://localhost:3103/search/') {
  return new NextRequest('http://localhost:3103/api/answer/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, referer },
    body: JSON.stringify({ query }),
  });
}

type Evt = { type: string; content?: string; sources?: unknown[]; degraded?: string; refused?: string; followups?: string[] };

async function sse(res: Response): Promise<Evt[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as Evt);
}

const byType = (events: Evt[], type: string) => events.filter((e) => e.type === type);

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LEAD_IP_SALT = 'test-salt';
  spend = 0;
  h.cos = 0.55;
  recorded.length = 0;
  h.tracked = [];
  resetAiBudgetCache();
  resetRateLimitMemory();
  vi.mocked(matchPros).mockClear();
  vi.mocked(streamAnswer).mockClear();
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'rate_limit_hit') return { data: [{ allowed: true, used: 1, remaining: 19, retry_after_seconds: 0 }], error: null };
    if (fn === 'ai_spend_for_day') return { data: spend, error: null };
    if (fn === 'record_ai_usage') {
      recorded.push(args);
      spend += Number(args.p_cost_usd);
      return { data: spend, error: null };
    }
    return { data: null, error: { message: fn } };
  });
});

afterEach(() => {
  delete process.env.AI_DAILY_BUDGET_USD;
  delete process.env.FLAG_AI_ANSWERS;
  delete process.env.RATE_LIMIT_AI_ANSWER;
});

describe('/api/answer/stream guards', () => {
  it('streams sources first, then the answer; records usage and tracks it', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const events = await sse(res);
    expect(events[0]).toMatchObject({ type: 'sources', sources: [{ kind: 'post', slug: 'עלות-שלד', n: 1 }] });
    // The follow-up trailer never reaches the visitor.
    expect(byType(events, 'chunk').map((e) => e.content).join('')).toBe('שלד עולה כ-3,000 ש"ח למ"ר [1].');
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      sources: [{ kind: 'post', slug: 'עלות-שלד', cited: true }],
      followups: ['איך בוחרים קבלן שלד?'],
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      p_route: 'answer_stream',
      p_model: 'claude-sonnet-5-5',
      p_input_tokens: 4200,
      p_output_tokens: 350,
      p_is_demo: false,
    });
    expect(Number(recorded[0].p_cost_usd)).toBeCloseTo(0.0119, 6); // 4,200 x $2 + 350 x $10 per MTok
    expect(h.tracked.map((t) => t.name)).toEqual(['answer_requested', 'answer_completed']);
    expect(h.tracked[1].props).toMatchObject({
      sources: 1,
      n_sources: 1,
      top_similarity: 0.55,
      model: 'claude-sonnet-5-5',
      output_tokens: 350,
      has_pros: false,
      cited: 1,
      followups: 1,
    });
    expect(matchPros).toHaveBeenCalledWith('כמה עולה שלד?', { isDemo: false, regionSlug: undefined });
  });

  it('marks usage from /platform pages as demo', async () => {
    await (await POST(req('x', '203.0.113.51', 'http://localhost:3103/platform/demo/advisor/'))).text();
    expect(recorded[0]).toMatchObject({ p_is_demo: true });
  });

  it('over budget: no model call, a friendly answer with the sources', async () => {
    spend = 2.99; // the answer's reservation would cross the $3 cap
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-bb-degraded')).toBe('budget');
    const events = await sse(res);
    expect(events.map((e) => e.type)).toEqual(['sources', 'chunk', 'done']);
    expect(events[1]).toEqual({ type: 'chunk', content: AI_UNAVAILABLE_MESSAGE });
    expect(events[2]).toMatchObject({ type: 'done', degraded: 'budget', pros: null, sources: [{ kind: 'post' }] });
    expect(streamAnswer).not.toHaveBeenCalled();
    expect(matchPros).not.toHaveBeenCalled();
    expect(recorded).toHaveLength(0);
  });

  it('kill switch (FLAG_AI_ANSWERS=false) degrades the same way', async () => {
    process.env.FLAG_AI_ANSWERS = 'false';
    const res = await POST(req());
    expect(res.headers.get('x-bb-degraded')).toBe('disabled');
    await res.text();
    expect(streamAnswer).not.toHaveBeenCalled();
  });

  it('rate-limited: a friendly answer before any retrieval or model call', async () => {
    process.env.RATE_LIMIT_AI_ANSWER = '1/600';
    await (await POST(req('q1', '203.0.113.60'))).text();
    vi.mocked(streamAnswer).mockClear();
    const res = await POST(req('q2', '203.0.113.60'));
    expect(res.headers.get('x-bb-degraded')).toBe('rate_limited');
    const events = await sse(res);
    expect(events[0]).toEqual({ type: 'chunk', content: AI_RATE_LIMITED_MESSAGE });
    expect(events[1]).toMatchObject({ type: 'done', sources: [], degraded: 'rate_limited' });
    expect(streamAnswer).not.toHaveBeenCalled();
    expect(h.tracked.filter((t) => t.name === 'answer_requested')).toHaveLength(2);
  });

  it('an interrupted stream still records what it used', async () => {
    vi.mocked(streamAnswer).mockImplementationOnce(async (_input, onText) => {
      onText('שלד עולה ');
      throw new AnswerStreamError(new Error('socket hang up'), [{ model: 'claude-sonnet-5-5', usage: { inputTokens: 4000, outputTokens: 20 } }]);
    });
    const events = await sse(await POST(req()));
    expect(events.at(-1)).toEqual({ type: 'error', message: 'stream interrupted' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ p_model: 'claude-sonnet-5-5', p_input_tokens: 4000, p_output_tokens: 20 });
    expect(h.tracked.map((t) => t.name)).toEqual(['answer_requested']);
  });

  it('nothing close in the library: an honest refusal without a model call, tracked as a content gap', async () => {
    h.cos = 0.12;
    const events = await sse(await POST(req('מי ניצח במונדיאל?')));
    expect(events.map((e) => e.type)).toEqual(['sources', 'chunk', 'done']);
    expect(events[0]).toMatchObject({ sources: [] });
    expect(events[1]).toEqual({ type: 'chunk', content: NO_ANSWER_MESSAGE });
    expect(events[2]).toMatchObject({ refused: 'low_confidence', sources: [] });
    expect(events[2].followups?.length).toBeGreaterThan(0);
    expect(streamAnswer).not.toHaveBeenCalled();
    expect(recorded).toHaveLength(0);
    expect(h.tracked[1]).toMatchObject({ name: 'answer_completed', props: { refused: 'low_confidence', n_sources: 0, model: 'none' } });
  });
});
