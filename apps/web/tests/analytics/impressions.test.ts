import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dedupeImpressions, resetImpressionDedupe } from '@/lib/analytics/impressions';
import type { PlatformEventInsert } from '@/lib/platform/types';

const ANON = '0b6b1a52-5d1e-4c3a-9f4e-2a7d8c9e0f11';
const T0 = Date.parse('2026-10-14T10:00:00Z');
const impression = (slot: string): PlatformEventInsert => ({ name: 'partner_impression', props: { slot, partner_id: 'p-1' } });
const view: PlatformEventInsert = { name: 'page_view', props: {} };
const noneSeen = vi.fn(async () => new Set<string>());

beforeEach(() => {
  resetImpressionDedupe();
  noneSeen.mockClear();
});

describe('dedupeImpressions (server, per visitor + slot, 30 min)', () => {
  it('passes batches without impressions through untouched, without a lookup', async () => {
    const rows = [view, view];
    expect(await dedupeImpressions(rows, { anonId: ANON, returning: true, lookup: noneSeen })).toBe(rows);
    expect(noneSeen).not.toHaveBeenCalled();
  });

  it('keeps one impression per slot inside a batch', async () => {
    const out = await dedupeImpressions([impression('a'), view, impression('a'), impression('b')], {
      anonId: ANON,
      returning: false,
      now: T0,
      lookup: noneSeen,
    });
    expect(out.map((r) => `${r.name}:${(r.props as { slot?: string }).slot ?? ''}`)).toEqual([
      'partner_impression:a',
      'page_view:',
      'partner_impression:b',
    ]);
    expect(noneSeen).not.toHaveBeenCalled(); // brand-new visitor: nothing to look up
  });

  it('drops a repeat within 30 minutes and allows it after', async () => {
    const opts = { anonId: ANON, returning: true, lookup: noneSeen };
    expect(await dedupeImpressions([impression('a')], { ...opts, now: T0 })).toHaveLength(1);
    expect(await dedupeImpressions([impression('a')], { ...opts, now: T0 + 29 * 60_000 })).toHaveLength(0);
    expect(await dedupeImpressions([impression('a')], { ...opts, now: T0 + 31 * 60_000 })).toHaveLength(1);
  });

  it('respects impressions another server instance already stored', async () => {
    const lookup = vi.fn(async (anonId: string, sinceIso: string) => {
      expect(anonId).toBe(ANON);
      expect(sinceIso).toBe(new Date(T0 - 30 * 60_000).toISOString());
      return new Set(['a']);
    });
    const out = await dedupeImpressions([impression('a'), impression('b')], { anonId: ANON, returning: true, now: T0, lookup });
    expect(out.map((r) => (r.props as { slot: string }).slot)).toEqual(['b']);
  });

  it('is per visitor', async () => {
    await dedupeImpressions([impression('a')], { anonId: ANON, returning: true, now: T0, lookup: noneSeen });
    const other = await dedupeImpressions([impression('a')], {
      anonId: '11111111-2222-4333-8444-555555555555',
      returning: true,
      now: T0,
      lookup: noneSeen,
    });
    expect(other).toHaveLength(1);
  });

  it('drops impressions without a slot', async () => {
    const out = await dedupeImpressions([{ name: 'partner_impression', props: {} }], { anonId: ANON, returning: false, lookup: noneSeen });
    expect(out).toHaveLength(0);
  });
});
