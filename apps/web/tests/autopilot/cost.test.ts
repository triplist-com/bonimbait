import { afterEach, describe, expect, it } from 'vitest';
import { budgetLimitsFromEnv, createBudgetGuard, decide } from '@/lib/autopilot/cost';
import {
  audioCostMicros,
  claudeCostMicros,
  embeddingCostMicros,
  formatUsd,
  microsToUsd,
  usdToMicros,
} from '@/lib/autopilot/pricing';

afterEach(() => {
  delete process.env.AUTOPILOT_MAX_USD_PER_VIDEO;
  delete process.env.AUTOPILOT_MONTHLY_BUDGET_USD;
});

describe('pricing (micro-USD)', () => {
  it('prices Claude Haiku 5.5 by prompt length', () => {
    // 10K in at $0.10/MTok + 2K out at $0.50/MTok = $0.001 + $0.001
    expect(claudeCostMicros('claude-haiku-5-5', { input_tokens: 10_000, output_tokens: 2_000 })).toBe(2_000);
    // Prompts over 100K tokens use the $0.50 / $2.50 card.
    expect(claudeCostMicros('claude-haiku-5-5', { input_tokens: 200_000, output_tokens: 1_000 })).toBe(102_500);
  });

  it('prices embeddings and audio', () => {
    expect(embeddingCostMicros(50_000)).toBe(1_000); // $0.02/MTok
    expect(audioCostMicros(600)).toBe(60_000); // 10 min at $0.006/min
  });

  it('converts and formats', () => {
    expect(usdToMicros(0.75)).toBe(750_000);
    expect(microsToUsd(2_500)).toBe(0.0025);
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(2_500)).toBe('$0.0025');
    expect(formatUsd(123_456)).toBe('$0.123');
  });
});

describe('budget guard', () => {
  const limits = { perVideoMicros: 100_000, monthlyMicros: 1_000_000 };

  it('allows spend within both caps', () => {
    expect(decide({ label: 'x', usdMicros: 10_000 }, 500_000, limits)).toEqual({ ok: true });
  });

  it('refuses a call above the per-video cap', () => {
    const d = decide({ label: 'x', usdMicros: 150_000 }, 0, limits);
    expect(d.ok).toBe(false);
  });

  it('refuses when the rolling 30-day budget would be exceeded', () => {
    const d = decide({ label: 'x', usdMicros: 50_000 }, 990_000, limits);
    expect(d).toMatchObject({ ok: false });
    expect(!d.ok && d.reason).toContain('החודשי');
  });

  it('fails closed when the ledger cannot be read', async () => {
    const guard = createBudgetGuard(async () => {
      throw new Error('db down');
    }, limits);
    expect((await guard.check({ label: 'x', usdMicros: 1 })).ok).toBe(false);
  });

  it('reads caps from the environment', () => {
    process.env.AUTOPILOT_MAX_USD_PER_VIDEO = '0.05';
    process.env.AUTOPILOT_MONTHLY_BUDGET_USD = '1';
    expect(budgetLimitsFromEnv()).toEqual({ perVideoMicros: 50_000, monthlyMicros: 1_000_000 });
  });
});
