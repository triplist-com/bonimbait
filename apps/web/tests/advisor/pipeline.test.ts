/**
 * Advisor pipeline paths beyond the guards (tests/guard/answer-stream-guards.test.ts):
 * the model's out-of-scope flag, follow-up history in the prompt, and the focused
 * search query. Retrieval, the model and analytics are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ tracked: [] as Array<{ name: string; props: Record<string, unknown> }>, rpc: vi.fn() }));

vi.mock('@/app/api/_lib/semantic', () => ({
  semanticSearch: vi.fn(async () => [
    { kind: 'post', slug: 'shakshuka', title: 'יבוא אישי', chunk_index: 0, text: 'טקסט כלשהו', score: 1, cos: 0.49 },
  ]),
}));
vi.mock('@/app/api/_lib/data', () => ({ getVideo: vi.fn(() => null) }));
vi.mock('@/app/api/_lib/pros', () => ({ matchPros: vi.fn(async () => null) }));
vi.mock('@/lib/advisor/posts-meta', () => ({ postsMeta: vi.fn(async () => new Map()) }));
vi.mock('@/lib/advisor/model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/advisor/model')>();
  return { ...real, streamAnswer: vi.fn() };
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
import { streamAnswer } from '@/lib/advisor/model';
import { searchQueryFor } from '@/lib/advisor/retrieve';
import { resetAiBudgetCache } from '@/lib/guard/aiBudget';
import { resetRateLimitMemory } from '@/lib/guard/rateLimit';

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3111/api/answer/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.90', referer: 'http://localhost:3111/ask/' },
    body: JSON.stringify(body),
  });
}

async function events(res: Response) {
  return (await res.text())
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LEAD_IP_SALT = 'test-salt';
  h.tracked = [];
  resetAiBudgetCache();
  resetRateLimitMemory();
  vi.mocked(streamAnswer).mockReset();
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'rate_limit_hit') return { data: [{ allowed: true, used: 1, remaining: 19, retry_after_seconds: 0 }], error: null };
    if (fn === 'ai_spend_for_day') return { data: 0, error: null };
    if (fn === 'record_ai_usage') return { data: 0.01, error: null };
    return { data: null, error: { message: fn } };
  });
});

describe('advisor pipeline', () => {
  it('an out-of-scope answer drops the sources and is tracked as refused', async () => {
    vi.mocked(streamAnswer).mockImplementation(async (_input, onText) => {
      onText('אני עונה על שאלות על בניית בית פרטי.\n\n@@FOLLOWUPS@@\nOUT_OF_SCOPE\nכמה עולה שלד?');
      return { parts: [{ model: 'claude-sonnet-5-5', usage: { inputTokens: 3000, outputTokens: 60 } }], stopReason: 'end_turn', model: 'claude-sonnet-5-5' };
    });
    const evts = await events(await POST(req({ query: 'מה המתכון הכי טוב לשקשוקה?' })));
    const done = evts.find((e) => e.type === 'done')!;
    expect(done).toMatchObject({ refused: 'out_of_scope', sources: [], followups: ['כמה עולה שלד?'], pros: null });
    expect(done.share).toBeUndefined();
    const completed = h.tracked.find((t) => t.name === 'answer_completed');
    expect(completed?.props).toMatchObject({ refused: 'out_of_scope', n_sources: 0, model: 'claude-sonnet-5-5' });
  });

  it('sends the follow-up history to the model, without old citations', async () => {
    vi.mocked(streamAnswer).mockImplementation(async (_input, onText) => {
      onText('תשובה [1].');
      return { parts: [], stopReason: 'end_turn', model: 'claude-sonnet-5-5' };
    });
    await (
      await POST(
        req({
          query: 'איך בוחרים קבלן שלד בבית פרטי?',
          history: [{ q: 'כמה עולה שלד?', a: 'כ-800,000 ₪ [1][2].', sq: 'כמה עולה שלד?' }],
          conversation_id: '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d',
        }),
      )
    ).text();
    const input = vi.mocked(streamAnswer).mock.calls[0][0];
    expect(input.messages.slice(0, 2)).toEqual([
      { role: 'user', content: 'כמה עולה שלד?' },
      { role: 'assistant', content: 'כ-800,000 ₪.' },
    ]);
    expect(input.messages[2].content).toContain('השאלה: איך בוחרים קבלן שלד בבית פרטי?');
  });
});

describe('searchQueryFor', () => {
  it('adds the focused video title to the search', () => {
    const lookup = (id: string) => (id === 'vluNH7GTkU4' ? ({ title: 'פודקאסט פרק 109 - עלויות בניה' } as never) : null);
    expect(searchQueryFor('מה הנקודות החשובות?', { kind: 'video', id: 'vluNH7GTkU4' }, lookup)).toBe('מה הנקודות החשובות? פודקאסט פרק 109 - עלויות בניה');
    expect(searchQueryFor('שאלה', { kind: 'post', id: 'x' }, lookup)).toBe('שאלה');
    expect(searchQueryFor('שאלה', undefined, lookup)).toBe('שאלה');
  });
});
