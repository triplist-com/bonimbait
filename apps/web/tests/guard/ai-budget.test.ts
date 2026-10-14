import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  configured: true,
  spend: 0,
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

import {
  AI_UNAVAILABLE_MESSAGE,
  AiBudgetExceededError,
  DEFAULT_AI_DAILY_BUDGET_USD,
  assertAiBudget,
  checkAiBudget,
  dailyBudgetUsd,
  evaluateBudget,
  getAiSpendToday,
  recordAiUsage,
  resetAiBudgetCache,
  utcDay,
} from '@/lib/guard/aiBudget';
import {
  AI_MODEL_PRICING,
  FALLBACK_PRICING,
  accumulateStreamUsage,
  estimateCostUsd,
  pricingFor,
  usageFromAnthropic,
  type TokenUsage,
} from '@/lib/guard/aiPricing';

const M = 1_000_000;
const NOW = Date.parse('2026-10-14T21:30:00Z');

function fakeDb() {
  db.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'ai_spend_for_day') return { data: db.spend, error: null };
    if (fn === 'record_ai_usage') {
      db.spend += Number(args.p_cost_usd);
      return { data: db.spend, error: null };
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  });
}

beforeEach(() => {
  resetAiBudgetCache();
  db.configured = true;
  db.spend = 0;
  db.rpc.mockReset();
  fakeDb();
});

afterEach(() => {
  delete process.env.AI_DAILY_BUDGET_USD;
  delete process.env.FLAG_AI_ANSWERS;
});

describe('pricing', () => {
  it('prices the models in use per million tokens', () => {
    expect(estimateCostUsd('claude-sonnet-4-6', { inputTokens: M, outputTokens: 0 })).toBe(3);
    expect(estimateCostUsd('claude-sonnet-4-6', { inputTokens: 0, outputTokens: M })).toBe(15);
    expect(estimateCostUsd('claude-haiku-4-5', { inputTokens: M, outputTokens: M })).toBe(6);
    expect(estimateCostUsd('text-embedding-3-small', { inputTokens: M, outputTokens: 0 })).toBe(0.02);
    expect(estimateCostUsd('claude-opus-5-5', { inputTokens: M, outputTokens: M })).toBe(24);
  });

  it('prices cache reads and 5-minute / 1-hour cache writes', () => {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: M, cacheWriteTokens: M, cacheWrite1hTokens: M };
    // Sonnet 4.6: read 0.30, 5m write 3.75 (1.25x), 1h write 6 (2x).
    expect(estimateCostUsd('claude-sonnet-4-6', usage)).toBeCloseTo(0.3 + 3.75 + 6, 6);
    expect(AI_MODEL_PRICING['claude-opus-5-5'].cacheRead).toBe(0.2);
  });

  it('prices a typical answer and classifier call in cents', () => {
    const answer = estimateCostUsd('claude-sonnet-4-6', { inputTokens: 4200, outputTokens: 350 });
    expect(answer).toBeCloseTo(0.01785, 6);
    const classifier = estimateCostUsd('claude-haiku-4-5', { inputTokens: 1500, outputTokens: 40 });
    expect(classifier).toBeCloseTo(0.0017, 6);
  });

  it('applies the long-context rate above 100K prompt tokens (Haiku 5.5)', () => {
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 100_000, outputTokens: 0 })).toBeCloseTo(0.01, 6);
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 100_001, outputTokens: 0 })).toBeCloseTo(0.0500005, 6);
  });

  it('resolves dated / provider-prefixed ids and over-prices unknown models', () => {
    expect(pricingFor('claude-haiku-4-5-20251001')).toEqual({ pricing: AI_MODEL_PRICING['claude-haiku-4-5'], known: true });
    expect(pricingFor('us.anthropic.claude-sonnet-4-6').known).toBe(true);
    expect(pricingFor('mystery-model-9')).toEqual({ pricing: FALLBACK_PRICING, known: false });
    expect(estimateCostUsd('mystery-model-9', { inputTokens: M, outputTokens: 0 })).toBe(FALLBACK_PRICING.input);
  });

  it('ignores negative and non-finite counts', () => {
    expect(estimateCostUsd('claude-sonnet-4-6', { inputTokens: -5, outputTokens: Number.NaN })).toBe(0);
  });
});

describe('usage parsing', () => {
  it('maps Message.usage, splitting 1-hour cache writes', () => {
    expect(
      usageFromAnthropic({
        input_tokens: 120,
        output_tokens: 40,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 500,
        cache_creation: { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 200 },
      }),
    ).toEqual({ inputTokens: 120, outputTokens: 40, cacheReadTokens: 1000, cacheWriteTokens: 300, cacheWrite1hTokens: 200 });
    expect(usageFromAnthropic(null)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('folds a raw SSE stream: message_start input, cumulative message_delta output', () => {
    const events = [
      { type: 'message_start', message: { usage: { input_tokens: 4200, output_tokens: 1, cache_read_input_tokens: 0 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'שלום' } },
      { type: 'message_delta', delta: { stop_reason: null }, usage: { output_tokens: 150 } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 350 } },
      { type: 'message_stop' },
      'not an object',
    ];
    const usage = events.reduce<TokenUsage>((acc, e) => accumulateStreamUsage(acc, e), { inputTokens: 0, outputTokens: 0 });
    expect(usage).toMatchObject({ inputTokens: 4200, outputTokens: 350 });
  });
});

describe('budget math', () => {
  it('defaults to $3/day and reads AI_DAILY_BUDGET_USD', () => {
    expect(DEFAULT_AI_DAILY_BUDGET_USD).toBe(3);
    expect(dailyBudgetUsd({})).toBe(3);
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: '5.5' })).toBe(5.5);
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: '0' })).toBe(0);
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: 'lots' })).toBe(3);
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: '-1' })).toBe(3);
  });

  it('refuses at the cap and when the estimate would cross it', () => {
    expect(evaluateBudget(0, 3)).toEqual({ ok: true, remainingUsd: 3 });
    expect(evaluateBudget(2.98, 3, 0.03)).toEqual({ ok: false, remainingUsd: 0.02 });
    expect(evaluateBudget(2.97, 3, 0.03)).toMatchObject({ ok: true });
    expect(evaluateBudget(3, 3)).toEqual({ ok: false, remainingUsd: 0 });
    expect(evaluateBudget(3.2, 3)).toEqual({ ok: false, remainingUsd: 0 });
    expect(evaluateBudget(0, 0)).toMatchObject({ ok: false });
  });

  it('uses the UTC day', () => {
    expect(utcDay(Date.parse('2026-10-14T23:30:00+03:00'))).toBe('2026-10-14');
    expect(utcDay(Date.parse('2026-10-15T01:30:00+03:00'))).toBe('2026-10-14');
  });
});

describe('checkAiBudget / recordAiUsage', () => {
  it('reads today from ai_usage and refuses with a friendly Hebrew message when over', async () => {
    db.spend = 1.2;
    expect(await checkAiBudget({ now: NOW })).toMatchObject({ ok: true, spentUsd: 1.2, budgetUsd: 3, remainingUsd: 1.8 });
    expect(db.rpc).toHaveBeenCalledWith('ai_spend_for_day', { p_day: '2026-10-14' });

    resetAiBudgetCache();
    db.spend = 3.01;
    const over = await checkAiBudget({ now: NOW });
    expect(over).toMatchObject({ ok: false, reason: 'budget', message: AI_UNAVAILABLE_MESSAGE });
    expect(over.message).toMatch(/[א-ת]/);
  });

  it('caches the day total for 15s', async () => {
    await getAiSpendToday(NOW);
    await getAiSpendToday(NOW + 5_000);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    await getAiSpendToday(NOW + 16_000);
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });

  it('records usage with its cost and refreshes the total', async () => {
    const res = await recordAiUsage({
      route: 'answer_stream',
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 4200, outputTokens: 350 },
      isDemo: true,
      now: NOW,
    });
    expect(res.costUsd).toBeCloseTo(0.01785, 6);
    expect(res.spentTodayUsd).toBeCloseTo(0.01785, 6);
    expect(db.rpc).toHaveBeenCalledWith('record_ai_usage', {
      p_route: 'answer_stream',
      p_model: 'claude-sonnet-4-6',
      p_input_tokens: 4200,
      p_output_tokens: 350,
      p_cache_read_tokens: 0,
      p_cache_write_tokens: 0,
      p_cost_usd: res.costUsd,
      p_is_demo: true,
      p_day: '2026-10-14',
    });
  });

  it('keeps capping this instance when the DB is unreachable', async () => {
    process.env.AI_DAILY_BUDGET_USD = '0.05';
    db.rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    expect((await checkAiBudget({ now: NOW })).ok).toBe(true);
    for (let i = 0; i < 3; i++) {
      await recordAiUsage({ route: 'answer_stream', model: 'claude-sonnet-4-6', usage: { inputTokens: 4200, outputTokens: 350 }, now: NOW });
    }
    const status = await checkAiBudget({ now: NOW + 20_000 });
    expect(status).toMatchObject({ ok: false, reason: 'budget' });
    expect(status.spentUsd).toBeCloseTo(0.05355, 6);
  });

  it('works without a DB at all (local dev), counting in memory', async () => {
    db.configured = false;
    process.env.AI_DAILY_BUDGET_USD = '0.02';
    await recordAiUsage({ route: 'x', model: 'claude-sonnet-4-6', usage: { inputTokens: 4200, outputTokens: 350 }, now: NOW });
    expect((await checkAiBudget({ now: NOW, estimateUsd: 0.01 })).ok).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('honours the kill switch and a $0 budget', async () => {
    process.env.FLAG_AI_ANSWERS = 'off';
    expect(await checkAiBudget()).toMatchObject({ ok: false, reason: 'disabled', message: AI_UNAVAILABLE_MESSAGE });
    delete process.env.FLAG_AI_ANSWERS;
    process.env.AI_DAILY_BUDGET_USD = '0';
    expect(await checkAiBudget()).toMatchObject({ ok: false, reason: 'disabled' });
  });

  it('assertAiBudget throws a typed error carrying the user message', async () => {
    db.spend = 10;
    await expect(assertAiBudget({ now: NOW })).rejects.toBeInstanceOf(AiBudgetExceededError);
    resetAiBudgetCache();
    try {
      await assertAiBudget({ now: NOW });
    } catch (err) {
      expect((err as AiBudgetExceededError).userMessage).toBe(AI_UNAVAILABLE_MESSAGE);
      expect((err as AiBudgetExceededError).status.reason).toBe('budget');
    }
  });
});
