/**
 * AI model prices and cost math (pure; safe anywhere, e.g. a dashboard).
 *
 * USD per million tokens, Anthropic first-party API rates from the claude-api
 * skill's model table (cached 2026-10-06), plus OpenAI text-embedding-3-small.
 * Cache writes use the 5-minute TTL rate (1.25x input); 1-hour writes cost 2x
 * input. Update this map when a route switches models: an unknown model is
 * priced at the most expensive rate so the budget never under-counts.
 */

export type ModelPricing = {
  input: number;
  output: number;
  /** 5-minute-TTL cache write. */
  cacheWrite: number;
  cacheRead: number;
  /** Prompts above `aboveInputTokens` bill every rate x `multiplier`. */
  longContext?: { aboveInputTokens: number; multiplier: number };
};

const claude = (input: number, output: number, cacheRead: number): ModelPricing => ({
  input,
  output,
  cacheWrite: input * 1.25,
  cacheRead,
});

export const AI_MODEL_PRICING = {
  'claude-fable-5-1': claude(10, 50, 0.25),
  'claude-opus-5-5': claude(4, 20, 0.2),
  'claude-opus-5': claude(5, 25, 0.5),
  'claude-sonnet-5-5': claude(2, 10, 0.2),
  'claude-sonnet-5': claude(2, 10, 0.2),
  'claude-sonnet-4-6': claude(3, 15, 0.3), // POST /api/answer/stream
  'claude-haiku-5-5': { ...claude(0.1, 0.5, 0.01), longContext: { aboveInputTokens: 100_000, multiplier: 5 } },
  'claude-haiku-4-5': claude(1, 5, 0.1), // pros classifier (app/api/_lib/pros.ts)
  'text-embedding-3-small': { input: 0.02, output: 0, cacheWrite: 0.02, cacheRead: 0.02 }, // query + index embeddings
} as const satisfies Record<string, ModelPricing>;

export type PricedModel = keyof typeof AI_MODEL_PRICING;

/** Unknown models are priced like the most expensive one. */
export const FALLBACK_PRICING: ModelPricing = AI_MODEL_PRICING['claude-fable-5-1'];

export type TokenUsage = {
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  /** 5-minute-TTL cache writes. */
  cacheWriteTokens?: number;
  /** 1-hour-TTL cache writes. */
  cacheWrite1hTokens?: number;
};

export const EMPTY_USAGE: TokenUsage = Object.freeze({ inputTokens: 0, outputTokens: 0 }) as TokenUsage;

/** Exact id, else without a date suffix / provider prefix ('anthropic.claude-haiku-4-5-20251001'). */
export function pricingFor(model: string): { pricing: ModelPricing; known: boolean } {
  const table = AI_MODEL_PRICING as Record<string, ModelPricing>;
  const bare = model.replace(/^(?:(?:us|eu|apac|global)\.)?(?:anthropic\.)?/, '').replace(/[-@]\d{8}$/, '');
  const candidates = [model, bare];
  for (const id of candidates) if (table[id]) return { pricing: table[id], known: true };
  return { pricing: FALLBACK_PRICING, known: false };
}

const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Estimated cost in USD, rounded to 6 decimals (the ai_usage.cost_usd scale). */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const { pricing: p } = pricingFor(model);
  const input = n(usage.inputTokens);
  const output = n(usage.outputTokens);
  const read = n(usage.cacheReadTokens);
  const write = n(usage.cacheWriteTokens);
  const write1h = n(usage.cacheWrite1hTokens);
  const prompt = input + read + write + write1h;
  const m = p.longContext && prompt > p.longContext.aboveInputTokens ? p.longContext.multiplier : 1;
  // tokens x USD-per-million-tokens = micro-USD; round to whole micro-USD.
  const microUsd = (input * p.input + output * p.output + read * p.cacheRead + write * p.cacheWrite + write1h * p.input * 2) * m;
  return Math.round(microUsd) / 1e6;
}

/** Shape shared by Anthropic `Message.usage`, `message_start` and `message_delta` usage. */
export type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
};

/** Anthropic usage -> TokenUsage (splits 1-hour cache writes when reported). */
export function usageFromAnthropic(u: AnthropicUsageLike | null | undefined): TokenUsage {
  if (!u) return { ...EMPTY_USAGE };
  const write1h = n(u.cache_creation?.ephemeral_1h_input_tokens);
  const writeTotal = n(u.cache_creation_input_tokens);
  return {
    inputTokens: n(u.input_tokens),
    outputTokens: n(u.output_tokens),
    cacheReadTokens: n(u.cache_read_input_tokens),
    cacheWriteTokens: Math.max(0, writeTotal - write1h),
    cacheWrite1hTokens: write1h,
  };
}

/**
 * Fold one parsed Messages SSE event into a running usage total:
 * `message_start` carries message.usage (input + cache counts), and
 * `message_delta` carries cumulative usage (output_tokens, sometimes input).
 */
export function accumulateStreamUsage(acc: TokenUsage, evt: unknown): TokenUsage {
  if (!evt || typeof evt !== 'object') return acc;
  const e = evt as { type?: string; message?: { usage?: AnthropicUsageLike }; usage?: AnthropicUsageLike };
  const u = e.type === 'message_start' ? e.message?.usage : e.type === 'message_delta' ? e.usage : undefined;
  if (!u) return acc;
  const next = usageFromAnthropic(u);
  // Counts are cumulative within one message, so keep the larger of each.
  return {
    inputTokens: Math.max(acc.inputTokens, next.inputTokens),
    outputTokens: Math.max(acc.outputTokens, next.outputTokens),
    cacheReadTokens: Math.max(acc.cacheReadTokens ?? 0, next.cacheReadTokens ?? 0),
    cacheWriteTokens: Math.max(acc.cacheWriteTokens ?? 0, next.cacheWriteTokens ?? 0),
    cacheWrite1hTokens: Math.max(acc.cacheWrite1hTokens ?? 0, next.cacheWrite1hTokens ?? 0),
  };
}
