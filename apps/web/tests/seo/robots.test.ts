import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageRobots, siteNoindex } from '@/lib/seo/robots';
import { commerceMetadata } from '@/lib/commerce/seo';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('pageRobots', () => {
  it('indexes and follows by default', () => {
    vi.stubEnv('SITE_NOINDEX', '');
    expect(siteNoindex()).toBe(false);
    expect(pageRobots()).toEqual({ index: true, follow: true });
    expect(pageRobots({ follow: false })).toEqual({ index: true, follow: false });
  });

  it('turns every page to noindex, nofollow when SITE_NOINDEX=true', () => {
    vi.stubEnv('SITE_NOINDEX', 'true');
    expect(siteNoindex()).toBe(true);
    expect(pageRobots()).toEqual({ index: false, follow: false });
    expect(pageRobots({ index: true, follow: true })).toEqual({ index: false, follow: false });
  });

  it('commerce pages follow the flag too', () => {
    vi.stubEnv('SITE_NOINDEX', '');
    expect(commerceMetadata({ title: 'חנות - בונים בית', path: '/shop/' }).robots).toEqual({ index: true, follow: true });
    vi.stubEnv('SITE_NOINDEX', 'true');
    expect(commerceMetadata({ title: 'חנות - בונים בית', path: '/shop/' }).robots).toEqual({ index: false, follow: false });
  });
});
