import 'server-only';

/**
 * Server-side dedupe for partner_impression: one per (visitor, slot) per 30
 * minutes, whatever the browser claims (impressions are billing-grade).
 * Checked against this instance's memory and, for returning visitors, the
 * visitor's recent impressions in platform_events. Fail-open: if the lookup
 * fails, memory alone decides.
 */
import { isPlatformDbConfigured, platformAdminDb, withTimeout } from '@/lib/platform/db';
import type { PlatformEventInsert } from '@/lib/platform/types';
import { VIEWABILITY } from './viewability';

const recent = new Map<string, number>(); // `${anonId}|${slot}` -> last counted (ms)
const MAX_KEYS = 20_000;

export type SeenSlotsLookup = (anonId: string, sinceIso: string) => Promise<Set<string>>;

/** Slots this visitor already has impressions for since `sinceIso`. */
export const dbSeenSlots: SeenSlotsLookup = async (anonId, sinceIso) => {
  const seen = new Set<string>();
  if (!isPlatformDbConfigured()) return seen;
  try {
    const { data, error } = await withTimeout(
      platformAdminDb()
        .from('platform_events')
        .select('props')
        .eq('name', 'partner_impression')
        .eq('anon_id', anonId)
        .gte('occurred_at', sinceIso)
        .limit(500),
      1500,
      'impression lookup',
    );
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const slot = (row.props as { slot?: unknown } | null)?.slot;
      if (typeof slot === 'string') seen.add(slot);
    }
  } catch (err) {
    console.error(`[analytics] impression dedupe lookup failed (memory only): ${err instanceof Error ? err.message : String(err)}`);
  }
  return seen;
};

/**
 * Drop partner_impression rows already counted for this visitor and slot in
 * the last 30 minutes (including duplicates inside the batch). Other rows
 * pass through untouched. `returning` = the visitor already had a cookie.
 */
export async function dedupeImpressions(
  rows: PlatformEventInsert[],
  opts: { anonId: string; returning: boolean; now?: number; lookup?: SeenSlotsLookup },
): Promise<PlatformEventInsert[]> {
  const isImpression = (r: PlatformEventInsert) => r.name === 'partner_impression';
  if (!rows.some(isImpression)) return rows;

  const now = opts.now ?? Date.now();
  const since = now - VIEWABILITY.dedupeMs;
  const seen = opts.returning ? await (opts.lookup ?? dbSeenSlots)(opts.anonId, new Date(since).toISOString()) : new Set<string>();

  const out: PlatformEventInsert[] = [];
  for (const row of rows) {
    if (!isImpression(row)) {
      out.push(row);
      continue;
    }
    const slot = (row.props as { slot?: unknown } | null)?.slot;
    if (typeof slot !== 'string') continue;
    const key = `${opts.anonId}|${slot}`;
    const last = recent.get(key);
    if (seen.has(slot) || (last !== undefined && last > since)) continue;
    seen.add(slot);
    recent.set(key, now);
    out.push(row);
  }
  if (recent.size > MAX_KEYS) {
    recent.forEach((t, k) => {
      if (t <= since) recent.delete(k);
    });
    if (recent.size > MAX_KEYS) recent.clear();
  }
  return out;
}

/** Test helper. */
export function resetImpressionDedupe(): void {
  recent.clear();
}
