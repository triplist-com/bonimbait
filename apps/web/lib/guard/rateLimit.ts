import 'server-only';

/**
 * Sliding-window rate limits for AI routes and forms.
 *
 *   const rl = await rateLimit('ai_answer', hashIp(clientIpFromHeaders(request.headers)));
 *   if (!rl.ok) return friendlyRefusal(rl.retryAfterSec);
 *
 * Algorithm: "sliding window counter". Each key has fixed windows; the count
 * used is previous_window * (1 - elapsed_fraction) + current_window. A refused
 * call is not counted, so a blocked client recovers on schedule.
 *
 * Stores:
 *   - memory (per server instance): the fast path. If it already refuses, the
 *     DB is never asked.
 *   - DB (public.rate_limit_hit RPC, table rate_limits): authoritative across
 *     instances. Used by store 'auto' (the default) when the service role is
 *     configured.
 * Fail-open: if the DB is slow or down, the memory verdict stands, so a guard
 * outage never takes a route down with it.
 */
import { isPlatformDbConfigured, platformAdminDb, withTimeout } from '@/lib/platform/db';

export type RateLimitRule = { limit: number; windowSec: number };

/**
 * Named rules. Keys are `<rule>:<identifier>`, so rules never share buckets.
 * Override at deploy time with RATE_LIMIT_<NAME>=<limit>/<windowSec>
 * (e.g. RATE_LIMIT_AI_ANSWER=60/600 for an expo booth behind one IP).
 */
export const RATE_LIMITS = {
  /** POST /api/track batches per visitor IP (memory store: high volume, low stakes). */
  track: { limit: 120, windowSec: 60 },
  /** AI answers per visitor IP: generous for a person, a wall for a script. */
  ai_answer: { limit: 20, windowSec: 10 * 60 },
  /** Generic public form posts per visitor IP. */
  form: { limit: 10, windowSec: 10 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a retry can succeed (0 when ok). */
  retryAfterSec: number;
  /** Which store decided. 'skipped' = no identifier, nothing to limit on. */
  source: 'memory' | 'db' | 'skipped';
};

export type RateLimitOptions = {
  /** 'auto' (default): memory fast path + DB. 'memory': this instance only. */
  store?: 'auto' | 'memory';
  /** Hits to count (default 1). */
  cost?: number;
  now?: number;
};

// ---------------------------------------------------------------------------
// Window math (pure; mirrored by public.rate_limit_hit in SQL)
// ---------------------------------------------------------------------------

export type WindowBucket = { start: number; current: number; previous: number };

export type WindowVerdict = {
  allowed: boolean;
  used: number;
  remaining: number;
  retryAfterSec: number;
  bucket: WindowBucket;
};

/** Evaluate one hit against a bucket; returns the verdict and the updated bucket. */
export function slidingWindowHit(
  bucket: WindowBucket | undefined,
  rule: RateLimitRule,
  cost: number,
  now: number,
): WindowVerdict {
  const windowMs = rule.windowSec * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  let b: WindowBucket;
  if (!bucket) b = { start, current: 0, previous: 0 };
  else if (bucket.start === start) b = { ...bucket };
  else b = { start, current: 0, previous: bucket.start === start - windowMs ? bucket.current : 0 };

  const elapsed = now - start;
  const estimate = b.previous * (1 - elapsed / windowMs) + b.current;
  if (estimate + cost > rule.limit) {
    let waitMs: number;
    if (b.current + cost > rule.limit || b.previous === 0) {
      waitMs = windowMs - elapsed; // only the next window helps
    } else {
      // previous * (1 - f) <= limit - current - cost
      waitMs = (1 - (rule.limit - b.current - cost) / b.previous) * windowMs - elapsed;
    }
    return {
      allowed: false,
      used: Math.ceil(estimate),
      remaining: 0,
      // Round to whole ms first: (1 - 2/3) * 60000 is 20000.000000000004.
      retryAfterSec: Math.max(1, Math.ceil(Math.round(waitMs) / 1000)),
      bucket: b,
    };
  }
  b.current += cost;
  return {
    allowed: true,
    used: Math.ceil(estimate + cost),
    remaining: Math.max(0, Math.floor(rule.limit - estimate - cost)),
    retryAfterSec: 0,
    bucket: b,
  };
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const MEMORY_MAX_KEYS = 10_000;
const memory = new Map<string, WindowBucket>();

function memoryHit(key: string, rule: RateLimitRule, cost: number, now: number): WindowVerdict {
  const verdict = slidingWindowHit(memory.get(key), rule, cost, now);
  memory.set(key, verdict.bucket);
  if (memory.size > MEMORY_MAX_KEYS) {
    // Drop buckets that no longer influence any verdict, then hard-cap.
    memory.forEach((b, k) => {
      if (now - b.start > 2 * 86_400_000) memory.delete(k);
    });
    if (memory.size > MEMORY_MAX_KEYS) memory.clear();
  }
  return verdict;
}

/** Test helper: forget every in-memory bucket. */
export function resetRateLimitMemory(): void {
  memory.clear();
}

const DB_TIMEOUT_MS = 1500;

async function dbHit(key: string, rule: RateLimitRule, cost: number): Promise<WindowVerdict | null> {
  try {
    const { data, error } = await withTimeout(
      platformAdminDb().rpc('rate_limit_hit', {
        p_key: key,
        p_limit: rule.limit,
        p_window_seconds: rule.windowSec,
        p_cost: cost,
      }),
      DB_TIMEOUT_MS,
      'rate_limit_hit',
    );
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) {
      if (error) console.error(`[rateLimit] DB check failed (memory verdict stands): ${error.message}`);
      return null;
    }
    return {
      allowed: row.allowed,
      used: row.used,
      remaining: row.remaining,
      retryAfterSec: row.retry_after_seconds,
      bucket: { start: 0, current: 0, previous: 0 },
    };
  } catch (err) {
    console.error(`[rateLimit] DB check failed (memory verdict stands): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** The named rule, with an optional RATE_LIMIT_<NAME>=<limit>/<windowSec> override. */
export function resolveRule(name: RateLimitName, env: Record<string, string | undefined> = process.env): RateLimitRule {
  const raw = env[`RATE_LIMIT_${name.toUpperCase()}`];
  const m = raw?.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (m) {
    const limit = Number(m[1]);
    const windowSec = Number(m[2]);
    if (limit >= 1 && windowSec >= 1 && windowSec <= 86_400) return { limit, windowSec };
  }
  return RATE_LIMITS[name];
}

/**
 * Count a hit for `identifier` under a rule and say whether it is allowed.
 * `identifier` is usually an IP hash (lib/leads/spam.ts hashIp) or a user id.
 * Without one there is nothing to key on, so the call is allowed.
 */
export async function rateLimit(
  rule: RateLimitName | (RateLimitRule & { name: string }),
  identifier: string | null | undefined,
  opts: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const name = typeof rule === 'string' ? rule : rule.name;
  const resolved = typeof rule === 'string' ? resolveRule(rule) : rule;
  const cost = Math.max(1, Math.floor(opts.cost ?? 1));
  if (!identifier) {
    return { ok: true, limit: resolved.limit, remaining: resolved.limit, retryAfterSec: 0, source: 'skipped' };
  }
  const key = `${name}:${identifier}`.slice(0, 200);
  const now = opts.now ?? Date.now();

  const fast = memoryHit(key, resolved, cost, now);
  const result = (v: WindowVerdict, source: RateLimitResult['source']): RateLimitResult => ({
    ok: v.allowed,
    limit: resolved.limit,
    remaining: v.remaining,
    retryAfterSec: v.retryAfterSec,
    source,
  });
  if (!fast.allowed) return result(fast, 'memory');
  if ((opts.store ?? 'auto') === 'memory' || !isPlatformDbConfigured()) return result(fast, 'memory');

  const db = await dbHit(key, resolved, cost);
  return db ? result(db, 'db') : result(fast, 'memory');
}
