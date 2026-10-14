/**
 * The AI guards as wired into POST /api/answer/stream: rate-limited and
 * over-budget requests degrade to a friendly Hebrew answer in the normal SSE
 * shape (the UI renders it as-is), and real answers record their token usage.
 * No network: retrieval, the pros CTA and the Anthropic stream are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  tracked: [] as Array<{ name: string; props: Record<string, unknown> }>,
  rpc: vi.fn(),
}));

vi.mock('@/app/api/_lib/semantic', () => ({
  semanticSearch: vi.fn(async () => [
    { kind: 'post', slug: 'עלות-שלד', title: 'כמה עולה שלד', chunk_index: 0, text: 'כמה עולה שלד: בין 2,500 ל-3,500 ש"ח למ"ר', score: 1, cos: 0.55 },
  ]),
}));
vi.mock('@/app/api/_lib/data', () => ({ getVideo: vi.fn(() => undefined) }));
vi.mock('@/app/api/_lib/pros', () => ({ matchPros: vi.fn(async () => null) }));
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
import { AI_RATE_LIMITED_MESSAGE, AI_UNAVAILABLE_MESSAGE, resetAiBudgetCache } from '@/lib/guard/aiBudget';
import { resetRateLimitMemory } from '@/lib/guard/rateLimit';

let spend = 0;
const recorded: Array<Record<string, unknown>> = [];

function anthropicStream(): Response {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 4200, output_tokens: 1 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'שלד עולה ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'כ-3,000 ש"ח למ"ר.' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 350 } },
    { type: 'message_stop' },
  ];
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function req(query = 'כמה עולה שלד?', ip = '203.0.113.50', referer = 'http://localhost:3103/search/') {
  return new NextRequest('http://localhost:3103/api/answer/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, referer },
    body: JSON.stringify({ query }),
  });
}

async function sse(res: Response) {
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as { type: string; content?: string; sources?: unknown[]; degraded?: string });
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LEAD_IP_SALT = 'test-salt';
  spend = 0;
  recorded.length = 0;
  h.tracked = [];
  resetAiBudgetCache();
  resetRateLimitMemory();
  vi.mocked(matchPros).mockClear();
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
  vi.stubGlobal('fetch', vi.fn(async () => anthropicStream()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_DAILY_BUDGET_USD;
  delete process.env.FLAG_AI_ANSWERS;
  delete process.env.RATE_LIMIT_AI_ANSWER;
});

describe('/api/answer/stream guards', () => {
  it('streams a normal answer, records its usage and tracks it', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const events = await sse(res);
    expect(events.filter((e) => e.type === 'chunk').map((e) => e.content).join('')).toBe('שלד עולה כ-3,000 ש"ח למ"ר.');
    expect(events.at(-1)).toMatchObject({ type: 'done', sources: [{ kind: 'post', slug: 'עלות-שלד' }] });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      p_route: 'answer_stream',
      p_model: 'claude-sonnet-4-6',
      p_input_tokens: 4200,
      p_output_tokens: 350,
      p_is_demo: false,
    });
    expect(Number(recorded[0].p_cost_usd)).toBeCloseTo(0.01785, 6);
    expect(h.tracked.map((t) => t.name)).toEqual(['answer_requested', 'answer_completed']);
    expect(h.tracked[1].props).toMatchObject({ sources: 1, model: 'claude-sonnet-4-6', output_tokens: 350, has_pros: false });
    expect(matchPros).toHaveBeenCalledWith('כמה עולה שלד?', { isDemo: false });
  });

  it('marks usage from /platform pages as demo', async () => {
    await (await POST(req('x', '203.0.113.51', 'http://localhost:3103/platform/demo/advisor/'))).text();
    expect(recorded[0]).toMatchObject({ p_is_demo: true });
  });

  it('over budget: no model call, a friendly answer with the sources', async () => {
    spend = 2.99; // the $0.03 reservation would cross the $3 cap
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-bb-degraded')).toBe('budget');
    const events = await sse(res);
    expect(events[0]).toEqual({ type: 'chunk', content: AI_UNAVAILABLE_MESSAGE });
    expect(events[1]).toMatchObject({ type: 'done', degraded: 'budget', pros: null, sources: [{ kind: 'post' }] });
    expect(fetch).not.toHaveBeenCalled();
    expect(matchPros).not.toHaveBeenCalled();
    expect(recorded).toHaveLength(0);
  });

  it('kill switch (FLAG_AI_ANSWERS=false) degrades the same way', async () => {
    process.env.FLAG_AI_ANSWERS = 'false';
    const res = await POST(req());
    expect(res.headers.get('x-bb-degraded')).toBe('disabled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rate-limited: a friendly answer before any retrieval or model call', async () => {
    process.env.RATE_LIMIT_AI_ANSWER = '1/600';
    await (await POST(req('q1', '203.0.113.60'))).text();
    vi.mocked(fetch).mockClear();
    const res = await POST(req('q2', '203.0.113.60'));
    expect(res.headers.get('x-bb-degraded')).toBe('rate_limited');
    const events = await sse(res);
    expect(events[0]).toEqual({ type: 'chunk', content: AI_RATE_LIMITED_MESSAGE });
    expect(events[1]).toMatchObject({ type: 'done', sources: [], degraded: 'rate_limited' });
    expect(fetch).not.toHaveBeenCalled();
    expect(h.tracked.filter((t) => t.name === 'answer_requested')).toHaveLength(2);
  });
});
