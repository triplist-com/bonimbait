import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  configured: false,
  rpc: vi.fn(),
}));

vi.mock('@/lib/platform/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/platform/db')>();
  return {
    ...real,
    isPlatformDbConfigured: () => db.configured,
    platformAdminDb: () => ({ rpc: db.rpc }),
  };
});

import { RATE_LIMITS, rateLimit, resetRateLimitMemory, resolveRule, slidingWindowHit } from '@/lib/guard/rateLimit';

const RULE = { limit: 3, windowSec: 60 };
const T0 = Date.parse('2026-10-14T10:00:00Z'); // a window boundary

beforeEach(() => {
  resetRateLimitMemory();
  db.configured = false;
  db.rpc.mockReset();
});

describe('slidingWindowHit', () => {
  it('allows up to the limit, then refuses without counting the refusal', () => {
    let bucket;
    const verdicts = [];
    for (let i = 0; i < 5; i++) {
      const v = slidingWindowHit(bucket, RULE, 1, T0 + i * 1000);
      bucket = v.bucket;
      verdicts.push(v);
    }
    expect(verdicts.map((v) => v.allowed)).toEqual([true, true, true, false, false]);
    expect(verdicts.map((v) => v.remaining)).toEqual([2, 1, 0, 0, 0]);
    expect(bucket!.current).toBe(3); // refused hits were not counted
    // Refused because the current window is full: wait for it to end.
    expect(verdicts[3].retryAfterSec).toBe(57);
  });

  it('weights the previous window by how much of it still overlaps', () => {
    // 3 hits at the end of window 0.
    let b = slidingWindowHit(undefined, RULE, 3, T0 + 59_000).bucket;
    // 15s into window 1: 3 * 0.75 = 2.25 still counts, so one more fits (3.25 > 3 refuses the second).
    const first = slidingWindowHit(b, RULE, 1, T0 + 75_000);
    expect(first.allowed).toBe(false); // 2.25 + 1 > 3
    // 30s in: 3 * 0.5 = 1.5 -> one hit fits.
    const half = slidingWindowHit(b, RULE, 1, T0 + 90_000);
    expect(half.allowed).toBe(true);
    b = half.bucket;
    expect(slidingWindowHit(b, RULE, 1, T0 + 90_500).allowed).toBe(false); // 1.49 + 1 + 1 > 3
    // A window later than that, the old hits are gone entirely.
    expect(slidingWindowHit(b, RULE, 3, T0 + 180_000).allowed).toBe(true);
  });

  it('says when the previous window has decayed enough to retry', () => {
    const b = slidingWindowHit(undefined, RULE, 3, T0 + 59_000).bucket;
    const refused = slidingWindowHit(b, RULE, 1, T0 + 75_000);
    // Needs 3 * (1 - f) <= 2 -> f >= 1/3 -> 20s into the window; now is 15s in.
    expect(refused.retryAfterSec).toBe(5);
    expect(slidingWindowHit(b, RULE, 1, T0 + 80_000).allowed).toBe(true);
  });

  it('counts a cost greater than one', () => {
    const v = slidingWindowHit(undefined, RULE, 3, T0);
    expect(v.allowed).toBe(true);
    expect(slidingWindowHit(v.bucket, RULE, 1, T0).allowed).toBe(false);
    expect(slidingWindowHit(undefined, RULE, 4, T0).allowed).toBe(false);
  });
});

describe('rateLimit()', () => {
  it('limits per identifier in memory', async () => {
    const rule = { name: 'test', ...RULE };
    const a = [];
    for (let i = 0; i < 4; i++) a.push((await rateLimit(rule, 'ip-a', { now: T0 })).ok);
    expect(a).toEqual([true, true, true, false]);
    expect((await rateLimit(rule, 'ip-b', { now: T0 })).ok).toBe(true);
  });

  it('allows calls with no identifier (nothing to key on)', async () => {
    const res = await rateLimit('ai_answer', null);
    expect(res).toMatchObject({ ok: true, source: 'skipped' });
  });

  it('asks the DB when configured, and the DB has the final word', async () => {
    db.configured = true;
    db.rpc.mockResolvedValue({ data: [{ allowed: false, used: 20, remaining: 0, retry_after_seconds: 42 }], error: null });
    const res = await rateLimit('ai_answer', 'hash-1', { now: T0 });
    expect(res).toMatchObject({ ok: false, source: 'db', retryAfterSec: 42, limit: RATE_LIMITS.ai_answer.limit });
    expect(db.rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'ai_answer:hash-1',
      p_limit: 20,
      p_window_seconds: 600,
      p_cost: 1,
    });
  });

  it('skips the DB once memory already refuses (the fast path)', async () => {
    db.configured = true;
    db.rpc.mockResolvedValue({ data: [{ allowed: true, used: 1, remaining: 2, retry_after_seconds: 0 }], error: null });
    const rule = { name: 'fast', ...RULE };
    for (let i = 0; i < 3; i++) await rateLimit(rule, 'ip', { now: T0 });
    expect(db.rpc).toHaveBeenCalledTimes(3);
    const refused = await rateLimit(rule, 'ip', { now: T0 });
    expect(refused).toMatchObject({ ok: false, source: 'memory' });
    expect(db.rpc).toHaveBeenCalledTimes(3);
  });

  it('is fail-open on DB errors and timeouts: the memory verdict stands', async () => {
    db.configured = true;
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    expect(await rateLimit('form', 'ip-x', { now: T0 })).toMatchObject({ ok: true, source: 'memory' });
    db.rpc.mockRejectedValueOnce(new Error('network'));
    expect(await rateLimit('form', 'ip-x', { now: T0 })).toMatchObject({ ok: true, source: 'memory' });
  });

  it("store 'memory' never touches the DB", async () => {
    db.configured = true;
    await rateLimit('track', 'ip', { store: 'memory' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('reads RATE_LIMIT_<NAME> overrides', () => {
    expect(resolveRule('ai_answer', { RATE_LIMIT_AI_ANSWER: '60/300' })).toEqual({ limit: 60, windowSec: 300 });
    expect(resolveRule('ai_answer', { RATE_LIMIT_AI_ANSWER: 'lots' })).toEqual(RATE_LIMITS.ai_answer);
    expect(resolveRule('ai_answer', { RATE_LIMIT_AI_ANSWER: '0/60' })).toEqual(RATE_LIMITS.ai_answer);
  });
});
