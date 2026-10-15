import 'server-only';

/**
 * Standalone query for retrieval. The free heuristic decides
 * (lib/advisor/rewrite.ts); only an ambiguous follow-up costs a call to Claude
 * Haiku 5.5 (~$0.0001, thinking off, low effort, structured output). Any
 * failure, timeout, refusal or budget stop falls back to the heuristic
 * rewrite, so a follow-up always gets an answer.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { checkAiBudget, recordAiUsage } from '@/lib/guard/aiBudget';
import { usageFromAnthropic } from '@/lib/guard/aiPricing';
import { stripCitations } from './citations';
import { REWRITE_COST_ESTIMATE_USD, REWRITE_MODEL, REWRITE_TIMEOUT_MS } from './config';
import { acceptRewrite, heuristicStandalone, needsRewrite } from './rewrite';
import type { AdvisorHistoryTurn } from './types';

const SYSTEM = `You turn a follow-up question from a conversation about building a private home in Israel into one standalone Hebrew search query.
Keep every detail from the conversation that the follow-up depends on: sizes, regions, build stages, materials, years.
Don't answer the question. Return the query only, in natural Hebrew.`;

const Output = z.object({ query: z.string() });

export interface StandaloneQuery {
  query: string;
  rewritten: boolean;
  via: 'none' | 'model' | 'heuristic';
}

export async function standaloneQuery(
  query: string,
  history: readonly AdvisorHistoryTurn[],
  opts: { isDemo?: boolean } = {},
): Promise<StandaloneQuery> {
  if (!needsRewrite(query, history)) return { query, rewritten: false, via: 'none' };
  const heuristic: StandaloneQuery = { query: heuristicStandalone(query, history), rewritten: true, via: 'heuristic' };
  if (!process.env.ANTHROPIC_API_KEY) return heuristic;
  if (!(await checkAiBudget({ estimateUsd: REWRITE_COST_ESTIMATE_USD })).ok) return heuristic;

  const recent = history.slice(-2);
  const conversation = recent.map((t) => `שאלה: ${t.q}\nתשובה: ${stripCitations(t.a).slice(0, 400)}`).join('\n\n');
  try {
    const client = new Anthropic({ timeout: REWRITE_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.messages.parse({
      model: REWRITE_MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: zodOutputFormat(Output) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${conversation}\n\nשאלת המשך: ${query}` }],
    });
    await recordAiUsage({ route: 'advisor_rewrite', model: REWRITE_MODEL, usage: usageFromAnthropic(response.usage), isDemo: Boolean(opts.isDemo) });
    if (response.stop_reason === 'refusal') return heuristic;
    const accepted = acceptRewrite(response.parsed_output?.query);
    return accepted ? { query: accepted, rewritten: true, via: 'model' } : heuristic;
  } catch (err) {
    console.warn(`[advisor] follow-up rewrite fell back to the heuristic: ${err instanceof Error ? err.message : String(err)}`);
    return heuristic;
  }
}
