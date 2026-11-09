import { describe, expect, it } from 'vitest';
import { mergeForSort, mergeNewestFirst, runtimeKind, stageCategories, withoutEmbedded } from '@/lib/autopilot/listing';

const d = (published_at: string | null, id: string, view_count = 0) => ({ id, published_at, view_count });
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

describe('runtimeKind', () => {
  it('reads podcasts from the title', () => {
    expect(runtimeKind('פודקאסט פרק 95 - מטבחים')).toBe('podcast');
    expect(runtimeKind('התקנת סיפון - אפשרי לבד?!')).toBe('video');
  });
});

describe('stageCategories', () => {
  it('maps the summary stage to the hub stage category', () => {
    expect(stageCategories('frame')).toEqual([{ name: 'שלב שלד', slug: 'שלב-שלד' }]);
    expect(stageCategories('finishing')).toEqual([{ name: 'שלב גמרים', slug: 'שלב-גמרים' }]);
    expect(stageCategories('renovation')).toEqual([{ name: 'שיפוצים', slug: 'שיפוצים' }]);
  });

  it('is empty for stages without a hub section', () => {
    expect(stageCategories(null)).toEqual([]);
    expect(stageCategories('design')).toEqual([]);
  });
});

describe('mergeNewestFirst', () => {
  const date = (x: { published_at: string | null }) => x.published_at;

  it('interleaves by date and keeps each list in its own order', () => {
    const legacy = [d('2026-10-01', 'L1'), d('2026-03-01', 'L2')];
    const runtime = [d('2026-11-08T19:00:00Z', 'R1'), d('2026-05-01T10:00:00+00:00', 'R2')];
    expect(ids(mergeNewestFirst(legacy, runtime, date, date))).toEqual(['R1', 'L1', 'R2', 'L2']);
  });

  it('puts the existing list first on ties and undated items last', () => {
    const legacy = [d('2026-10-01', 'L1'), d(null, 'L2')];
    const runtime = [d('2026-10-01', 'R1'), d(null, 'R2')];
    expect(ids(mergeNewestFirst(legacy, runtime, date, date))).toEqual(['L1', 'R1', 'L2', 'R2']);
  });

  it('handles empty lists', () => {
    expect(mergeNewestFirst([], [d('2026-01-01', 'R')], date, date)).toHaveLength(1);
    expect(mergeNewestFirst([d('2026-01-01', 'L')], [], date, date)).toHaveLength(1);
  });
});

describe('mergeForSort', () => {
  const runtime = [d('2026-11-08T19:00:00Z', 'R1'), d('2026-10-14T19:00:00Z', 'R2')];

  it('newest: runtime videos slot in by date', () => {
    const statics = [d('2026-10-20', 'S1', 50), d('2026-10-11', 'S2', 900)];
    expect(ids(mergeForSort(statics, runtime, 'newest'))).toEqual(['R1', 'S1', 'R2', 'S2']);
  });

  it('oldest: the same order read the other way', () => {
    const statics = [d('2026-10-11', 'S2', 900), d('2026-10-20', 'S1', 50)];
    expect(ids(mergeForSort(statics, runtime, 'oldest'))).toEqual(['S2', 'R2', 'S1', 'R1']);
  });

  it('popular: runtime videos (no view counts) come last', () => {
    const statics = [d('2026-10-11', 'S2', 900), d('2026-10-20', 'S1', 50)];
    expect(ids(mergeForSort(statics, runtime, 'popular'))).toEqual(['S2', 'S1', 'R1', 'R2']);
  });
});

describe('withoutEmbedded', () => {
  it('drops runtime videos a legacy page already embeds', () => {
    const items = [{ youtube_id: 'JFnOeDtyeIs' }, { youtube_id: 'A4v1KhJAi34' }];
    expect(withoutEmbedded(items, ['A4v1KhJAi34', null, undefined])).toEqual([{ youtube_id: 'JFnOeDtyeIs' }]);
    expect(withoutEmbedded(items, [])).toEqual(items);
  });
});
