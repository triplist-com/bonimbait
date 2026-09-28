import { describe, expect, it } from 'vitest';
import { cleanSlug, planSlugRedirect, publicPath, resolveSlug, slugChangeNeedsRedirect, slugify } from '@/lib/admin/slug';
import { resolvePublishState } from '@/lib/admin/publish';
import { toCsv } from '@/lib/admin/csv';
import { dedupePath, safeFileName, uploadFolder } from '@/lib/admin/media';
import { leadFilterFromQuery } from '@/lib/admin/lead-filters';

describe('slugify', () => {
  it('keeps Hebrew and joins words with dashes', () => {
    expect(slugify('איך בוחרים אדריכל? מדריך 2026')).toBe('איך-בוחרים-אדריכל-מדריך-2026');
    expect(slugify('בונים בית "פלוס" – ICF')).toBe('בונים-בית-פלוס-icf');
    expect(slugify('  ')).toBe('');
  });

  it('drops niqqud and geresh', () => {
    expect(slugify('מַמ"ד')).toBe('ממד');
  });

  it('cleans typed slugs, including page paths', () => {
    expect(cleanSlug('/%D7%90%D7%91/')).toBe('אב');
    expect(cleanSlug('parent/Child Page', { allowSlash: true })).toBe('parent/child-page');
    expect(cleanSlug('parent/child')).toBe('parent-child');
  });

  it('never rewrites an unchanged migrated slug', () => {
    const legacy = '🔴-live-בונים-בית-טיפים-לעלויות-בניה-ותקצי';
    expect(resolveSlug(legacy, { existing: legacy, fallback: 'x' })).toBe(legacy);
    expect(resolveSlug('', { existing: 'pinkas_kablanim', fallback: 'x' })).toBe('pinkas_kablanim');
    expect(resolveSlug('New Slug', { existing: 'pinkas_kablanim', fallback: 'x' })).toBe('new-slug');
    expect(resolveSlug('', { fallback: 'כותרת חדשה' })).toBe('כותרת-חדשה');
  });

  it('builds public paths', () => {
    expect(publicPath('post', 'א')).toBe('/א/');
    expect(publicPath('video', 'v')).toBe('/video/v/');
    expect(publicPath('business', 'b')).toBe('/business/b/');
  });
});

describe('slug change -> 301', () => {
  it('offers a redirect only when a published slug changes', () => {
    expect(slugChangeNeedsRedirect({ oldSlug: 'a', newSlug: 'b', wasPublished: true })).toBe(true);
    expect(slugChangeNeedsRedirect({ oldSlug: 'a', newSlug: 'b', wasPublished: false })).toBe(false);
    expect(slugChangeNeedsRedirect({ oldSlug: 'a', newSlug: 'A', wasPublished: true })).toBe(false);
    expect(slugChangeNeedsRedirect({ oldSlug: null, newSlug: 'b', wasPublished: true })).toBe(false);
  });

  it('creates old -> new with a normalized source', () => {
    const plan = planSlugRedirect('/ישן/', '/חדש/', []);
    expect(plan.upsert).toEqual({ fromPath: '/ישן', toPath: '/חדש/' });
    expect(plan.retarget).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('re-points rules that targeted the old URL (no chains)', () => {
    const plan = planSlugRedirect('/b/', '/c/', [
      { id: '1', from_path: '/a', to_path: '/b/', is_active: true },
      { id: '2', from_path: '/x', to_path: '/%D7%90/', is_active: true },
      { id: '3', from_path: '/y', to_path: 'https://example.com/b/', is_active: true },
    ]);
    expect(plan.retarget).toEqual([{ id: '1', toPath: '/c/' }]);
  });

  it('matches encoded and decoded Hebrew targets', () => {
    const plan = planSlugRedirect('/א/', '/ב/', [{ id: '2', from_path: '/x', to_path: '/%D7%90/', is_active: true }]);
    expect(plan.retarget).toEqual([{ id: '2', toPath: '/ב/' }]);
  });

  it('removes rules from the new URL that would shadow it (renaming back)', () => {
    const plan = planSlugRedirect('/b/', '/a/', [{ id: '1', from_path: '/a', to_path: '/b/', is_active: true }]);
    expect(plan.remove).toEqual(['1']);
    expect(plan.retarget).toEqual([]);
    expect(plan.upsert).toEqual({ fromPath: '/b', toPath: '/a/' });
  });

  it('does nothing when the path is unchanged or the home page', () => {
    expect(planSlugRedirect('/a/', '/A', []).upsert).toBeNull();
    expect(planSlugRedirect('/', '/a/', []).upsert).toBeNull();
  });
});

describe('publish state', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  it('schedules with a future date', () => {
    expect(resolvePublishState('scheduled', '2026-10-01T09:00:00.000Z', null, now)).toEqual({ status: 'published', published_at: '2026-10-01T09:00:00.000Z' });
    expect(() => resolvePublishState('scheduled', '2026-09-01T09:00:00.000Z', null, now)).toThrow();
    expect(() => resolvePublishState('scheduled', null, null, now)).toThrow();
  });
  it('publishes now, keeps an existing date, never in the future', () => {
    expect(resolvePublishState('published', null, null, now).published_at).toBe(now.toISOString());
    expect(resolvePublishState('published', null, { status: 'draft', published_at: '2021-01-01T00:00:00Z' }, now).published_at).toBe('2021-01-01T00:00:00Z');
    expect(resolvePublishState('published', '2030-01-01T00:00:00Z', null, now).published_at).toBe(now.toISOString());
  });
  it('rejects unknown statuses', () => {
    expect(() => resolvePublishState('deleted', null, null, now)).toThrow();
  });
});

describe('csv, media paths, lead filters', () => {
  it('writes Excel-safe CSV', () => {
    const csv = toCsv(['שם', 'הערה'], [['דני', 'שלום, "עולם"'], ['=cmd', -5]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"שלום, ""עולם"""');
    expect(csv).toContain("'=cmd,-5");
  });

  it('stores uploads under uploads/YYYY/MM with safe names', () => {
    expect(uploadFolder(new Date('2026-09-28T23:30:00Z'))).toBe('uploads/2026/09');
    expect(uploadFolder(new Date('2026-09-30T22:30:00Z'))).toBe('uploads/2026/10'); // Israel time
    expect(safeFileName('My Photo (1).JPG')).toBe('my-photo-1.jpg');
    expect(safeFileName('תמונה.png', 1)).toBe('image-1.png');
    expect(dedupePath('uploads/2026/09/a.jpg', 35)).toBe('uploads/2026/09/a-z.jpg');
  });

  it('maps workflow statuses to legacy DB values and ignores junk', () => {
    expect(leadFilterFromQuery({ status: 'contacted', type: 'contact', from: '2026-01-01', to: 'bad' })).toEqual({
      status: ['contacted', 'in_progress'],
      type: 'contact',
      from: '2026-01-01',
    });
    expect(leadFilterFromQuery({ type: 'nope', business: 'x' })).toEqual({});
  });
});
