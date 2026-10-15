import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { SUMMARY_MODEL, claudeCostMicros, estimateTokens } from './pricing';
import { videoCategories } from './records';
import { STAGES, normalizeSummary } from './summary';
import { formatClock, timestampedText } from './transcript';
import type { Cue, SourceSummary, UsageEntry } from './types';

/**
 * Hebrew structured summary of a transcript with Claude Haiku 5.5: the
 * cheapest current model, and adequate for extraction into a fixed schema.
 * Structured outputs (output_config.format) guarantee schema-valid JSON;
 * normalizeSummary() then clamps timestamps and tidies lists.
 */

/** Output budget: thinking + the JSON (~1-2K tokens). Billed only for what is generated. */
export const SUMMARY_MAX_TOKENS = 16_000;
const EFFORT = 'medium' as const;

function systemPrompt(categories: ReadonlyArray<{ slug: string; name_he: string }>): string {
  return `You write the page for a video from "בונים בית", an Israeli YouTube channel for people building their own private home. You get the video's title and its automatic Hebrew captions with [m:ss] time markers.

Write every text field in natural Israeli Hebrew, the way the channel talks to its viewers. Use only what the video says: never invent prices, rules or facts. Automatic captions mishear words, so correct obvious recognition errors in what you write, and leave out anything you cannot make sense of.

- summary: 2-4 sentences on what the video covers and what a builder should take from it.
- key_points: 3-8 concrete takeaways, in the order the video covers them. start_s is the second (from the markers) where each one is discussed.
- costs: every price or cost the video states as a number, with the price as said, its unit and a short context. Leave out items whose price isn't said. Empty when there are none.
- tips and warnings: practical advice, and mistakes or risks to avoid. Empty when there are none.
- chapters: the video's parts in order with short titles (2-6 words). The first starts at 0. Use about one chapter per 1-2 minutes, at least 2.
- category_slug: the best fit among: ${categories.map((c) => `${c.slug} (${c.name_he})`).join(', ')}.
- stage: the build stage the video is about: ${STAGES.map((s) => `${s.value} (${s.label})`).join(', ')}; "none" if it is not about one stage.
- suggested_questions: 3 short questions this video answers, phrased the way a builder would type them into a search box.`;
}

function outputSchema(categorySlugs: readonly string[]) {
  return z.object({
    summary: z.string(),
    key_points: z.array(z.object({ text: z.string(), start_s: z.number() })),
    costs: z.array(z.object({ item: z.string(), price: z.string(), unit: z.string(), context: z.string() })),
    tips: z.array(z.string()),
    warnings: z.array(z.string()),
    chapters: z.array(z.object({ title: z.string(), start_s: z.number() })),
    category_slug: z.enum(categorySlugs as [string, ...string[]]),
    stage: z.enum([...STAGES.map((s) => s.value), 'none'] as unknown as [string, ...string[]]),
    suggested_questions: z.array(z.string()),
  });
}

export interface SummaryInput {
  title: string;
  durationS: number | null;
  cues: readonly Cue[];
}

export function buildUserPrompt(input: SummaryInput): string {
  const duration = input.durationS ? `\nאורך: ${formatClock(input.durationS)}` : '';
  return `כותרת: ${input.title}${duration}\n\nתמליל:\n${timestampedText(input.cues)}`;
}

/** Upper bound for the call, for the budget guard (input estimate + the full output budget). */
export function estimateSummaryMicros(input: SummaryInput): number {
  const categories = videoCategories();
  const inputTokens = estimateTokens(systemPrompt(categories)) + estimateTokens(buildUserPrompt(input)) + 600; // + schema
  return claudeCostMicros(SUMMARY_MODEL, { input_tokens: inputTokens, output_tokens: SUMMARY_MAX_TOKENS });
}

export class SummaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SummaryError';
  }
}

export interface SummaryResult {
  summary: SourceSummary;
  usage: UsageEntry;
}

export interface SummarizeOptions {
  client?: Anthropic;
  /** Request timeout; the pipeline passes what is left of the function's time budget. */
  timeoutMs?: number;
  /** SDK retries for transient errors (each retry gets the full timeout again). */
  maxRetries?: number;
}

export async function summarizeTranscript(input: SummaryInput, opts: SummarizeOptions = {}): Promise<SummaryResult> {
  if (!opts.client && !process.env.ANTHROPIC_API_KEY) throw new SummaryError('ANTHROPIC_API_KEY is not set');
  const categories = videoCategories();
  const slugs = categories.map((c) => c.slug);
  const client = opts.client ?? new Anthropic({ timeout: opts.timeoutMs ?? 45_000, maxRetries: opts.maxRetries ?? 0 });

  const response = await client.messages.parse({
    model: SUMMARY_MODEL,
    max_tokens: SUMMARY_MAX_TOKENS,
    output_config: { effort: EFFORT, format: zodOutputFormat(outputSchema(slugs)) },
    system: systemPrompt(categories),
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  });

  const usageEntry: UsageEntry = {
    step: 'summarize',
    model: SUMMARY_MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    thinking_tokens: response.usage.output_tokens_details?.thinking_tokens ?? undefined,
    usd_micros: claudeCostMicros(SUMMARY_MODEL, response.usage),
    at: new Date().toISOString(),
  };

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new SummaryError('Claude declined to summarise this transcript'), { usage: usageEntry });
  }
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw Object.assign(new SummaryError(`Summary output was incomplete (${response.stop_reason})`), { usage: usageEntry });
  }

  const normalized = normalizeSummary(response.parsed_output, { durationS: input.durationS, categorySlugs: slugs });
  if (!normalized.summary) throw Object.assign(new SummaryError('Claude returned an empty summary'), { usage: usageEntry });
  return {
    summary: { ...normalized, model: SUMMARY_MODEL, generated_at: new Date().toISOString(), edited_at: null },
    usage: usageEntry,
  };
}

/** Usage attached to a failed call (it was still billed). */
export function usageOf(err: unknown): UsageEntry | null {
  const u = (err as { usage?: UsageEntry } | null)?.usage;
  return u && typeof u.usd_micros === 'number' ? u : null;
}
