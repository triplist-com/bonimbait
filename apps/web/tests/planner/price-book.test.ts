import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import seed from '@/lib/planner/price-book.seed.json';
import { DEFAULT_PRICE_BOOK, withDefaults } from '@/lib/planner/defaults';
import { priceBookSchema, validatePriceBook } from '@/lib/planner/schema';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { BUILD_STAGES } from '@/lib/stages';
import { EXTRA_IDS, FINISH_LEVEL_IDS, type PriceBook } from '@/lib/planner/types';

const MIGRATION = fileURLToPath(
  new URL('../../../../supabase/migrations/20261014124000_growth_planner_price_book.sql', import.meta.url),
);

function clone(): PriceBook {
  return JSON.parse(JSON.stringify(DEFAULT_PRICE_BOOK)) as PriceBook;
}

describe('the seeded price book', () => {
  it('is valid', () => {
    const res = priceBookSchema.safeParse(seed);
    expect(res.success, JSON.stringify(res.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('is the seed row of the migration, byte for byte as JSON', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const m = /\$seed\$([\s\S]*?)\$seed\$::jsonb/.exec(sql);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(seed);
    expect(sql).toContain(`date '${seed.validAsOf}'`);
  });

  it('migration is idempotent and append-only', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toMatch(/create table if not exists public\.planner_price_book/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/where not exists \(select 1 from public\.planner_price_book\)/);
    expect(sql).not.toMatch(/for update|for delete/i);
  });

  it('carries the owner\'s 2026 anchors', () => {
    expect(DEFAULT_PRICE_BOOK.finishLevels.standard.perM2Agorot).toBe(1_300_000); // ₪13,000/m²
    expect(DEFAULT_PRICE_BOOK.vatRatePct).toBe(18);
    expect(DEFAULT_PRICE_BOOK.rangePct).toBe(15);
    expect(DEFAULT_PRICE_BOOK.validAsOf.startsWith('2026')).toBe(true);
  });

  it('prices every finish level, extra, stage and member region', () => {
    for (const id of FINISH_LEVEL_IDS) expect(DEFAULT_PRICE_BOOK.finishLevels[id].perM2Agorot).toBeGreaterThan(0);
    for (const id of EXTRA_IDS) expect(DEFAULT_PRICE_BOOK.extras[id].amountAgorot).toBeGreaterThan(0);
    for (const s of BUILD_STAGES) {
      expect(DEFAULT_PRICE_BOOK.stageSplitPct[s.id]).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_PRICE_BOOK.timelineMonths[s.id]).toHaveLength(2);
    }
    for (const r of MEMBER_REGIONS) expect(DEFAULT_PRICE_BOOK.regionFactors[r.slug]).toBeGreaterThan(0);
  });

  it('dates and sources every figure: primary sources are 2026 articles and podcasts', () => {
    const primary = DEFAULT_PRICE_BOOK.sources.filter((s) => s.primary);
    expect(primary.map((s) => s.id)).toEqual(['article-cost-2026', 'podcast-107', 'podcast-109', 'article-execution-2026']);
    for (const s of DEFAULT_PRICE_BOOK.sources) expect(s.date.startsWith('2026')).toBe(true);
    const ep109 = DEFAULT_PRICE_BOOK.sources.find((s) => s.id === 'podcast-109')!;
    expect(ep109).toMatchObject({ youtubeId: 'vluNH7GTkU4', startSec: 1714, href: '/video/vluNH7GTkU4/?t=1714' });
    for (const id of FINISH_LEVEL_IDS) expect(DEFAULT_PRICE_BOOK.finishLevels[id].note.length).toBeGreaterThan(10);
    for (const id of EXTRA_IDS) expect(DEFAULT_PRICE_BOOK.extras[id].note.length).toBeGreaterThan(10);
  });
});

describe('validatePriceBook', () => {
  it('rejects a split that does not sum to 100', () => {
    const b = clone();
    b.stageSplitPct.frame = 40;
    const res = validatePriceBook(b);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0].message).toContain('100%');
  });

  it('rejects out-of-range factors, bad dates and reversed ranges', () => {
    const cases: Array<(b: PriceBook) => void> = [
      (b) => (b.regionFactors.south = 3),
      (b) => (b.floorShellFactors['1'] = 0.1),
      (b) => (b.validAsOf = '2026-13-40'),
      (b) => (b.movingInPerM2Agorot.min = 900_000),
      (b) => (b.contingencyPct.withBudget = [9, 2]),
      (b) => (b.timelineMonths.frame = [8, 3]),
      (b) => (b.finishLevels.basic.perM2Agorot = 50),
      (b) => (b.sources = []),
      (b) => (b.sources[1].href = 'javascript:alert(1)'),
    ];
    for (const mutate of cases) {
      const b = clone();
      mutate(b);
      expect(validatePriceBook(b).ok).toBe(false);
    }
  });

  it('completes an older stored book from the defaults', () => {
    const b = clone() as Partial<PriceBook>;
    const stored = { ...b, regionFactors: { center: 1.1 } } as PriceBook;
    const merged = withDefaults(stored);
    expect(merged.regionFactors.center).toBe(1.1);
    expect(merged.regionFactors.south).toBe(1.05);
  });
});
