import { describe, expect, it } from 'vitest';
import factsJson from '@/data/pitch/facts.json';
import speedJson from '@/data/pitch/speed.json';
import {
  PARTNER_TIERS,
  computeLibraryStats,
  hebrewShortDate,
  libraryPhrase,
  parityRows,
  planPoints,
  roiPrices,
  secondsLabel,
  speedup,
  transcribedShare,
  type PitchFactsFile,
  type SpeedFile,
} from '@/lib/pitch/facts';
import { buildFaq } from '@/lib/pitch/plan';

const facts = factsJson as PitchFactsFile;
const speed = speedJson as SpeedFile;

describe('plan prices', () => {
  const rows = [
    { slug: 'bonim-bait-turnkey', name: 'בונים בית עד מפתח', sort_order: 3, prices: [{ price_agorot: 13_300_000 }, { price_agorot: 14_900_000 }] },
    { slug: 'bonim-budget', name: 'בונים תקציב', sort_order: 1, prices: [{ price_agorot: 690_000 }] },
    { slug: 'bonim-bait-plus', name: 'בונים בית פלוס', sort_order: 2, prices: [{ price_agorot: 2_900_000 }] },
  ];

  it('reads the ladder from service_plans, in order, in whole shekels', () => {
    expect(planPoints(rows).map((p) => [p.slug, p.minNis, p.maxNis])).toEqual([
      ['bonim-budget', 6_900, 6_900],
      ['bonim-bait-plus', 29_000, 29_000],
      ['bonim-bait-turnkey', 133_000, 149_000],
    ]);
  });

  it('falls back to the public prices when the table is empty', () => {
    expect(planPoints([]).map((p) => p.minNis)).toEqual([6_900, 29_000, 133_000]);
  });

  it('prices turnkey at the midpoint for the ROI model', () => {
    expect(roiPrices(planPoints(rows))).toEqual({ budget: 6_900, plus: 29_000, turnkey: 141_000 });
  });

  it('keeps the partner tiers in ascending order', () => {
    const prices = PARTNER_TIERS.map((t) => t.monthlyNis);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

describe('library stats', () => {
  it('counts transcribed videos and hours, and the title-only rest', () => {
    const stats = computeLibraryStats([
      { duration_seconds: 3600, segment_count: 4 },
      { duration_seconds: '1800', has_transcript: 'True' },
      { duration_seconds: 7200, segment_count: 0 },
      { duration_seconds: null },
    ]);
    expect(stats).toEqual({ catalog: 4, catalogHours: 4, transcribed: 2, transcribedHours: 2, titleOnly: 2 }); // 3.5 h and 1.5 h round up
    expect(transcribedShare(stats)).toBe(50);
    expect(transcribedShare(computeLibraryStats([]))).toBe(0);
  });

  it('phrases the channel size for the headline', () => {
    expect(libraryPhrase(994)).toBe('כמעט 1,000');
    expect(libraryPhrase(1_234)).toBe('יותר מ-1,200');
    expect(libraryPhrase(282)).toBe('282');
  });
});

describe('committed facts (counts only)', () => {
  it('carries URL parity that adds up', () => {
    const p = facts.parity;
    expect(p.passed).toBeLessThanOrEqual(p.total);
    expect(Object.values(p.byType).reduce((a, b) => a + b, 0)).toBe(p.total);
    expect(Object.values(p.byResult).reduce((a, b) => a + b, 0)).toBe(p.total);
    expect(p.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('carries channel and migration counts', () => {
    expect(facts.channel.total).toBeGreaterThan(0);
    expect(facts.channel.podcastLatestEpisode).toBeGreaterThan(0);
    expect(facts.migration.counts.posts).toBeGreaterThan(0);
  });

  it('holds no URLs or titles from the raw reports', () => {
    const raw = JSON.stringify(factsJson);
    expect(raw).not.toMatch(/https?:\/\//);
    expect(raw).not.toMatch(/bonimbayit\.co\.il\/[^"]/);
  });

  it('carries a dated, labelled speed measurement', () => {
    expect(speed.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(speed.tool).toMatch(/^Lighthouse \d/);
    expect(speed.runs).toBeGreaterThanOrEqual(1);
    expect(speed.new.label).toContain('next start');
    for (const side of [speed.old, speed.new]) {
      expect(side.lcpMs.simulate).toBeGreaterThan(0);
      expect(side.lcpMs.devtools).toBeGreaterThan(0);
    }
  });
});

describe('display helpers', () => {
  it('formats seconds, speedups and dates', () => {
    expect(secondsLabel(5_315)).toBe('5.3');
    expect(secondsLabel(3_012)).toBe('3.0');
    expect(speedup(5_315, 3_012)).toBe('1.8');
    expect(speedup(0, 3_012)).toBe('1.0');
    expect(hebrewShortDate('2026-09-29')).toBe('29.9.2026');
  });

  it('folds small page types into "אחר"', () => {
    const rows = parityRows({ post: 807, video: 189, business: 159, page: 29, category: 14, author: 3 });
    expect(rows.map((r) => r.key)).toEqual(['post', 'video', 'business', 'page', 'other']);
    expect(rows.at(-1)!.value).toBe(17);
  });

  it('quotes the parity count in the SEO answer', () => {
    const faq = buildFaq({ parityPassed: 1214, parityTotal: 1214 });
    expect(faq.find((f) => f.id === 'seo')!.a).toContain('1,214 מתוך 1,214');
    expect(new Set(faq.map((f) => f.id)).size).toBe(faq.length);
  });
});
