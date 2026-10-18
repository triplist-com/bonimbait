import { describe, expect, it } from 'vitest';
import { MATCH_WEIGHTS, rankPros } from '@/lib/directory/match';
import { applyListing, parseFilters } from '@/lib/directory/listing';
import type { DirectoryEntry } from '@/lib/db/businesses';
import type { BusinessReviewStatsRow } from '@/lib/db/types';
import { TIER_MATCH_BOOST, orderWithinRelevance, tierScoreBoost } from '@/lib/revenue/tiers';

describe('orderWithinRelevance', () => {
  const items = [
    { id: 'a', rel: 1, tier: 3, order: 1 },
    { id: 'b', rel: 0, tier: 0, order: 2 },
    { id: 'c', rel: 0, tier: 2, order: 3 },
    { id: 'd', rel: 0, tier: 2, order: 0 },
    { id: 'e', rel: 1, tier: 0, order: 0 },
  ];

  it('never lifts a paying business above a more relevant one', () => {
    const out = orderWithinRelevance(items, { relevance: (i) => i.rel, tierRank: (i) => i.tier, tiebreak: (a, b) => a.order - b.order });
    expect(out.map((i) => i.id)).toEqual(['d', 'c', 'b', 'a', 'e']);
  });

  it('keeps the caller order on full ties and does not mutate the input', () => {
    const flat = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    expect(orderWithinRelevance(flat, { tierRank: () => 0, tiebreak: () => 0 }).map((i) => i.id)).toEqual(['x', 'y', 'z']);
    expect(items[0].id).toBe('a');
  });

  it('boosts by rank', () => {
    expect([0, 1, 2, 3].map(tierScoreBoost)).toEqual([0, TIER_MATCH_BOOST, 2 * TIER_MATCH_BOOST, 3 * TIER_MATCH_BOOST]);
    expect(tierScoreBoost(null)).toBe(0);
    expect(tierScoreBoost(-4)).toBe(0);
  });
});

describe('/recommended/ ordering with partner tiers', () => {
  const entry = (id: string, name: string, over: Partial<DirectoryEntry> = {}): DirectoryEntry => ({
    id,
    slug: id,
    name,
    tagline: null,
    description_html: null,
    logo_url: null,
    cover_image_url: null,
    city: null,
    primary_specialty_id: null,
    is_featured: false,
    sort_order: 10,
    owner_member_id: null,
    specialtyIds: [],
    regionIds: [],
    ...over,
  });
  const entries = [
    entry('a', 'אלומיניום הצפון', { sort_order: 1 }),
    entry('b', 'חלונות הדר', { sort_order: 2, description_html: '<p>אלומיניום</p>' }),
    entry('c', 'אלומיניום השרון', { sort_order: 3 }),
    entry('d', 'בטון ובלוקים', { sort_order: 4, is_featured: true }),
  ];
  const stats = new Map<string, BusinessReviewStatsRow>([
    ['a', { business_id: 'a', review_count: 5, rating_avg: 9, rating_percent: 90, score_value_avg: null, score_availability_avg: null, score_attitude_avg: null, score_reasoning_avg: null } as unknown as BusinessReviewStatsRow],
    ['c', { business_id: 'c', review_count: 5, rating_avg: 9, rating_percent: 90 } as unknown as BusinessReviewStatsRow],
  ]);
  const ctx = (tierRanks?: Map<string, number>) => ({ specialties: [], regions: [], stats, tierRanks });

  it('keeps the live order without tiers', () => {
    expect(applyListing(entries, parseFilters({}), ctx()).items.map((b) => b.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('puts partners first in the default order, highest tier first', () => {
    const out = applyListing(entries, parseFilters({}), ctx(new Map([['c', 2], ['b', 1]])));
    expect(out.items.map((b) => b.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('orders a search by relevance first (name matches), tiers inside each bucket', () => {
    const out = applyListing(entries, parseFilters({ q: 'אלומיניום' }), ctx(new Map([['b', 3], ['c', 1]])));
    // a, c match by name; b only by description, so its higher tier can't lift it above them.
    expect(out.items.map((b) => b.id)).toEqual(['c', 'a', 'b']);
  });

  it('uses tiers only as a tiebreak in the rating sort', () => {
    const out = applyListing(entries, parseFilters({ sort_by: 'rating' }), ctx(new Map([['c', 1], ['b', 3]])));
    expect(out.items.map((b) => b.id).slice(0, 2)).toEqual(['c', 'a']); // equal 90%: c is a partner
    expect(out.items.map((b) => b.id).slice(2)).toEqual(['b', 'd']); // unrated: b's tier breaks the tie
  });
});

describe('rankPros (the pros under an answer)', () => {
  const SHARON = 'region-sharon';
  const NATIONWIDE = 'region-all';
  const pros = [
    { id: 'p1', name: 'א', regionIds: [SHARON], ratingPercent: 80, reviewCount: 4, sortOrder: 1 },
    { id: 'p2', name: 'ב', regionIds: [NATIONWIDE], ratingPercent: 95, reviewCount: 30, sortOrder: 2 },
    { id: 'p3', name: 'ג', regionIds: ['region-south'], ratingPercent: 90, reviewCount: 10, isFeatured: true, sortOrder: 3 },
    { id: 'p4', name: 'ד', regionIds: [SHARON], ratingPercent: null, reviewCount: 0, sortOrder: 4 },
  ];
  const base = { regionId: SHARON, nationwideRegionIds: new Set([NATIONWIDE]) };

  it('scores region fit, reputation and the featured pick', () => {
    const out = rankPros(pros, base);
    expect(out.map((p) => [p.id, p.matchScore])).toEqual([
      ['p1', 30 + 80 * 0.3 + 4 * 0.5], // 56
      ['p2', 15 + 95 * 0.3 + MATCH_WEIGHTS.reviewCap * 0.5], // 53.5
      ['p3', 90 * 0.3 + 10 * 0.5 + 5], // 37
      ['p4', 30], // 30
    ]);
    expect(out.every((p) => p.tierRank === 0 && !p.boosted)).toBe(true);
  });

  it('boosts partners by tier and marks who moved up', () => {
    const out = rankPros(pros, { ...base, tierRanks: new Map([['p4', 3]]) });
    expect(out[0]).toMatchObject({ id: 'p4', matchScore: 30 + 36, tierRank: 3, boosted: true });
    expect(out.slice(1).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    // A partner already on top isn't "boosted".
    expect(rankPros(pros, { ...base, tierRanks: new Map([['p1', 1]]) })[0]).toMatchObject({ id: 'p1', boosted: false });
  });

  it('limits and falls back to the directory order on ties', () => {
    const tie = [
      { id: 'x', name: 'ב', sortOrder: 2 },
      { id: 'y', name: 'א', sortOrder: 2 },
      { id: 'z', name: 'ג', sortOrder: 1 },
    ];
    expect(rankPros(tie, { limit: 2 }).map((p) => p.id)).toEqual(['z', 'y']);
    expect(rankPros([], { limit: 3 })).toEqual([]);
  });
});
