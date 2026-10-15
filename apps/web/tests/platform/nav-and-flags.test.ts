import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, adminNavFor, isAdminNavActive, type AdminNavGroup } from '@/lib/admin/nav';
import { FLAGS, allFlags, flagEnvName, isEnabled, parseFlagValue } from '@/lib/flags';
import { PLATFORM_NAV, isPlatformNavActive } from '@/lib/platform/nav';

const hrefs = (groups: AdminNavGroup[]) => groups.flatMap((g) => g.items.map((i) => i.href));

describe('admin nav config', () => {
  it('keeps every screen of the previous hard-coded sidebar', () => {
    // Superset check: squads add screens (e.g. /admin/autopilot/), but none may disappear.
    expect(hrefs(adminNavFor('admin'))).toEqual(expect.arrayContaining([
      '/admin/',
      '/admin/posts/',
      '/admin/taxonomy/',
      '/admin/pages/',
      '/admin/videos/',
      '/admin/media/',
      '/admin/directory/businesses/',
      '/admin/directory/ranking/',
      '/admin/directory/reviews/',
      '/admin/directory/requests/',
      '/admin/directory/taxonomy/',
      '/admin/leads/',
      '/admin/commerce/products/',
      '/admin/commerce/categories/',
      '/admin/commerce/plans/',
      '/admin/commerce/orders/',
      '/admin/redirects/',
      '/admin/members/',
      '/admin/search-stats/',
    ]));
  });

  it('hides admin-only screens from editors and everything from non-staff', () => {
    const editor = hrefs(adminNavFor('editor'));
    expect(editor).not.toContain('/admin/members/');
    expect(editor).not.toContain('/admin/search-stats/');
    expect(editor).toContain('/admin/leads/');
    expect(adminNavFor('member')).toEqual([]);
    expect(adminNavFor('pro')).toEqual([]);
  });

  it('hides flagged items until their flag is on, and drops empty groups', () => {
    const nav: AdminNavGroup[] = [
      ...ADMIN_NAV,
      { id: 'command', title: 'מרכז שליטה', items: [{ href: '/admin/command/', label: 'מרכז שליטה', flag: 'commandCenter' }] },
    ];
    expect(adminNavFor('admin', () => false, nav).some((g) => g.id === 'command')).toBe(false);
    expect(hrefs(adminNavFor('admin', (f) => f === 'commandCenter', nav))).toContain('/admin/command/');
  });

  it('uses unique, trailing-slash hrefs and unique group ids', () => {
    const all = hrefs([...ADMIN_NAV]);
    expect(new Set(all).size).toBe(all.length);
    for (const h of all) expect(h).toMatch(/^\/admin\/([a-z-]+\/)*$/);
    expect(new Set(ADMIN_NAV.map((g) => g.id)).size).toBe(ADMIN_NAV.length);
  });

  it('marks the active item (exact for the dashboard)', () => {
    expect(isAdminNavActive('/admin/', { href: '/admin/', exact: true })).toBe(true);
    expect(isAdminNavActive('/admin/leads/', { href: '/admin/', exact: true })).toBe(false);
    expect(isAdminNavActive('/admin/leads/abc', { href: '/admin/leads/' })).toBe(true);
    expect(isAdminNavActive('/admin/leads', { href: '/admin/leads/' })).toBe(true);
    expect(isAdminNavActive('/admin/leadsx/', { href: '/admin/leads/' })).toBe(false);
  });
});

describe('platform nav', () => {
  it('links the overview, the tour, the demos and the design system', () => {
    expect(PLATFORM_NAV.map((i) => i.href)).toEqual(['/platform/', '/platform/tour/', '/platform/demo/', '/platform/design-system/']);
    expect(PLATFORM_NAV.map((i) => i.label)).toEqual(['סקירה', 'סיור', 'הדגמות', 'מערכת עיצוב']);
    const [overview, tour, demos] = PLATFORM_NAV;
    expect(isPlatformNavActive('/platform/', overview)).toBe(true);
    expect(isPlatformNavActive('/platform/tour/', overview)).toBe(false);
    expect(isPlatformNavActive('/platform/tour/', tour)).toBe(true);
    expect(isPlatformNavActive('/platform/demo/foundation/', overview)).toBe(false);
    expect(isPlatformNavActive('/platform/demo/foundation/', demos)).toBe(true);
  });
});

describe('feature flags', () => {
  it('names env vars FLAG_<UPPER_SNAKE>', () => {
    expect(flagEnvName('analytics')).toBe('FLAG_ANALYTICS');
    expect(flagEnvName('aiAnswers')).toBe('FLAG_AI_ANSWERS');
    expect(flagEnvName('programmaticSeo')).toBe('FLAG_PROGRAMMATIC_SEO');
  });

  it('parses booleans and falls back to the default', () => {
    expect(parseFlagValue('TRUE')).toBe(true);
    expect(parseFlagValue(' on ')).toBe(true);
    expect(parseFlagValue('0')).toBe(false);
    expect(parseFlagValue('no')).toBe(false);
    expect(parseFlagValue('maybe')).toBeUndefined();
    expect(parseFlagValue(undefined)).toBeUndefined();
    expect(isEnabled('analytics', {})).toBe(true);
    expect(isEnabled('hub', {})).toBe(false);
    expect(isEnabled('hub', { FLAG_HUB: '1' })).toBe(true);
    expect(isEnabled('analytics', { FLAG_ANALYTICS: 'off' })).toBe(false);
    expect(isEnabled('analytics', { FLAG_ANALYTICS: 'garbage' })).toBe(true);
  });

  it('snapshots every flag; ops switches default on, dark launches off', () => {
    const snap = allFlags({});
    expect(Object.keys(snap).sort()).toEqual(Object.keys(FLAGS).sort());
    expect(snap.analytics && snap.aiAnswers).toBe(true);
    for (const name of ['advisor', 'hub', 'revenue', 'commandCenter', 'budgetPlanner', 'programmaticSeo', 'autopilot'] as const) {
      expect(snap[name], name).toBe(false);
    }
  });
});
