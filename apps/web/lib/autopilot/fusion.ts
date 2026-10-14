import 'server-only';

import { autopilotConfig } from './config';
import { serviceDb } from './db';
import { toVectorLiteral } from './embed';
import { rememberMatch } from './records';
import { YOUTUBE_ID_RE } from './rss';
import type { KnowledgeMatchRow } from './types';

/**
 * Runtime half of search (app/api/_lib/semantic.ts): chunks of PUBLISHED
 * knowledge sources nearest to the query embedding, as static-shaped video
 * segments that semantic.ts fuses into its RRF.
 *
 * Fail-open by design: no Supabase config, a slow store (hard cap ~800 ms) or
 * an error all yield [] and search continues on the static index alone. After
 * a failure the store is skipped for a short while (circuit breaker), so an
 * outage costs at most one timeout per instance per window.
 */

export interface RuntimeSegment {
  kind: 'video';
  youtube_id: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  text: string;
  /** Cosine similarity, same scale as the static index's. */
  cos: number;
}

type RpcArgs = { query_embedding: string; match_count: number; min_similarity: number };
type RpcResult = { data: KnowledgeMatchRow[] | null; error: { message: string } | null };
export type RuntimeRpc = (args: RpcArgs, signal: AbortSignal) => PromiseLike<RpcResult>;

export interface RuntimeSearchOptions {
  /** Static index rows: YouTube ids that have static segments win over runtime duplicates. */
  staticMeta?: ReadonlyArray<{ kind: string; youtube_id?: string }>;
  matchCount?: number;
  minSimilarity?: number;
  timeoutMs?: number;
  /** Test seam; defaults to public.match_knowledge_chunks via the service role. */
  rpc?: RuntimeRpc | null;
}

const DEFAULT_MATCH_COUNT = 30;
const DEFAULT_MIN_SIMILARITY = 0.2;
const BREAKER_MS = 30_000;
const BREAKER_MISSING_FN_MS = 5 * 60_000;
const LOG_EVERY_MS = 60_000;

let breakerUntil = 0;
let lastLogAt = 0;

/** Reset the circuit breaker (tests). */
export function resetRuntimeSearch(): void {
  breakerUntil = 0;
  lastLogAt = 0;
}

const staticIdCache = new WeakMap<object, Set<string>>();

function staticVideoIds(meta: ReadonlyArray<{ kind: string; youtube_id?: string }>): Set<string> {
  let ids = staticIdCache.get(meta);
  if (!ids) {
    ids = new Set();
    for (const m of meta) if (m.kind === 'video' && m.youtube_id) ids.add(m.youtube_id);
    staticIdCache.set(meta, ids);
  }
  return ids;
}

function defaultRpc(): RuntimeRpc | null {
  const db = serviceDb();
  if (!db) return null;
  return (args, signal) => db.rpc('match_knowledge_chunks', args).abortSignal(signal) as PromiseLike<RpcResult>;
}

function trip(err: unknown, now: number): void {
  const message = err instanceof Error ? err.message : String(err);
  const missing = /match_knowledge_chunks|does not exist|schema cache|PGRST202/i.test(message);
  breakerUntil = now + (missing ? BREAKER_MISSING_FN_MS : BREAKER_MS);
  if (now - lastLogAt > LOG_EVERY_MS) {
    lastLogAt = now;
    console.warn(`[autopilot] runtime search skipped (fail-open): ${message}`);
  }
}

export async function searchRuntimeSegments(qvec: Float32Array, opts: RuntimeSearchOptions = {}): Promise<RuntimeSegment[]> {
  const config = autopilotConfig();
  if (!config.searchEnabled) return [];
  const started = Date.now();
  if (started < breakerUntil) return [];
  const rpc = opts.rpc === undefined ? defaultRpc() : opts.rpc;
  if (!rpc) return [];

  const timeoutMs = opts.timeoutMs ?? config.searchTimeoutMs;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rows: KnowledgeMatchRow[];
  try {
    const result = await Promise.race([
      Promise.resolve(
        rpc(
          {
            query_embedding: toVectorLiteral(qvec),
            match_count: opts.matchCount ?? DEFAULT_MATCH_COUNT,
            min_similarity: opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY,
          },
          ctrl.signal,
        ),
      ),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          ctrl.abort();
          reject(new Error(`timed out after ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
    if (result.error) throw new Error(result.error.message);
    rows = result.data ?? [];
  } catch (err) {
    trip(err, Date.now());
    return [];
  } finally {
    clearTimeout(timer);
  }

  const exclude = opts.staticMeta ? staticVideoIds(opts.staticMeta) : new Set<string>();
  const out: RuntimeSegment[] = [];
  for (const r of rows) {
    if (r.kind !== 'youtube' || !YOUTUBE_ID_RE.test(r.external_id) || exclude.has(r.external_id)) continue;
    const cos = Number(r.similarity);
    if (!Number.isFinite(cos) || typeof r.text !== 'string') continue;
    rememberMatch(r);
    out.push({
      kind: 'video',
      youtube_id: r.external_id,
      segment_index: r.chunk_index,
      start_time: Number(r.start_s) || 0,
      end_time: Number(r.end_s) || 0,
      text: r.text,
      cos,
    });
  }
  return out;
}
