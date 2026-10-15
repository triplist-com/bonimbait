/**
 * Advisor settings: models, context budget and limits. Server-side.
 *
 * Models (claude-api skill, 2026-10): Claude Sonnet 5.5 writes the answer
 * ($2 / $10 per MTok, cache reads $0.20; ~$0.012-0.02 per answer measured,
 * docs/platform/ADVISOR_EVAL.md). Claude Haiku 5.5 rewrites ambiguous
 * follow-ups ($0.10 / $0.50). Both are priced in lib/guard/aiPricing.ts.
 */

export const ANSWER_MODEL = 'claude-sonnet-5-5';
export const REWRITE_MODEL = 'claude-haiku-5-5';

/**
 * Sonnet 5.5 can't disable thinking. Measured on the demo question
 * (docs/platform/ADVISOR_EVAL.md): adaptive thinking at `low` effort skips or
 * keeps thinking short, with the same time to first token as `between_tools`
 * (~0.9-1.5 s after the sources) and a tighter answer, so it's the setting.
 * Effort stays fixed per route so the prompt cache holds.
 */
export const ANSWER_THINKING = { type: 'adaptive' } as const;
export const ANSWER_EFFORT = 'low' as const;
/** Room for the answer (80-180 Hebrew words), any short thinking, and the follow-up trailer. */
export const ANSWER_MAX_TOKENS = 1600;
/** Refusal fallback (Claude API only): Sonnet 5.5 declines retried on Sonnet 5. */
export const ANSWER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Reserved against the daily AI budget before an answer (worst case incl. max output). */
export const ANSWER_COST_ESTIMATE_USD = 0.035;
export const REWRITE_COST_ESTIMATE_USD = 0.001;
export const REWRITE_TIMEOUT_MS = 2500;

/**
 * Documents fed to the model and shown as source cards: up to 3 articles
 * (knowledge's blind eval: 2 articles instead of 3 lowered answer quality,
 * 5.37 -> 4.90) and the rest video moments, so a cost question gets both the
 * articles and the podcast moments. The character budget below bounds the cost.
 */
export const MAX_SOURCES = 6;
export const MAX_POST_SOURCES = 3;
export const MAX_PASSAGES_PER_VIDEO = 2;
export const MAX_PASSAGES_PER_POST = 2;
export const POST_PASSAGE_CHARS = 900;
/** Total characters of source passages in one prompt (~4.5K tokens of Hebrew). */
export const CONTEXT_CHAR_BUDGET = 6500;
/** Candidates pulled from hybrid search before grouping by document. */
export const SEARCH_TOP_K = 120;

/** Conversation memory sent with a follow-up. */
export const MAX_HISTORY_TURNS = 4;
export const HISTORY_ANSWER_CHARS = 900;
export const MAX_QUERY_CHARS = 300;

/** How long `done` waits for the pros match after the answer ends. */
export const PROS_WAIT_MS = 4000;
