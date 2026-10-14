import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedTexts } from '@/lib/autopilot/embed';

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

function ok(n: number, tokens: number) {
  return new Response(
    JSON.stringify({ data: Array.from({ length: n }, (_v, i) => ({ index: i, embedding: [i, 1] })), usage: { total_tokens: tokens } }),
  );
}

describe('embedTexts', () => {
  it('batches by 100, apportions tokens and prices the total', async () => {
    process.env.OPENAI_API_KEY = 'test';
    const fetchFn = vi.fn().mockResolvedValueOnce(ok(100, 1000)).mockResolvedValueOnce(ok(1, 10)) as unknown as typeof fetch;
    const res = await embedTexts(Array.from({ length: 101 }, () => 'אבג'), { fetchFn });
    expect(res.vectors).toHaveLength(101);
    expect(res.tokens.slice(0, 2)).toEqual([10, 10]);
    expect(res.usage).toMatchObject({ step: 'embed', input_tokens: 1010, usd_micros: 21 });
  });

  it('reports batches that were billed before a later batch failed', async () => {
    process.env.OPENAI_API_KEY = 'test';
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(ok(100, 50_000))
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    const err = await embedTexts(Array.from({ length: 150 }, () => 'x'), { fetchFn }).catch((e) => e);
    expect(err.message).toContain('429');
    expect(err.usage).toMatchObject({ input_tokens: 50_000, usd_micros: 1000 });
  });

  it('throws without usage when nothing was billed', async () => {
    process.env.OPENAI_API_KEY = 'test';
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('bad', { status: 400 })) as unknown as typeof fetch;
    const err = await embedTexts(['x'], { fetchFn }).catch((e) => e);
    expect(err.usage).toBeUndefined();
  });
});
