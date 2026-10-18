import { describe, expect, it } from 'vitest';
import {
  ABOUT_MIN_CHARS,
  EMPTY_METRICS,
  parseMetrics,
  parsePeerRank,
  portalKpis,
  profileCompleteness,
  trend,
  type CompletenessInput,
} from '@/lib/revenue/portal';

const full: CompletenessInput = {
  logoUrl: 'https://x/logo.png',
  tagline: 'שלד ובטון בכל הצפון',
  about: 'א'.repeat(ABOUT_MIN_CHARS),
  galleryCount: 8,
  specialtyCount: 2,
  hasPrimarySpecialty: true,
  regionCount: 3,
  phone: '0501234567',
  whatsapp: null,
  leadEmail: 'leads@x.co',
  website: 'https://x.co',
  reviewCount: 5,
};

describe('profileCompleteness', () => {
  it('scores a complete profile 100 with nothing next', () => {
    const c = profileCompleteness(full);
    expect(c.score).toBe(100);
    expect(c.items.every((i) => i.done)).toBe(true);
    expect(c.next).toBeNull();
    expect(c.items.reduce((s, i) => s + i.weight, 0)).toBe(100);
  });

  it('points at the heaviest missing item first, with where to fix it', () => {
    const c = profileCompleteness({ ...full, galleryCount: 2, website: null, about: 'קצר' }, '/business/x/review/');
    expect(c.score).toBe(100 - 15 - 15 - 5);
    expect(c.next).toMatchObject({ key: 'about', href: '#details' });
    expect(c.items.find((i) => i.key === 'gallery')).toMatchObject({ done: false, href: '#media' });
    expect(profileCompleteness({ ...full, reviewCount: 0 }, '/business/x/review/').items.find((i) => i.key === 'reviews')?.href).toBe('/business/x/review/');
  });

  it('needs a primary specialty, not just a list', () => {
    expect(profileCompleteness({ ...full, hasPrimarySpecialty: false }).items.find((i) => i.key === 'specialties')?.done).toBe(false);
    expect(profileCompleteness({ ...full, whatsapp: null, leadEmail: null }).items.find((i) => i.key === 'reach')?.done).toBe(false);
  });
});

describe('metrics', () => {
  it('computes trends, with "new" when there was nothing before', () => {
    expect(trend(120, 100)).toEqual({ value: 120, previous: 100, pct: 20 });
    expect(trend(5, 0)).toEqual({ value: 5, previous: 0, pct: null });
    expect(trend(0, 0)).toEqual({ value: 0, previous: 0, pct: 0 });
    expect(trend(50, 100).pct).toBe(-50);
  });

  it('coerces the RPC JSON defensively', () => {
    const m = parseMetrics({ profile_views: '42', leads: 3, junk: 1, daily: [{ day: '2026-10-14', views: '7', impressions: 2 }, { nope: 1 }] });
    expect(m.profile_views).toBe(42);
    expect(m.leads).toBe(3);
    expect(m.deals).toBe(0);
    expect(m.daily).toEqual([{ day: '2026-10-14', views: 7, impressions: 2 }]);
    expect(parseMetrics(null)).toEqual(EMPTY_METRICS);
    expect(parsePeerRank({ peers: 9, view_rank: '3', specialty: 'קבלני שלד', median_views: 12.5 })).toMatchObject({ peers: 9, view_rank: 3, median_views: 12.5 });
    expect(parsePeerRank('x')).toMatchObject({ peers: 0 });
  });

  it('builds the four KPI trends', () => {
    const cur = { ...EMPTY_METRICS, profile_views: 300, phone_reveals: 12, leads: 6, category_askers: 40 };
    const prev = { ...EMPTY_METRICS, profile_views: 200, phone_reveals: 12, leads: 0, category_askers: 50 };
    expect(portalKpis(cur, prev)).toEqual({
      views: { value: 300, previous: 200, pct: 50 },
      reveals: { value: 12, previous: 12, pct: 0 },
      leads: { value: 6, previous: 0, pct: null },
      askers: { value: 40, previous: 50, pct: -20 },
    });
  });
});
