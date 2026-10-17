/**
 * Integration (advisor -> revenue): the pros under an answer are ordered by
 * the revenue squad's rankPros(), so a partner tier lifts a pro within
 * relevance (region fit, reputation) and the badge says why.
 */
import { describe, expect, it } from 'vitest';
import { answerOfferContext } from '@/lib/advisor/offer';
import { rankAnswerPros, type ProRow } from '@/lib/advisor/pros-rank';
import { matchOffers } from '@/lib/revenue/offers';
import type { PartnerBadge } from '@/lib/revenue/tiers';

const SHARON = 'r-sharon';
const NATIONWIDE = 'r-all';

function row(id: string, over: Partial<ProRow> = {}): ProRow {
  return { id, slug: id, name: `עסק ${id}`, tagline: null, city: null, logo_url: null, is_featured: false, sort_order: 0, ...over };
}

const partner = (rank: number): PartnerBadge => ({ tierSlug: `t${rank}`, tierName: `מסלול ${rank}`, badgeLabel: 'שותף בונים בית', rank });

describe('rankAnswerPros', () => {
  const rows = [row('a', { sort_order: 1 }), row('b', { sort_order: 2 }), row('c', { sort_order: 3 }), row('d', { sort_order: 4 })];
  const stats = new Map([
    ['a', { ratingPercent: 90, reviewCount: 20 }],
    ['b', { ratingPercent: 90, reviewCount: 20 }],
    ['c', { ratingPercent: 90, reviewCount: 20 }],
    ['d', { ratingPercent: 90, reviewCount: 20 }],
  ]);

  it('keeps the directory order when nothing else differs', () => {
    const out = rankAnswerPros({ rows, regionsByBusiness: new Map(), statsByBusiness: stats, badges: new Map(), limit: 3 });
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(out.every((p) => p.badge === null && !p.boosted)).toBe(true);
  });

  it('a partner tier lifts a pro among equally relevant pros, with its badge', () => {
    const badges = new Map([['d', partner(2)]]);
    const out = rankAnswerPros({ rows, regionsByBusiness: new Map(), statsByBusiness: stats, badges, limit: 3 });
    expect(out.map((p) => p.id)).toEqual(['d', 'a', 'b']);
    expect(out[0]).toMatchObject({ badge: partner(2), boosted: true });
  });

  it('region fit comes first: an exact-region pro beats a nationwide one, and both beat the rest', () => {
    const regionsByBusiness = new Map([
      ['c', [SHARON]],
      ['b', [NATIONWIDE]],
    ]);
    const out = rankAnswerPros({
      rows,
      regionsByBusiness,
      statsByBusiness: stats,
      badges: new Map(),
      regionId: SHARON,
      nationwideRegionIds: new Set([NATIONWIDE]),
      limit: 3,
    });
    expect(out.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('reputation counts: a better-rated pro outranks a featured one with no reviews', () => {
    const out = rankAnswerPros({
      rows: [row('new', { is_featured: true }), row('known')],
      regionsByBusiness: new Map(),
      statsByBusiness: new Map([['known', { ratingPercent: 95, reviewCount: 12 }]]),
      badges: new Map(),
      limit: 3,
    });
    expect(out.map((p) => p.id)).toEqual(['known', 'new']);
  });
});

describe('answerOfferContext', () => {
  const campaign = {
    id: 'camp-1',
    business_id: 'biz-windows',
    status: 'active',
    starts_at: null,
    ends_at: null,
    topics: ['windows'],
    stages: [] as string[],
    region_slugs: [] as string[],
    placements: ['answer'],
    priority: 0,
    created_at: '2026-10-01T00:00:00.000Z',
  } as const;

  it('reads the topic from the pros specialty and the question, for the answer placement', () => {
    const ctx = answerOfferContext({ query: 'מה חשוב לבדוק בהצעת מחיר?', specialtySlug: 'קבלני-אלומיניום', regionSlug: 'sharon', stage: 'permit' });
    expect(ctx).toEqual({ topic: 'קבלני אלומיניום מה חשוב לבדוק בהצעת מחיר?', stage: 'permit', region: 'sharon', placement: 'answer' });
    expect(matchOffers([{ ...campaign, topics: [...campaign.topics], placements: [...campaign.placements] }], ctx).map((m) => m.campaign.id)).toEqual(['camp-1']);
  });

  it('a question about windows matches without a specialty; a stage-targeted campaign needs the stage', () => {
    const windowsQ = answerOfferContext({ query: 'איזה פרופיל חלונות לבחור?' });
    const c = { ...campaign, topics: [...campaign.topics], placements: [...campaign.placements] };
    expect(matchOffers([c], windowsQ)).toHaveLength(1);
    const staged = { ...c, stages: ['permit'] };
    expect(matchOffers([staged], windowsQ)).toHaveLength(0);
    expect(matchOffers([staged], answerOfferContext({ query: 'איזה פרופיל חלונות לבחור?', stage: 'permit' }))).toHaveLength(1);
  });

  it('an off-topic answer gets no offer', () => {
    const c = { ...campaign, topics: [...campaign.topics], placements: [...campaign.placements] };
    expect(matchOffers([c], answerOfferContext({ query: 'כמה זמן לוקח היתר בנייה?' }))).toHaveLength(0);
  });
});
