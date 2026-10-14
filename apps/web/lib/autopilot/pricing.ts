/**
 * Paid-API prices for Content Autopilot, in USD, and cost math in micro-USD
 * (integers, like money elsewhere in the app). Client-safe.
 *
 * Sources: Anthropic model table (claude-api skill, cached 2026-10-06) and
 * OpenAI's published prices for text-embedding-3-small and whisper-1.
 */

/** Cheapest adequate model for structured Hebrew summaries (see docs/platform/AUTOPILOT.md). */
export const SUMMARY_MODEL = 'claude-haiku-5-5';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const AUDIO_MODEL = 'whisper-1';

interface ClaudePrice {
  /** USD per million tokens for prompts up to `longPromptTokens`. */
  input: number;
  output: number;
  /** Claude Haiku 5.5 bills prompts above 100K tokens at a second rate card. */
  longPromptTokens?: number;
  longInput?: number;
  longOutput?: number;
}

export const CLAUDE_PRICES: Readonly<Record<string, ClaudePrice>> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, longPromptTokens: 100_000, longInput: 0.5, longOutput: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};

/** USD per million input tokens. */
export const EMBEDDING_PRICE_PER_MTOK = 0.02;
/** USD per audio minute (whisper-1). */
export const AUDIO_PRICE_PER_MINUTE = 0.006;

const MICROS = 1_000_000;

export function usdToMicros(usd: number): number {
  return Math.ceil(usd * MICROS);
}

export function microsToUsd(micros: number): number {
  return micros / MICROS;
}

/** Thinking tokens are billed as output tokens and are already included in output_tokens. */
export function claudeCostMicros(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  const p = CLAUDE_PRICES[model] ?? CLAUDE_PRICES['claude-sonnet-5-5'];
  const long = p.longPromptTokens !== undefined && usage.input_tokens > p.longPromptTokens;
  const inRate = long ? (p.longInput ?? p.input) : p.input;
  const outRate = long ? (p.longOutput ?? p.output) : p.output;
  // Rates are USD per MTok, so tokens * rate is micro-USD.
  return Math.ceil(usage.input_tokens * inRate + usage.output_tokens * outRate);
}

export function embeddingCostMicros(tokens: number): number {
  return Math.ceil(tokens * EMBEDDING_PRICE_PER_MTOK);
}

export function audioCostMicros(seconds: number): number {
  return Math.ceil((seconds / 60) * AUDIO_PRICE_PER_MINUTE * MICROS);
}

/**
 * Conservative token estimate for Hebrew text before a call: about two
 * characters per token (measured ~2.4-3 on this channel's captions).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

export function formatUsd(micros: number): string {
  const usd = microsToUsd(micros);
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}
