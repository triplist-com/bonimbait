/**
 * Content Autopilot settings (env). Server-side; read at call time so tests
 * and runtime config changes take effect without a module reload.
 */

/** The "בונים בית" YouTube channel. */
export const DEFAULT_CHANNEL_ID = 'UCCehs0A1gUmOUtZIhvkXVJQ';

/**
 * Time budget of one request that processes sources. The routes export
 * maxDuration = 60 s; steps size their timeouts to finish (and record spend)
 * before the platform kills the function.
 */
export const FUNCTION_BUDGET_MS = 52_000;
/** Indexing (embeddings + Claude summary) is started only with this much time left. */
export const INDEX_MIN_MS = 30_000;
/** The cron starts another source only with this much time left. */
export const SOURCE_MIN_MS = 40_000;

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const v = Number(process.env[name]);
  return Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function autopilotConfig() {
  return {
    channelId: process.env.YOUTUBE_CHANNEL_ID || DEFAULT_CHANNEL_ID,
    /** Optional podcast RSS feed to watch alongside YouTube. */
    podcastRssUrl: process.env.PODCAST_RSS_URL || null,
    /** Cron also processes new sources (never publishes). Default off. */
    autoProcess: process.env.AUTOPILOT_AUTO_PROCESS === 'true',
    /** How many new sources one cron run may process. */
    autoProcessLimit: intEnv('AUTOPILOT_AUTO_PROCESS_LIMIT', 1, 1, 5),
    /** Search fusion kill switch (AUTOPILOT_SEARCH=off). */
    searchEnabled: process.env.AUTOPILOT_SEARCH !== 'off',
    /** Hard cap for the runtime store query inside search. */
    searchTimeoutMs: intEnv('AUTOPILOT_SEARCH_TIMEOUT_MS', 800, 50, 5000),
  };
}

export type AutopilotConfig = ReturnType<typeof autopilotConfig>;
