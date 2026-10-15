import 'server-only';

/**
 * The answer call: Claude Sonnet 5.5 streamed through the Anthropic SDK.
 *
 * - The frozen system prompt is cached (cache_control on its block; Sonnet
 *   5.5 caches prefixes from 512 tokens).
 * - Thinking is adaptive at `low` effort (config.ts): measured as fast to the
 *   first token as `between_tools`, Sonnet 5.5's lowest setting, with tighter
 *   answers. Effort is fixed per route.
 * - Server-side refusal fallback (`fallbacks: "default"`, beta, Claude API
 *   only): a Sonnet 5.5 decline is retried on Sonnet 5 inside the same stream.
 * - Usage is reported per model that ran (usage.iterations), so the AI budget
 *   bills a fallback at the fallback's rates. An interrupted stream still
 *   reports what it used so far.
 *
 * Tests mock this module (tests/guard/answer-stream-guards.test.ts).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { EMPTY_USAGE, accumulateStreamUsage, usageFromAnthropic, type TokenUsage } from '@/lib/guard/aiPricing';
import { ANSWER_EFFORT, ANSWER_FALLBACK_BETA, ANSWER_MAX_TOKENS, ANSWER_MODEL, ANSWER_THINKING } from './config';

export interface ModelUsagePart {
  model: string;
  usage: TokenUsage;
}

export interface AnswerOutcome {
  parts: ModelUsagePart[];
  stopReason: string | null;
  /** The model that produced the final message. */
  model: string;
}

export interface AnswerInput {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}

/** The stream failed; `parts` is what it had used (for the budget). */
export class AnswerStreamError extends Error {
  readonly parts: ModelUsagePart[];
  constructor(cause: unknown, parts: ModelUsagePart[]) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'AnswerStreamError';
    this.parts = parts;
  }
}

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  // ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL are read by the SDK.
  client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

/** Billed usage per model: usage.iterations when present (fallbacks), else the top level. */
export function usageParts(final: Pick<BetaMessage, 'model' | 'usage'>, requested = ANSWER_MODEL): ModelUsagePart[] {
  const iterations = final.usage?.iterations ?? [];
  const billable = iterations.filter((it) => it.type === 'message' || it.type === 'fallback_message');
  if (billable.length > 0) {
    return billable.map((it) => ({
      model: ('model' in it && it.model) || (it.type === 'message' ? requested : final.model) || requested,
      usage: usageFromAnthropic(it),
    }));
  }
  return [{ model: final.model || requested, usage: usageFromAnthropic(final.usage) }];
}

/** Stream the answer; `onText` gets each text delta. Resolves with usage and stop reason. */
export async function streamAnswer({ system, messages, signal }: AnswerInput, onText: (delta: string) => void): Promise<AnswerOutcome> {
  let usage: TokenUsage = { ...EMPTY_USAGE };
  let model: string = ANSWER_MODEL;
  try {
    const stream = anthropic().beta.messages.stream(
      {
        model: ANSWER_MODEL,
        max_tokens: ANSWER_MAX_TOKENS,
        betas: [ANSWER_FALLBACK_BETA],
        fallbacks: 'default',
        thinking: ANSWER_THINKING,
        output_config: { effort: ANSWER_EFFORT },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
      },
      { signal },
    );
    for await (const event of stream as AsyncIterable<BetaRawMessageStreamEvent>) {
      usage = accumulateStreamUsage(usage, event);
      if (event.type === 'message_start' && event.message.model) model = event.message.model;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
        onText(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    return { parts: usageParts(final), stopReason: final.stop_reason ?? null, model: final.model || model };
  } catch (err) {
    throw new AnswerStreamError(err, usage.inputTokens + usage.outputTokens > 0 ? [{ model, usage }] : []);
  }
}
