/**
 * A partner tier "paid" with the mock provider never features a business on
 * production (lib/revenue/badges.ts countsPublicly; partner_badges.is_mock).
 * Mock payments themselves are refused on every Vercel deployment
 * (tests/commerce/production-guard.test.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countsPublicly, loadPartnerBadges } from '@/lib/revenue/badges';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('countsPublicly', () => {
  it('drops mock-paid tiers on production only', () => {
    expect(countsPublicly({ is_mock: true }, { VERCEL_ENV: 'production' })).toBe(false);
    expect(countsPublicly({ is_mock: false }, { VERCEL_ENV: 'production' })).toBe(true);
    expect(countsPublicly({ is_mock: true }, { VERCEL_ENV: 'preview' })).toBe(true);
    expect(countsPublicly({ is_mock: true }, {})).toBe(true);
    expect(countsPublicly({}, { VERCEL_ENV: 'production' })).toBe(true);
  });
});

describe('loadPartnerBadges', () => {
  const rows = [
    { business_id: 'b-real', tier_slug: 'partners', tier_name: 'שותפים', badge_label: 'שותף', rank: 2, is_mock: false },
    { business_id: 'b-mock', tier_slug: 'ambassadors', tier_name: 'שגרירים', badge_label: 'שגריר', rank: 3, is_mock: true },
  ];
  const db = { from: () => ({ select: async () => ({ data: rows, error: null }) }) };

  it('leaves mock-paid tiers out of the public badges on production', async () => {
    vi.stubEnv('FLAG_REVENUE', 'true');
    vi.stubEnv('VERCEL_ENV', 'production');
    const badges = await loadPartnerBadges(db as never);
    expect(Array.from(badges.keys())).toEqual(['b-real']);
  });

  it('keeps them elsewhere (local, preview demos)', async () => {
    vi.stubEnv('FLAG_REVENUE', 'true');
    vi.stubEnv('VERCEL_ENV', '');
    const badges = await loadPartnerBadges(db as never);
    expect(Array.from(badges.keys()).sort()).toEqual(['b-mock', 'b-real']);
  });
});
