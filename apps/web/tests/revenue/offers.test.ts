import { describe, expect, it } from 'vitest';
import { OFFER_WEIGHTS, isCampaignLive, matchOffers, type OfferCampaign } from '@/lib/revenue/offers';
import { campaignDates, isInternalPath, parseCampaignForm } from '@/lib/revenue/campaign-form';

const NOW = new Date('2026-10-15T09:00:00.000Z');
const BIZ = '11111111-1111-4111-8111-111111111111';

let n = 0;
const campaign = (over: Partial<OfferCampaign> = {}): OfferCampaign => ({
  id: `c${++n}`,
  business_id: BIZ,
  status: 'active',
  starts_at: null,
  ends_at: null,
  topics: [],
  stages: [],
  region_slugs: [],
  placements: [],
  priority: 0,
  created_at: `2026-10-0${Math.min(9, n)}T00:00:00Z`,
  ...over,
});

describe('matchOffers', () => {
  it('only shows live campaigns', () => {
    expect(isCampaignLive(campaign(), NOW)).toBe(true);
    expect(isCampaignLive(campaign({ status: 'paused' }), NOW)).toBe(false);
    expect(isCampaignLive(campaign({ starts_at: '2026-10-16T00:00:00Z' }), NOW)).toBe(false);
    expect(isCampaignLive(campaign({ ends_at: '2026-10-15T09:00:00.000Z' }), NOW)).toBe(false);
    expect(isCampaignLive(campaign({ starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' }), NOW)).toBe(true);
  });

  it('matches the topic from free text, a specialty slug or a topic key', () => {
    const windows = campaign({ topics: ['windows'] });
    expect(matchOffers([windows], { topic: 'כמה עולים חלונות אלומיניום?' }, { now: NOW })).toHaveLength(1);
    expect(matchOffers([windows], { topic: 'קבלני-אלומיניום' }, { now: NOW })[0]).toMatchObject({ topics: ['windows'] });
    expect(matchOffers([windows], { topic: 'windows' }, { now: NOW })).toHaveLength(1);
    expect(matchOffers([windows], { topic: 'איך בוחרים אדריכל' }, { now: NOW })).toHaveLength(0);
    // A targeted campaign never shows where the topic is unknown.
    expect(matchOffers([windows], {}, { now: NOW })).toHaveLength(0);
  });

  it('requires a known stage, region and placement when targeted', () => {
    const c = campaign({ stages: ['permit'], region_slugs: ['sharon'], placements: ['article'] });
    expect(matchOffers([c], { stage: 'permit', region: 'sharon', placement: 'article' }, { now: NOW })).toHaveLength(1);
    expect(matchOffers([c], { stage: 'frame', region: 'sharon', placement: 'article' }, { now: NOW })).toHaveLength(0);
    expect(matchOffers([c], { stage: 'permit', region: null, placement: 'article' }, { now: NOW })).toHaveLength(0);
    expect(matchOffers([c], { stage: 'permit', region: 'sharon', placement: 'video' }, { now: NOW })).toHaveLength(0);
  });

  it('prefers the most specific offer, then priority, then the higher tier', () => {
    const broad = campaign({ id: 'broad', priority: 20 });
    const topical = campaign({ id: 'topical', topics: ['windows'] });
    const local = campaign({ id: 'local', topics: ['windows'], region_slugs: ['sharon'], business_id: 'other' });
    const ctx = { topic: 'חלונות', region: 'sharon' };
    expect(matchOffers([broad, topical, local], ctx, { now: NOW }).map((m) => [m.campaign.id, m.score])).toEqual([
      ['local', OFFER_WEIGHTS.topic + OFFER_WEIGHTS.region],
      ['topical', OFFER_WEIGHTS.topic],
      ['broad', 20],
    ]);
    // A tier lifts an equally specific offer.
    const ranked = matchOffers([topical, campaign({ id: 'partner', topics: ['windows'], business_id: 'p2' })], ctx, {
      now: NOW,
      tierRanks: new Map([['p2', 3]]),
    });
    expect(ranked[0].campaign.id).toBe('partner');
    expect(matchOffers([broad, topical], ctx, { now: NOW, limit: 1 })).toHaveLength(1);
  });
});

describe('parseCampaignForm', () => {
  const good = {
    business_id: BIZ,
    name: 'חלונות בשלב היתר',
    status: 'active',
    starts_on: '2026-10-01',
    ends_on: '2026-10-31',
    topics: ['windows', 'nope'],
    stages: ['permit'],
    region_slugs: ['sharon'],
    placements: ['article', 'video', 'billboard'],
    headline: '10% הנחה לבוני בונים בית',
    body: '',
    cta_label: '',
    target_url: '/product/חלונות/',
    image_url: '',
    priority: '5',
  };

  it('builds the row with Israel-midnight dates and an inclusive end', () => {
    const res = parseCampaignForm(good);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.campaign).toMatchObject({
      topics: ['windows'],
      placements: ['article', 'video'],
      cta_label: 'לפרטים',
      body: null,
      image_url: null,
      priority: 5,
      starts_at: '2026-09-30T21:00:00.000Z',
      ends_at: '2026-10-31T22:00:00.000Z', // Nov 1 00:00 Israel (winter time): the 31st is included
    });
    expect(campaignDates(res.campaign)).toEqual({ starts_on: '2026-10-01', ends_on: '2026-10-31' });
  });

  it('keeps offers on our own site and validates the rest', () => {
    expect(isInternalPath('/business/x/')).toBe(true);
    expect(isInternalPath('//evil.example/')).toBe(false);
    expect(isInternalPath('https://evil.example/')).toBe(false);
    const res = parseCampaignForm({ ...good, target_url: 'https://evil.example/', image_url: 'http://x', ends_on: '2026-09-01', priority: '500', business_id: 'x' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.fieldErrors).sort()).toEqual(['business_id', 'ends_on', 'image_url', 'priority', 'target_url']);
  });
});
