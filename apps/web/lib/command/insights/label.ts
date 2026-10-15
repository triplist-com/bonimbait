import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { estimateCostUsd, usageFromAnthropic, type TokenUsage } from '@/lib/guard/aiPricing';
import type { ReviewVerdict } from './coverage';

/**
 * Hebrew labels for question clusters: a topic name, a suggested video title
 * in the owner's voice, and a coverage verdict read off the nearest existing
 * titles. Claude Haiku 5.5 is the cheapest current model and adequate for
 * short structured Hebrew (it writes the autopilot summaries too); structured
 * outputs guarantee the shape. Clusters go in parallel calls of LABEL_CHUNK.
 *
 * Measured on 77 questions / 29 topics (2026-10-15, local): with adaptive
 * thinking, ~6K output tokens and $0.0039, and the verdicts matched their
 * reasons (3 real gaps). With thinking disabled, $0.0027 and half the time,
 * but verdicts drifted from their own reasons ("not about wood houses" marked
 * partial) and no gaps were found. So thinking stays on (effort low) and the
 * reason comes before the verdict in the schema.
 */
export const LABEL_MODEL = 'claude-haiku-5-5';
export const LABEL_MAX_TOKENS = 8_000;
/** Clusters per label call; calls run in parallel, so a 50-topic run takes about one call's time. */
export const LABEL_CHUNK = 13;
const EFFORT = 'low' as const;

export type LabelCluster = {
  id: number;
  questions: { q: string; asks: number }[];
  nearest: { kind: 'video' | 'post'; title: string }[];
};

export type ClusterLabel = { label: string; videoTitle: string; verdict: ReviewVerdict; reason: string };

export type LabelResult = { labels: Map<number, ClusterLabel>; usage: TokenUsage; model: string };

export const LABEL_SYSTEM_PROMPT = `You help the owner of "בונים בית", an Israeli YouTube channel and website for families building their own private home, decide which videos to film next. You get clusters of questions that builders typed into the site's search box, each with up to three titles of the owner's existing videos and articles that the search found closest to them.

For every cluster return:
- label: the topic in 2-5 natural Hebrew words, the way a builder would name it (for example "רצפה צפה" or "מרתף במגרש משופע").
- video_title: a title for a new video on the channel that answers these questions. Natural Israeli Hebrew in the channel's voice: practical, from the field, warm and direct. At most 70 characters. No hype words, no clickbait, no emoji, and never the word "AI". When the questions are about prices, the title may promise the 2026 numbers.
- reason: one short Hebrew sentence (at most 12 words) on whether the listed content answers these questions. Write it before deciding the coverage.
- coverage, consistent with the reason: "answered" when a listed title clearly answers these questions; "partial" when a listed title is about this same topic but misses what they ask (an introduction when they ask about prices); "missing" when no listed title is about this specific topic, even if one is about a broader subject (a general basement video for a sloped-plot basement, a regular-house cost article for a wooden house). Judge only by the titles listed. With no titles listed, answer "missing".

Keep each cluster's id and return every cluster exactly once.`;

const outputSchema = z.object({
  topics: z.array(
    z.object({
      id: z.number().int(),
      label: z.string(),
      video_title: z.string(),
      reason: z.string(),
      coverage: z.enum(['answered', 'partial', 'missing']),
    }),
  ),
});

export function buildLabelPrompt(clusters: readonly LabelCluster[]): string {
  return clusters
    .map((c) => {
      const qs = c.questions.map((q) => `- ${q.q} (${q.asks})`).join('\n');
      const near = c.nearest.length
        ? c.nearest.map((n) => `- ${n.kind === 'video' ? 'סרטון' : 'מאמר'}: ${n.title}`).join('\n')
        : '- אין';
      return `אשכול ${c.id}\nשאלות (כמה פעמים נשאלו):\n${qs}\nהתוכן הקרוב ביותר:\n${near}`;
    })
    .join('\n\n');
}

/** Upper bound for the budget guard: one token per character in, the full output budget out. */
export function estimateLabelUsd(clusters: readonly LabelCluster[]): number {
  const inputTokens = LABEL_SYSTEM_PROMPT.length + buildLabelPrompt(clusters).length + 400;
  return estimateCostUsd(LABEL_MODEL, { inputTokens, outputTokens: LABEL_MAX_TOKENS });
}

function tidy(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').replace(/^["'״׳]+|["'״׳]+$/g, '').trim().slice(0, max);
}

export class LabelError extends Error {
  readonly usage: TokenUsage | null;
  constructor(message: string, usage: TokenUsage | null = null) {
    super(message);
    this.name = 'LabelError';
    this.usage = usage;
  }
}

export async function labelClusters(
  clusters: readonly LabelCluster[],
  opts: { client?: Anthropic; timeoutMs?: number } = {},
): Promise<LabelResult> {
  if (clusters.length === 0) return { labels: new Map(), usage: { inputTokens: 0, outputTokens: 0 }, model: LABEL_MODEL };
  if (!opts.client && !process.env.ANTHROPIC_API_KEY) throw new LabelError('ANTHROPIC_API_KEY is not set');
  const client = opts.client ?? new Anthropic({ timeout: opts.timeoutMs ?? 30_000, maxRetries: 0 });

  const response = await client.messages.parse({
    model: LABEL_MODEL,
    max_tokens: LABEL_MAX_TOKENS,
    output_config: { effort: EFFORT, format: zodOutputFormat(outputSchema) },
    system: LABEL_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildLabelPrompt(clusters) }],
  });
  const usage = usageFromAnthropic(response.usage);
  if (response.stop_reason === 'refusal') throw new LabelError('Claude declined to label the clusters', usage);
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new LabelError(`Label output was incomplete (${response.stop_reason})`, usage);
  }

  const known = new Set(clusters.map((c) => c.id));
  const labels = new Map<number, ClusterLabel>();
  for (const t of response.parsed_output.topics) {
    if (!known.has(t.id) || labels.has(t.id)) continue;
    const label = tidy(t.label, 60);
    if (!label) continue;
    labels.set(t.id, { label, videoTitle: tidy(t.video_title, 90), verdict: t.coverage, reason: tidy(t.reason, 120) });
  }
  return { labels, usage, model: response.model || LABEL_MODEL };
}
