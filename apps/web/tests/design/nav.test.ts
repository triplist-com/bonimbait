import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_NAV,
  AI_ENTRY,
  DEFAULT_ADVISOR_NAME,
  FOOTER_COLUMNS,
  LEGAL_LINKS,
  PRIMARY_NAV,
  SECONDARY_NAV,
  SOCIAL_LINKS,
  advisorName,
  aiHref,
  isActivePath,
  isNavItemActive,
  normalizePath,
} from '@/lib/nav';
import * as legacyNav from '@/lib/content/navigation';

const internal = (href: string) => href.startsWith('/');

describe('site navigation config', () => {
  it('has the six primary destinations, in order', () => {
    expect(PRIMARY_NAV.map((i) => [i.label, i.href])).toEqual([
      ['מדריך הבנייה', '/blog/'],
      ['סרטונים ופודקאסט', '/videos/'],
      ['בעלי מקצוע', '/recommended/'],
      ['מחשבון תקציב', '/calculator/'],
      ['ניהול ופיקוח', '/membership-tiers/'],
      ['חנות ההטבות', '/הטבות-לקהילה/'],
    ]);
  });

  it('uses trailing slashes on every internal link (WordPress parity)', () => {
    const links = [
      ...PRIMARY_NAV,
      ...SECONDARY_NAV,
      ...FOOTER_COLUMNS.flatMap((c) => c.links),
      ...LEGAL_LINKS,
      ACCOUNT_NAV.login,
      ACCOUNT_NAV.signup,
      ACCOUNT_NAV.home,
      ACCOUNT_NAV.cart,
      { href: AI_ENTRY.href },
    ];
    for (const l of links.filter((l) => internal(l.href))) expect(l.href.endsWith('/'), l.href).toBe(true);
  });

  it('keeps every live footer link (URL parity)', () => {
    const hrefs = new Set([...FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href)), ...LEGAL_LINKS.map((l) => l.href)]);
    for (const href of [
      '/blog/',
      '/recommended/',
      '/join-us/',
      '/הטבות-לקהילה/',
      '/membership-tiers/',
      '/אודותינו/',
      '/צור-קשר/',
      '/הצטרפו-לקבוצות-הווטסאפ/',
      '/login/',
      '/signup/',
      '/תקנון-האתר/',
      '/מדיניות-פרטיות/',
      '/בונים-בית-tv/',
      '/search/',
      '/calculator/',
      '/strategic-partners/',
      'https://open.spotify.com/show/54ad9OeT6XsRf8ZtUtC4Su',
      'https://www.youtube.com/channel/UCCehs0A1gUmOUtZIhvkXVJQ',
    ]) {
      expect(hrefs.has(href), href).toBe(true);
    }
    expect(SOCIAL_LINKS.map((s) => s.id)).toEqual(['youtube', 'facebook', 'instagram', 'tiktok', 'spotify']);
  });

  it('points "הבית שלי" at /account/ for now', () => {
    expect(ACCOUNT_NAV.home).toEqual({ label: 'הבית שלי', href: '/account/' });
  });

  it('builds AI entry links from config', () => {
    expect(aiHref()).toBe('/search/');
    expect(aiHref('  ')).toBe('/search/');
    expect(aiHref('כמה עולה שלד?')).toBe(`/search/?q=${encodeURIComponent('כמה עולה שלד?')}`);
    expect(aiHref('x', { href: '/ask/', queryParam: 'question' })).toBe('/ask/?question=x');
  });

  it('reads the advisor display name from NEXT_PUBLIC_ADVISOR_NAME', () => {
    expect(DEFAULT_ADVISOR_NAME).toBe('שאלו את בונים בית');
    expect(advisorName(undefined)).toBe(DEFAULT_ADVISOR_NAME);
    expect(advisorName('  ')).toBe(DEFAULT_ADVISOR_NAME);
    expect(advisorName('שאלו את תומר')).toBe('שאלו את תומר');
  });

  it('detects the active item, including Hebrew and child routes', () => {
    expect(normalizePath('/%D7%90%D7%95%D7%93%D7%95%D7%AA%D7%99%D7%A0%D7%95/')).toBe('/אודותינו');
    expect(isActivePath('/blog/', '/blog/')).toBe(true);
    expect(isActivePath('/blog/page/2/', '/blog/')).toBe(true);
    expect(isActivePath('/blogger/', '/blog/')).toBe(false);
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/blog/', '/')).toBe(false);
    expect(isActivePath(null, '/blog/')).toBe(false);
    const pros = PRIMARY_NAV.find((i) => i.id === 'pros')!;
    expect(isNavItemActive('/business/%D7%A2%D7%A0%D7%91%D7%A8/', pros)).toBe(true);
    const guide = PRIMARY_NAV.find((i) => i.id === 'guide')!;
    expect(isNavItemActive('/category/שלב-שלד/', guide)).toBe(true);
    expect(isNavItemActive('/categoryx/', guide)).toBe(false);
  });

  it('keeps the old lib/content/navigation exports working', () => {
    expect(legacyNav.HEADER_NAV.map((l) => l.href)).toEqual(PRIMARY_NAV.map((i) => i.href));
    expect(legacyNav.AUTH_LINKS.account).toBe('/account/');
    expect(legacyNav.FOOTER_COLUMNS.at(-1)?.links).toEqual(LEGAL_LINKS);
    expect(legacyNav.COMMUNITY_STATS).toHaveLength(4);
    expect(typeof legacyNav.isActivePath).toBe('function');
  });
});
