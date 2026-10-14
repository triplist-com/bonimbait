import 'server-only';

import { EMBED_MAX_CHARS } from './chunk';
import { EMBEDDING_MODEL, embeddingCostMicros } from './pricing';
import type { UsageEntry } from './types';

/**
 * Chunk embeddings with the static index's model and input cap
 * (scripts/build_search_index.py: text-embedding-3-small, 8000 chars), so
 * runtime and static cosine scores are on the same scale.
 */

const BATCH = 100;

export interface EmbedResult {
  vectors: number[][];
  /** Tokens per input, apportioned from the batch total by length (the API reports totals only). */
  tokens: number[];
  usage: UsageEntry;
}

export interface EmbedOptions {
  fetchFn?: typeof fetch;
  /** Per-batch request timeout. */
  timeoutMs?: number;
}

async function embedBatch(batch: string[], key: string, opts: EmbedOptions) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await (opts.fetchFn ?? fetch)('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: batch, model: EMBEDDING_MODEL }),
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    data: Array<{ index: number; embedding: number[] }>;
    usage?: { total_tokens?: number; prompt_tokens?: number };
  };
  const ordered = [...data.data].sort((a, b) => a.index - b.index);
  if (ordered.length !== batch.length) throw new Error('OpenAI embeddings: result count mismatch');
  return { vectors: ordered.map((d) => d.embedding), tokens: data.usage?.total_tokens ?? data.usage?.prompt_tokens ?? 0 };
}

export async function embedTexts(texts: string[], opts: EmbedOptions = {}): Promise<EmbedResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const inputs = texts.map((t) => t.slice(0, EMBED_MAX_CHARS));
  const vectors: number[][] = [];
  const tokens: number[] = [];
  let totalTokens = 0;
  const usage = (): UsageEntry => ({
    step: 'embed',
    model: EMBEDDING_MODEL,
    input_tokens: totalTokens,
    usd_micros: embeddingCostMicros(totalTokens),
    at: new Date().toISOString(),
  });

  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH);
    let result: Awaited<ReturnType<typeof embedBatch>>;
    try {
      result = await embedBatch(batch, key, opts);
    } catch (err) {
      // Earlier batches were billed: report them with the failure (pipeline.usageOf).
      if (totalTokens === 0) throw err;
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { usage: usage() });
    }
    vectors.push(...result.vectors);
    totalTokens += result.tokens;
    const chars = batch.reduce((n, t) => n + t.length, 0) || 1;
    tokens.push(...batch.map((t) => Math.round((result.tokens * t.length) / chars)));
  }

  return { vectors, tokens, usage: usage() };
}

/** pgvector text literal. */
export function toVectorLiteral(v: ArrayLike<number>): string {
  return `[${Array.prototype.join.call(v, ',')}]`;
}
